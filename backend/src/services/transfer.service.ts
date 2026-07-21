import { Decimal } from 'decimal.js';
import { query, isDemoMode, demoDb, getClient } from '../database';
import { ensureStockRow, updateStockQuantity, logMovement } from './stock.service';
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
 * Execute a direct stock transfer between two isolated departments.
 */
export async function executeTransfer(
  sourceDepartmentId: number, destinationDepartmentId: number,
  ingredientId: number, quantity: number,
  tenantId?: number | null
): Promise<any> {
  const transferQty = new Decimal(quantity);
  const tid = tenantId ?? 1;

  if (transferQty.lessThanOrEqualTo(0)) {
    throw new Error('Quantity must be greater than zero');
  }

  if (isDemoMode) {
    const srcDept = demoDb.departments.find((d: any) => d.id === sourceDepartmentId && d.tenant_id === tid);
    const destDept = demoDb.departments.find((d: any) => d.id === destinationDepartmentId && d.tenant_id === tid);
    if (!srcDept || !destDept) throw new Error('One or both departments do not exist');
    if (srcDept.stock_type === 'inherited' || destDept.stock_type === 'inherited') {
      throw new Error('Cannot transfer stock to or from an inherited stock department');
    }

    await ensureStockRow(null, sourceDepartmentId, ingredientId);
    const srcStock = demoDb.inventory_stocks.find(
      (s: any) => s.department_id === sourceDepartmentId && s.ingredient_id === ingredientId
    );
    const srcQty = new Decimal(srcStock?.quantity || 0);
    if (srcQty.lessThan(transferQty)) {
      throw new Error(`Stock insuffisant dans le dépôt de départ. Quantité disponible : ${srcQty.toString()}`);
    }

    await ensureStockRow(null, destinationDepartmentId, ingredientId);
    await updateStockQuantity(null, sourceDepartmentId, ingredientId, transferQty.times(-1));
    await updateStockQuantity(null, destinationDepartmentId, ingredientId, transferQty);

    const ref = `transfer-${sourceDepartmentId}-to-${destinationDepartmentId}`;
    await logMovement(null, sourceDepartmentId, ingredientId, transferQty.times(-1), 'transfer_out', ref);
    await logMovement(null, destinationDepartmentId, ingredientId, transferQty, 'transfer_in', ref);

    const newSrcQty = await getSrcDestQties(sourceDepartmentId, destinationDepartmentId, ingredientId, tid);
    return {
      ingredient_id: ingredientId, quantity: transferQty.toNumber(),
      source_department_id: sourceDepartmentId, destination_department_id: destinationDepartmentId,
      new_source_quantity: newSrcQty.srcQty, new_destination_quantity: newSrcQty.destQty
    };
  }

  // PostgreSQL mode
  const { client, release } = await getClient();
  try {
    await client.query('BEGIN');
    const srcDeptRes = await client.query('SELECT * FROM departments WHERE id = $1 AND tenant_id = $2', [sourceDepartmentId, tid]);
    const destDeptRes = await client.query('SELECT * FROM departments WHERE id = $1 AND tenant_id = $2', [destinationDepartmentId, tid]);

    if (srcDeptRes.rows.length === 0 || destDeptRes.rows.length === 0) {
      throw new Error('One or both departments do not exist');
    }
    if (srcDeptRes.rows[0].stock_type === 'inherited' || destDeptRes.rows[0].stock_type === 'inherited') {
      throw new Error('Cannot transfer stock to or from an inherited stock department');
    }

    await ensureStockRow(client, sourceDepartmentId, ingredientId, tid);
    await ensureStockRow(client, destinationDepartmentId, ingredientId, tid);

    const srcStockRes = await client.query(
      'SELECT quantity FROM inventory_stocks WHERE department_id = $1 AND ingredient_id = $2 AND tenant_id = $3 FOR UPDATE',
      [sourceDepartmentId, ingredientId, tid]
    );
    const srcQty = new Decimal(srcStockRes.rows[0]?.quantity || 0);
    if (srcQty.lessThan(transferQty)) {
      throw new Error(`Stock insuffisant dans le dépôt de départ. Quantité disponible : ${srcQty.toString()}`);
    }

    await updateStockQuantity(client, sourceDepartmentId, ingredientId, transferQty.times(-1), tid);
    await updateStockQuantity(client, destinationDepartmentId, ingredientId, transferQty, tid);

    const ref = `transfer-${sourceDepartmentId}-to-${destinationDepartmentId}`;
    await logMovement(client, sourceDepartmentId, ingredientId, transferQty.times(-1), 'transfer_out', ref, tid);
    await logMovement(client, destinationDepartmentId, ingredientId, transferQty, 'transfer_in', ref, tid);

    const srcEndRes = await client.query('SELECT quantity FROM inventory_stocks WHERE department_id = $1 AND ingredient_id = $2 AND tenant_id = $3', [sourceDepartmentId, ingredientId, tid]);
    const destEndRes = await client.query('SELECT quantity FROM inventory_stocks WHERE department_id = $1 AND ingredient_id = $2 AND tenant_id = $3', [destinationDepartmentId, ingredientId, tid]);

    await client.query('COMMIT');
    return {
      ingredient_id: ingredientId, quantity: transferQty.toNumber(),
      source_department_id: sourceDepartmentId, destination_department_id: destinationDepartmentId,
      new_source_quantity: parseFloat(srcEndRes.rows[0]?.quantity || '0'),
      new_destination_quantity: parseFloat(destEndRes.rows[0]?.quantity || '0')
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    release();
  }
}

/**
 * Create a transfer request (two-step approval workflow).
 */
export async function createTransferRequest(
  sourceDepartmentId: number, destinationDepartmentId: number,
  ingredientId: number, quantity: number, requestedBy: number | null,
  tenantId?: number | null
): Promise<any> {
  const reqQty = new Decimal(quantity);
  const tid = tenantId ?? 1;

  if (isDemoMode) {
    const newRequest = {
      id: demoDb.transfer_requests.length + 1,
      source_department_id: sourceDepartmentId, destination_department_id: destinationDepartmentId,
      ingredient_id: ingredientId, quantity: reqQty.toNumber(),
      status: 'pending', requested_by: requestedBy, validated_by: null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(), tenant_id: tid,
    };
    demoDb.transfer_requests.push(newRequest);

    const ing = demoDb.ingredients.find((i: any) => i.id === ingredientId);
    const srcDept = demoDb.departments.find((d: any) => d.id === sourceDepartmentId);
    const destDept = demoDb.departments.find((d: any) => d.id === destinationDepartmentId);

    eventBus.emit(Events.TRANSFER_REQUESTED, {
      tenantId: tid, requestId: newRequest.id, quantity: reqQty.toNumber(),
      unit: ing?.unit || '', ingredientName: ing?.name || 'Inconnu',
      sourceDept: srcDept?.name || 'Inconnu', destDept: destDept?.name || 'Inconnu',
    });

    return newRequest;
  }

  const result = await query(
    `INSERT INTO transfer_requests (source_department_id, destination_department_id, ingredient_id, quantity, status, requested_by, tenant_id)
     VALUES ($1, $2, $3, $4, 'pending', $5, $6) RETURNING *`,
    [sourceDepartmentId, destinationDepartmentId, ingredientId, reqQty.toString(), requestedBy, tid]
  );
  return result.rows[0];
}

/**
 * Approve and execute a pending transfer request.
 */
export async function approveTransferRequest(
  requestId: number, validatedBy: number | null,
  tenantId?: number | null
): Promise<any> {
  const tid = tenantId ?? 1;

  if (isDemoMode) {
    const request = demoDb.transfer_requests.find((tr: any) => tr.id === requestId && tr.tenant_id === tid);
    if (!request) throw new Error('Transfer request not found');
    if (request.status !== 'pending') throw new Error('Request is not pending validation');

    await executeTransfer(request.source_department_id, request.destination_department_id, request.ingredient_id, request.quantity, tid);
    request.status = 'approved';
    request.validated_by = validatedBy;
    request.updated_at = new Date().toISOString();

    const ing = demoDb.ingredients.find((i: any) => i.id === request.ingredient_id);
    eventBus.emit(Events.TRANSFER_APPROVED, {
      tenantId: tid, requestId: request.id, quantity: request.quantity,
      unit: ing?.unit || '', ingredientName: ing?.name || 'Inconnu',
    });

    return request;
  }

  const { client, release } = await getClient();
  try {
    await client.query('BEGIN');
    const reqRes = await client.query('SELECT * FROM transfer_requests WHERE id = $1 AND tenant_id = $2 FOR UPDATE', [requestId, tid]);
    if (reqRes.rows.length === 0) throw new Error('Transfer request not found');
    const request = reqRes.rows[0];
    if (request.status !== 'pending') throw new Error('Request is not pending validation');

    const srcQty = new Decimal(request.quantity);
    await ensureStockRow(client, request.source_department_id, request.ingredient_id, tid);
    await ensureStockRow(client, request.destination_department_id, request.ingredient_id, tid);

    const srcStockRes = await client.query(
      'SELECT quantity FROM inventory_stocks WHERE department_id = $1 AND ingredient_id = $2 AND tenant_id = $3 FOR UPDATE',
      [request.source_department_id, request.ingredient_id, tid]
    );
    const currentSrcQty = new Decimal(srcStockRes.rows[0]?.quantity || 0);
    if (currentSrcQty.lessThan(srcQty)) {
      throw new Error(`Stock insuffisant. Quantité disponible : ${currentSrcQty.toString()}`);
    }

    await updateStockQuantity(client, request.source_department_id, request.ingredient_id, srcQty.times(-1), tid);
    await updateStockQuantity(client, request.destination_department_id, request.ingredient_id, srcQty, tid);

    const ref = `transfer-request-${requestId}`;
    await logMovement(client, request.source_department_id, request.ingredient_id, srcQty.times(-1), 'transfer_out', ref, tid);
    await logMovement(client, request.destination_department_id, request.ingredient_id, srcQty, 'transfer_in', ref, tid);

    const updateResult = await client.query(
      `UPDATE transfer_requests SET status = 'approved', validated_by = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND tenant_id = $3 RETURNING *`,
      [validatedBy, requestId, tid]
    );

    await client.query('COMMIT');
    return updateResult.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    release();
  }
}

/**
 * Reject a pending transfer request (no stock movement).
 */
export async function rejectTransferRequest(
  requestId: number, validatedBy: number | null,
  tenantId?: number | null
): Promise<any> {
  const tid = tenantId ?? 1;

  if (isDemoMode) {
    const request = demoDb.transfer_requests.find((tr: any) => tr.id === requestId && tr.tenant_id === tid);
    if (!request) throw new Error('Transfer request not found');
    if (request.status !== 'pending') throw new Error('Request is not pending validation');
    request.status = 'rejected';
    request.validated_by = validatedBy;
    request.updated_at = new Date().toISOString();

    const ing = demoDb.ingredients.find((i: any) => i.id === request.ingredient_id);
    eventBus.emit(Events.TRANSFER_REJECTED, {
      tenantId: tid, requestId: request.id, quantity: request.quantity,
      unit: ing?.unit || '', ingredientName: ing?.name || 'Inconnu',
    });

    return request;
  }

  const result = await query(
    `UPDATE transfer_requests SET status = 'rejected', validated_by = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2 AND status = 'pending' AND tenant_id = $3 RETURNING *`,
    [validatedBy, requestId, tid]
  );
  if (result.rows.length === 0) throw new Error('Request not found or not pending validation');
  return result.rows[0];
}

/**
 * Get all transfer requests with joined data.
 */
export async function getTransferRequests(tenantId?: number | null): Promise<any[]> {
  const filter = resolveTenantFilter(tenantId);

  if (isDemoMode) {
    return demoDb.transfer_requests
      .filter((tr: any) => !filter || tr.tenant_id === filter)
      .map((tr: any) => ({
        ...tr,
        ingredient_name: (demoDb.ingredients.find((i: any) => i.id === tr.ingredient_id) || {}).name || 'Unknown',
        ingredient_unit: (demoDb.ingredients.find((i: any) => i.id === tr.ingredient_id) || {}).unit || '',
        source_department_name: (demoDb.departments.find((d: any) => d.id === tr.source_department_id) || {}).name || 'Unknown',
        destination_department_name: (demoDb.departments.find((d: any) => d.id === tr.destination_department_id) || {}).name || 'Unknown',
        requested_by_username: (demoDb.users.find((u: any) => u.id === tr.requested_by) || {}).username || 'Unknown',
        validated_by_username: (demoDb.users.find((u: any) => u.id === tr.validated_by) || {}).username || null
      }))
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  if (filter) {
    const result = await query(`
      SELECT tr.*, i.name as ingredient_name, i.unit as ingredient_unit,
             d1.name as source_department_name, d2.name as destination_department_name,
             u1.username as requested_by_username, u2.username as validated_by_username
      FROM transfer_requests tr
      JOIN ingredients i ON tr.ingredient_id = i.id
      JOIN departments d1 ON tr.source_department_id = d1.id
      JOIN departments d2 ON tr.destination_department_id = d2.id
      LEFT JOIN users u1 ON tr.requested_by = u1.id
      LEFT JOIN users u2 ON tr.validated_by = u2.id
      WHERE tr.tenant_id = $1
      ORDER BY tr.created_at DESC
    `, [filter]);
    return result.rows;
  }

  const result = await query(`
    SELECT tr.*, i.name as ingredient_name, i.unit as ingredient_unit,
           d1.name as source_department_name, d2.name as destination_department_name,
           u1.username as requested_by_username, u2.username as validated_by_username
    FROM transfer_requests tr
    JOIN ingredients i ON tr.ingredient_id = i.id
    JOIN departments d1 ON tr.source_department_id = d1.id
    JOIN departments d2 ON tr.destination_department_id = d2.id
    LEFT JOIN users u1 ON tr.requested_by = u1.id
    LEFT JOIN users u2 ON tr.validated_by = u2.id
    ORDER BY tr.created_at DESC
  `);
  return result.rows;
}

// ======================================================
// PRIVATE HELPERS
// ======================================================

async function getSrcDestQties(
  srcDeptId: number, destDeptId: number, ingId: number, tenantId?: number
): Promise<{ srcQty: number; destQty: number }> {
  if (isDemoMode) {
    const srcStock = demoDb.inventory_stocks.find((s: any) => s.department_id === srcDeptId && s.ingredient_id === ingId);
    const destStock = demoDb.inventory_stocks.find((s: any) => s.department_id === destDeptId && s.ingredient_id === ingId);
    return { srcQty: srcStock?.quantity || 0, destQty: destStock?.quantity || 0 };
  }

  const tid = tenantId ?? 1;
  const [srcRes, destRes] = await Promise.all([
    query('SELECT quantity FROM inventory_stocks WHERE department_id = $1 AND ingredient_id = $2 AND tenant_id = $3', [srcDeptId, ingId, tid]),
    query('SELECT quantity FROM inventory_stocks WHERE department_id = $1 AND ingredient_id = $2 AND tenant_id = $3', [destDeptId, ingId, tid])
  ]);

  return {
    srcQty: parseFloat(srcRes.rows[0]?.quantity || '0'),
    destQty: parseFloat(destRes.rows[0]?.quantity || '0')
  };
}
