import { Decimal } from 'decimal.js';
import { query, isDemoMode, demoDb, getClient } from '../database';
import {
  getEffectiveDepartmentId, ensureStockRow, updateStockQuantity, logMovement, calculateLossCosts
} from './stock.service';
import { eventBus, Events } from './event.service';

/**
 * Resolve tenant ID for queries.
 * null = platform admin (no filtering) | undefined = no context (default to 1) | number = specific tenant
 */
function resolveTenantFilter(tenantId?: number | null): number | undefined {
  if (tenantId === null) return undefined;
  return tenantId ?? 1;
}

/**
 * Create a new ingredient loss record with full double-loss calculation.
 */
export async function createLoss(
  departmentId: number, ingredientId: number, quantity: number,
  lossReason: string, reportedBy: number | null,
  tenantId?: number | null
): Promise<any> {
  const qtyDecimal = new Decimal(quantity);
  const tid = tenantId ?? 1;
  const { costLoss, opportunityLoss } = await calculateLossCosts(ingredientId, qtyDecimal, tid);

  if (isDemoMode) {
    const department = demoDb.departments.find((d: any) => d.id === departmentId && d.tenant_id === tid);
    const stockDeptId = department ? await getEffectiveDepartmentId(departmentId, tid) : departmentId;

    await ensureStockRow(null, stockDeptId, ingredientId);
    await updateStockQuantity(null, stockDeptId, ingredientId, qtyDecimal.times(-1));
    await logMovement(null, stockDeptId, ingredientId, qtyDecimal.times(-1), 'loss', 'loss_report');

    const lossRecord = {
      id: demoDb.ingredient_losses.length + 1, department_id: departmentId, ingredient_id: ingredientId,
      quantity: qtyDecimal.toNumber(), loss_reason: lossReason,
      cost_loss: costLoss.toNumber(), opportunity_loss: opportunityLoss.toNumber(),
      reported_by: reportedBy, created_at: new Date(), tenant_id: tid,
    };
    demoDb.ingredient_losses.push(lossRecord);

    const ing = demoDb.ingredients.find((i: any) => i.id === ingredientId);
    const dept = demoDb.departments.find((d: any) => d.id === departmentId);

    eventBus.emit(Events.LOSS_DECLARED, {
      tenantId: tid, lossId: lossRecord.id, quantity: qtyDecimal.toNumber(),
      unit: ing?.unit || '', ingredientName: ing?.name || 'Inconnu',
      reason: lossReason, costLoss: costLoss.toNumber(),
      departmentName: dept?.name || 'Inconnu',
    });

    if (costLoss.greaterThan(50)) {
      eventBus.emit(Events.LOSS_LARGE, {
        tenantId: tid, lossId: lossRecord.id, quantity: qtyDecimal.toNumber(),
        unit: ing?.unit || '', ingredientName: ing?.name || 'Inconnu',
        reason: lossReason, costLoss: costLoss.toNumber(),
      });
    }

    return lossRecord;
  }

  const { client, release } = await getClient();
  try {
    await client.query('BEGIN');
    const stockDeptId = await getEffectiveDepartmentId(departmentId, tid);
    await ensureStockRow(client, stockDeptId, ingredientId, tid);

    const stockRes = await client.query(
      'SELECT quantity FROM inventory_stocks WHERE department_id = $1 AND ingredient_id = $2 AND tenant_id = $3 FOR UPDATE',
      [stockDeptId, ingredientId, tid]
    );
    const currentQty = new Decimal(stockRes.rows[0]?.quantity || 0);
    const newQty = Decimal.max(0, currentQty.minus(qtyDecimal));

    await client.query(
      'UPDATE inventory_stocks SET quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE department_id = $2 AND ingredient_id = $3 AND tenant_id = $4',
      [newQty.toString(), stockDeptId, ingredientId, tid]
    );
    await logMovement(client, stockDeptId, ingredientId, qtyDecimal.times(-1), 'loss', 'loss_report', tid);

    const insertLoss = await client.query(
      `INSERT INTO ingredient_losses (department_id, ingredient_id, quantity, loss_reason, cost_loss, opportunity_loss, reported_by, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [departmentId, ingredientId, qtyDecimal.toString(), lossReason, costLoss.toFixed(2), opportunityLoss.toFixed(2), reportedBy, tid]
    );

    await client.query('COMMIT');
    return insertLoss.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    release();
  }
}

/**
 * Get all ingredient losses with joined data.
 */
export async function getLosses(tenantId?: number | null): Promise<any[]> {
  const filter = resolveTenantFilter(tenantId);

  if (isDemoMode) {
    return demoDb.ingredient_losses.map((il: any) => {
      const ing = demoDb.ingredients.find((i: any) => i.id === il.ingredient_id);
      const dept = demoDb.departments.find((d: any) => d.id === il.department_id);
      const reporter = demoDb.users.find((u: any) => u.id === il.reported_by);
      return {
        ...il,
        ingredient_name: ing ? ing.name : 'Unknown', unit: ing ? ing.unit : '',
        department_name: dept ? dept.name : 'Unknown',
        reported_by_username: reporter ? reporter.username : 'Unknown'
      };
    }).filter((l: any) => !filter || l.tenant_id === filter);
  }

  if (filter) {
    const result = await query(`
      SELECT il.*, i.name as ingredient_name, i.unit, d.name as department_name, u.username as reported_by_username
      FROM ingredient_losses il
      JOIN ingredients i ON il.ingredient_id = i.id
      JOIN departments d ON il.department_id = d.id
      LEFT JOIN users u ON il.reported_by = u.id
      WHERE il.tenant_id = $1
      ORDER BY il.created_at DESC
    `, [filter]);
    return result.rows;
  }

  const result = await query(`
    SELECT il.*, i.name as ingredient_name, i.unit, d.name as department_name, u.username as reported_by_username
    FROM ingredient_losses il
    JOIN ingredients i ON il.ingredient_id = i.id
    JOIN departments d ON il.department_id = d.id
    LEFT JOIN users u ON il.reported_by = u.id
    ORDER BY il.created_at DESC
  `);
  return result.rows;
}
