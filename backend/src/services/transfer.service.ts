import { Decimal } from 'decimal.js';
import { query, isDemoMode, demoDb, getClient } from '../database';
import { ensureStockRow, updateStockQuantity, logMovement } from './stock.service';

/**
 * Execute a direct stock transfer between two isolated departments.
 * Validates source stock availability and performs atomic transfer.
 */
export async function executeTransfer(
  sourceDepartmentId: number,
  destinationDepartmentId: number,
  ingredientId: number,
  quantity: number
): Promise<any> {
  const transferQty = new Decimal(quantity);

  if (transferQty.lessThanOrEqualTo(0)) {
    throw new Error('Quantity must be greater than zero');
  }

  if (isDemoMode) {
    const srcDept = demoDb.departments.find((d: any) => d.id === sourceDepartmentId);
    const destDept = demoDb.departments.find((d: any) => d.id === destinationDepartmentId);

    if (!srcDept || !destDept) throw new Error('One or both departments do not exist');
    if (srcDept.stock_type === 'inherited' || destDept.stock_type === 'inherited') {
      throw new Error('Cannot transfer stock to or from an inherited stock department');
    }

    // Check source stock
    await ensureStockRow(null, sourceDepartmentId, ingredientId);
    const srcStock = demoDb.inventory_stocks.find(
      (s: any) => s.department_id === sourceDepartmentId && s.ingredient_id === ingredientId
    );
    const srcQty = new Decimal(srcStock?.quantity || 0);

    if (srcQty.lessThan(transferQty)) {
      throw new Error(`Stock insuffisant dans le dépôt de départ. Quantité disponible : ${srcQty.toString()}`);
    }

    // Ensure destination stock exists
    await ensureStockRow(null, destinationDepartmentId, ingredientId);

    // Execute transfer
    await updateStockQuantity(null, sourceDepartmentId, ingredientId, transferQty.times(-1));
    await updateStockQuantity(null, destinationDepartmentId, ingredientId, transferQty);

    // Log movements
    const ref = `transfer-${sourceDepartmentId}-to-${destinationDepartmentId}`;
    await logMovement(null, sourceDepartmentId, ingredientId, transferQty.times(-1), 'transfer_out', ref);
    await logMovement(null, destinationDepartmentId, ingredientId, transferQty, 'transfer_in', ref);

    const newSrcQty = await getSrcDestQties(sourceDepartmentId, destinationDepartmentId, ingredientId);

    return {
      ingredient_id: ingredientId,
      quantity: transferQty.toNumber(),
      source_department_id: sourceDepartmentId,
      destination_department_id: destinationDepartmentId,
      new_source_quantity: newSrcQty.srcQty,
      new_destination_quantity: newSrcQty.destQty
    };
  }

  // PostgreSQL mode with transaction
  const { client, release } = await getClient();
  try {
    await client.query('BEGIN');

    // Validate departments
    const srcDeptRes = await client.query('SELECT * FROM departments WHERE id = $1', [sourceDepartmentId]);
    const destDeptRes = await client.query('SELECT * FROM departments WHERE id = $1', [destinationDepartmentId]);

    if (srcDeptRes.rows.length === 0 || destDeptRes.rows.length === 0) {
      throw new Error('One or both departments do not exist');
    }
    if (srcDeptRes.rows[0].stock_type === 'inherited' || destDeptRes.rows[0].stock_type === 'inherited') {
      throw new Error('Cannot transfer stock to or from an inherited stock department');
    }

    // Ensure stock rows exist
    await ensureStockRow(client, sourceDepartmentId, ingredientId);
    await ensureStockRow(client, destinationDepartmentId, ingredientId);

    // Lock and check source stock
    const srcStockRes = await client.query(
      'SELECT quantity FROM inventory_stocks WHERE department_id = $1 AND ingredient_id = $2 FOR UPDATE',
      [sourceDepartmentId, ingredientId]
    );
    const srcQty = new Decimal(srcStockRes.rows[0]?.quantity || 0);

    if (srcQty.lessThan(transferQty)) {
      throw new Error(`Stock insuffisant dans le dépôt de départ. Quantité disponible : ${srcQty.toString()}`);
    }

    // Update stocks
    await updateStockQuantity(client, sourceDepartmentId, ingredientId, transferQty.times(-1));
    await updateStockQuantity(client, destinationDepartmentId, ingredientId, transferQty);

    // Log movements
    const ref = `transfer-${sourceDepartmentId}-to-${destinationDepartmentId}`;
    await logMovement(client, sourceDepartmentId, ingredientId, transferQty.times(-1), 'transfer_out', ref);
    await logMovement(client, destinationDepartmentId, ingredientId, transferQty, 'transfer_in', ref);

    // Get final quantities
    const srcEndRes = await client.query(
      'SELECT quantity FROM inventory_stocks WHERE department_id = $1 AND ingredient_id = $2',
      [sourceDepartmentId, ingredientId]
    );
    const destEndRes = await client.query(
      'SELECT quantity FROM inventory_stocks WHERE department_id = $1 AND ingredient_id = $2',
      [destinationDepartmentId, ingredientId]
    );

    await client.query('COMMIT');

    return {
      ingredient_id: ingredientId,
      quantity: transferQty.toNumber(),
      source_department_id: sourceDepartmentId,
      destination_department_id: destinationDepartmentId,
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
  sourceDepartmentId: number,
  destinationDepartmentId: number,
  ingredientId: number,
  quantity: number,
  requestedBy: number | null
): Promise<any> {
  const reqQty = new Decimal(quantity);

  if (isDemoMode) {
    const newRequest = {
      id: demoDb.transfer_requests.length + 1,
      source_department_id: sourceDepartmentId,
      destination_department_id: destinationDepartmentId,
      ingredient_id: ingredientId,
      quantity: reqQty.toNumber(),
      status: 'pending',
      requested_by: requestedBy,
      validated_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    demoDb.transfer_requests.push(newRequest);
    return newRequest;
  }

  const result = await query(
    `INSERT INTO transfer_requests (source_department_id, destination_department_id, ingredient_id, quantity, status, requested_by)
     VALUES ($1, $2, $3, $4, 'pending', $5) RETURNING *`,
    [sourceDepartmentId, destinationDepartmentId, ingredientId, reqQty.toString(), requestedBy]
  );
  return result.rows[0];
}

/**
 * Approve and execute a pending transfer request.
 */
export async function approveTransferRequest(
  requestId: number,
  validatedBy: number | null
): Promise<any> {
  if (isDemoMode) {
    const request = demoDb.transfer_requests.find((tr: any) => tr.id === requestId);
    if (!request) throw new Error('Transfer request not found');
    if (request.status !== 'pending') throw new Error('Request is not pending validation');

    // Execute the transfer
    const result = await executeTransfer(
      request.source_department_id,
      request.destination_department_id,
      request.ingredient_id,
      request.quantity
    );

    // Update request status
    request.status = 'approved';
    request.validated_by = validatedBy;
    request.updated_at = new Date().toISOString();

    return request;
  }

  const { client, release } = await getClient();
  try {
    await client.query('BEGIN');

    const reqRes = await client.query('SELECT * FROM transfer_requests WHERE id = $1 FOR UPDATE', [requestId]);
    if (reqRes.rows.length === 0) throw new Error('Transfer request not found');
    const request = reqRes.rows[0];

    if (request.status !== 'pending') throw new Error('Request is not pending validation');

    // Execute transfer within the same transaction
    const srcQty = new Decimal(request.quantity);

    await ensureStockRow(client, request.source_department_id, request.ingredient_id);
    await ensureStockRow(client, request.destination_department_id, request.ingredient_id);

    const srcStockRes = await client.query(
      'SELECT quantity FROM inventory_stocks WHERE department_id = $1 AND ingredient_id = $2 FOR UPDATE',
      [request.source_department_id, request.ingredient_id]
    );
    const currentSrcQty = new Decimal(srcStockRes.rows[0]?.quantity || 0);
    if (currentSrcQty.lessThan(srcQty)) {
      throw new Error(`Stock insuffisant. Quantité disponible : ${currentSrcQty.toString()}`);
    }

    await updateStockQuantity(client, request.source_department_id, request.ingredient_id, srcQty.times(-1));
    await updateStockQuantity(client, request.destination_department_id, request.ingredient_id, srcQty);

    const ref = `transfer-request-${requestId}`;
    await logMovement(client, request.source_department_id, request.ingredient_id, srcQty.times(-1), 'transfer_out', ref);
    await logMovement(client, request.destination_department_id, request.ingredient_id, srcQty, 'transfer_in', ref);

    const updateResult = await client.query(
      `UPDATE transfer_requests SET status = 'approved', validated_by = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
      [validatedBy, requestId]
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
  requestId: number,
  validatedBy: number | null
): Promise<any> {
  if (isDemoMode) {
    const request = demoDb.transfer_requests.find((tr: any) => tr.id === requestId);
    if (!request) throw new Error('Transfer request not found');
    if (request.status !== 'pending') throw new Error('Request is not pending validation');

    request.status = 'rejected';
    request.validated_by = validatedBy;
    request.updated_at = new Date().toISOString();
    return request;
  }

  const result = await query(
    `UPDATE transfer_requests SET status = 'rejected', validated_by = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2 AND status = 'pending' RETURNING *`,
    [validatedBy, requestId]
  );

  if (result.rows.length === 0) throw new Error('Request not found or not pending validation');
  return result.rows[0];
}

/**
 * Get all transfer requests with joined data.
 */
export async function getTransferRequests(): Promise<any[]> {
  if (isDemoMode) {
    const data = demoDb.transfer_requests.map((tr: any) => ({
      ...tr,
      ingredient_name: (demoDb.ingredients.find((i: any) => i.id === tr.ingredient_id) || {}).name || 'Unknown',
      ingredient_unit: (demoDb.ingredients.find((i: any) => i.id === tr.ingredient_id) || {}).unit || '',
      source_department_name: (demoDb.departments.find((d: any) => d.id === tr.source_department_id) || {}).name || 'Unknown',
      destination_department_name: (demoDb.departments.find((d: any) => d.id === tr.destination_department_id) || {}).name || 'Unknown',
      requested_by_username: (demoDb.users.find((u: any) => u.id === tr.requested_by) || {}).username || 'Unknown',
      validated_by_username: (demoDb.users.find((u: any) => u.id === tr.validated_by) || {}).username || null
    }));
    return data.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
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
  srcDeptId: number,
  destDeptId: number,
  ingId: number
): Promise<{ srcQty: number; destQty: number }> {
  if (isDemoMode) {
    const srcStock = demoDb.inventory_stocks.find(
      (s: any) => s.department_id === srcDeptId && s.ingredient_id === ingId
    );
    const destStock = demoDb.inventory_stocks.find(
      (s: any) => s.department_id === destDeptId && s.ingredient_id === ingId
    );
    return {
      srcQty: srcStock?.quantity || 0,
      destQty: destStock?.quantity || 0
    };
  }

  const [srcRes, destRes] = await Promise.all([
    query('SELECT quantity FROM inventory_stocks WHERE department_id = $1 AND ingredient_id = $2', [srcDeptId, ingId]),
    query('SELECT quantity FROM inventory_stocks WHERE department_id = $1 AND ingredient_id = $2', [destDeptId, ingId])
  ]);

  return {
    srcQty: parseFloat(srcRes.rows[0]?.quantity || '0'),
    destQty: parseFloat(destRes.rows[0]?.quantity || '0')
  };
}
