import { Decimal } from 'decimal.js';
import { query, isDemoMode, demoDb, getClient } from '../database';
import {
  getEffectiveDepartmentId,
  ensureStockRow,
  updateStockQuantity,
  logMovement,
  calculateLossCosts
} from './stock.service';

/**
 * Create a new ingredient loss record with full double-loss calculation.
 * Returns the created loss data with calculated financials.
 */
export async function createLoss(
  departmentId: number,
  ingredientId: number,
  quantity: number,
  lossReason: string,
  reportedBy: number | null
): Promise<any> {
  const qtyDecimal = new Decimal(quantity);
  const { costLoss, opportunityLoss } = await calculateLossCosts(ingredientId, qtyDecimal);

  if (isDemoMode) {
    const department = demoDb.departments.find((d: any) => d.id === departmentId);
    const stockDeptId = department ? await getEffectiveDepartmentId(departmentId) : departmentId;

    // Deduct stock
    await ensureStockRow(null, stockDeptId, ingredientId);
    await updateStockQuantity(null, stockDeptId, ingredientId, qtyDecimal.times(-1));
    await logMovement(null, stockDeptId, ingredientId, qtyDecimal.times(-1), 'loss', 'loss_report');

    // Create loss record
    const lossRecord = {
      id: demoDb.ingredient_losses.length + 1,
      department_id: departmentId,
      ingredient_id: ingredientId,
      quantity: qtyDecimal.toNumber(),
      loss_reason: lossReason,
      cost_loss: costLoss.toNumber(),
      opportunity_loss: opportunityLoss.toNumber(),
      reported_by: reportedBy,
      created_at: new Date()
    };
    demoDb.ingredient_losses.push(lossRecord);
    return lossRecord;
  }

  // PostgreSQL mode with transaction
  const { client, release } = await getClient();
  try {
    await client.query('BEGIN');

    const stockDeptId = await getEffectiveDepartmentId(departmentId);

    await ensureStockRow(client, stockDeptId, ingredientId);

    // Lock and update stock
    const stockRes = await client.query(
      'SELECT quantity FROM inventory_stocks WHERE department_id = $1 AND ingredient_id = $2 FOR UPDATE',
      [stockDeptId, ingredientId]
    );
    const currentQty = new Decimal(stockRes.rows[0]?.quantity || 0);
    const newQty = Decimal.max(0, currentQty.minus(qtyDecimal));

    await client.query(
      'UPDATE inventory_stocks SET quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE department_id = $2 AND ingredient_id = $3',
      [newQty.toString(), stockDeptId, ingredientId]
    );

    await logMovement(client, stockDeptId, ingredientId, qtyDecimal.times(-1), 'loss', 'loss_report');

    const insertLoss = await client.query(
      `INSERT INTO ingredient_losses (department_id, ingredient_id, quantity, loss_reason, cost_loss, opportunity_loss, reported_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [departmentId, ingredientId, qtyDecimal.toString(), lossReason,
       costLoss.toFixed(2), opportunityLoss.toFixed(2), reportedBy]
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
export async function getLosses(): Promise<any[]> {
  if (isDemoMode) {
    return demoDb.ingredient_losses.map((il: any) => {
      const ing = demoDb.ingredients.find((i: any) => i.id === il.ingredient_id);
      const dept = demoDb.departments.find((d: any) => d.id === il.department_id);
      const reporter = demoDb.users.find((u: any) => u.id === il.reported_by);
      return {
        ...il,
        ingredient_name: ing ? ing.name : 'Unknown',
        unit: ing ? ing.unit : '',
        department_name: dept ? dept.name : 'Unknown',
        reported_by_username: reporter ? reporter.username : 'Unknown'
      };
    });
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
