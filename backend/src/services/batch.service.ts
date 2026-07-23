import { Decimal } from 'decimal.js';
import { query, isDemoMode, demoDb, getClient } from '../database';
import { ensureStockRow, updateStockQuantity, logMovement } from './stock.service';
import { eventBus, Events } from './event.service';

function resolveTenantFilter(tenantId?: number | null): number | undefined {
  if (tenantId === null) return undefined;
  return tenantId ?? 1;
}

export async function getAllBatches(
  tenantId?: number | null,
  filters?: {
    ingredient_id?: number;
    warehouse_id?: number;
    status?: string;
    expiring_within_days?: number;
    page?: number;
    limit?: number;
  }
): Promise<{ batches: any[]; total: number }> {
  const filter = resolveTenantFilter(tenantId);
  const page = filters?.page || 1;
  const limit = filters?.limit || 50;
  const offset = (page - 1) * limit;

  if (isDemoMode) {
    let batches = demoDb.inventory_batches.filter((b: any) => {
      if (filter && b.tenant_id !== filter) return false;
      if (filters?.ingredient_id && b.ingredient_id !== filters.ingredient_id) return false;
      if (filters?.warehouse_id && b.warehouse_id !== filters.warehouse_id) return false;
      if (filters?.status && b.status !== filters.status) return false;
      if (filters?.expiring_within_days) {
        const now = new Date();
        const expiry = new Date(b.expiration_date);
        const diffDays = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
        if (diffDays < 0 || diffDays > filters.expiring_within_days) return false;
      }
      return true;
    });

    const total = batches.length;

    batches = batches
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(offset, offset + limit)
      .map((b: any) => {
        const ing = demoDb.ingredients.find((i: any) => i.id === b.ingredient_id);
        return {
          ...b,
          ingredient_name: ing?.name || 'Unknown',
          unit: ing?.unit || '',
        };
      });

    return { batches, total };
  }

  const tid = filter || 1;
  const conditions: string[] = ['b.tenant_id = $1'];
  const params: any[] = [tid];
  let pIdx = 2;

  if (filters?.ingredient_id) {
    conditions.push(`b.ingredient_id = $${pIdx++}`);
    params.push(filters.ingredient_id);
  }
  if (filters?.warehouse_id) {
    conditions.push(`b.warehouse_id = $${pIdx++}`);
    params.push(filters.warehouse_id);
  }
  if (filters?.status) {
    conditions.push(`b.status = $${pIdx++}`);
    params.push(filters.status);
  }
  if (filters?.expiring_within_days) {
    conditions.push(`b.expiration_date BETWEEN CURRENT_TIMESTAMP AND CURRENT_TIMESTAMP + INTERVAL '${filters.expiring_within_days} days'`);
  }

  const where = conditions.join(' AND ');

  const countResult = await query(`SELECT COUNT(*) FROM inventory_batches b WHERE ${where}`, params);
  const total = parseInt(countResult.rows[0]?.count || '0', 10);

  const result = await query(
    `SELECT b.*, i.name as ingredient_name, i.unit
     FROM inventory_batches b
     JOIN ingredients i ON b.ingredient_id = i.id
     WHERE ${where}
     ORDER BY b.created_at DESC
     LIMIT $${pIdx++} OFFSET $${pIdx++}`,
    [...params, limit, offset]
  );

  return { batches: result.rows, total };
}

export async function getBatchById(id: number, tenantId?: number | null): Promise<any> {
  const filter = resolveTenantFilter(tenantId);

  if (isDemoMode) {
    let batch = demoDb.inventory_batches.find((b: any) => b.id === id);
    if (!batch) throw new Error('Batch not found');
    if (filter && batch.tenant_id !== filter) throw new Error('Batch not found');

    const movements = demoDb.batch_movements
      .filter((m: any) => m.batch_id === id)
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const ing = demoDb.ingredients.find((i: any) => i.id === batch.ingredient_id);

    return {
      ...batch,
      ingredient_name: ing?.name || 'Unknown',
      unit: ing?.unit || '',
      movements,
    };
  }

  const tid = filter || 1;
  const batchResult = await query(
    `SELECT b.*, i.name as ingredient_name, i.unit
     FROM inventory_batches b
     JOIN ingredients i ON b.ingredient_id = i.id
     WHERE b.id = $1 AND b.tenant_id = $2`,
    [id, tid]
  );

  if (batchResult.rows.length === 0) throw new Error('Batch not found');
  const batch = batchResult.rows[0];

  const movementsResult = await query(
    `SELECT * FROM batch_movements WHERE batch_id = $1 ORDER BY created_at DESC`,
    [id]
  );
  batch.movements = movementsResult.rows;

  return batch;
}

export async function getBatchMovements(batchId: number, tenantId?: number | null): Promise<any[]> {
  const filter = resolveTenantFilter(tenantId);

  if (isDemoMode) {
    const batch = demoDb.inventory_batches.find((b: any) => b.id === batchId);
    if (!batch) throw new Error('Batch not found');
    if (filter && batch.tenant_id !== filter) throw new Error('Batch not found');

    return demoDb.batch_movements
      .filter((m: any) => m.batch_id === batchId)
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  const tid = filter || 1;
  const batchCheck = await query('SELECT id FROM inventory_batches WHERE id = $1 AND tenant_id = $2', [batchId, tid]);
  if (batchCheck.rows.length === 0) throw new Error('Batch not found');

  const result = await query(
    'SELECT * FROM batch_movements WHERE batch_id = $1 ORDER BY created_at DESC',
    [batchId]
  );
  return result.rows;
}

export async function consumeFromBatch(
  ingredientId: number,
  warehouseId: number,
  quantity: number,
  tenantId?: number | null
): Promise<{ consumed: { batch_id: number; quantity_consumed: number; batch_number: string }[]; remaining: number }> {
  const reqQty = new Decimal(quantity);
  const tid = tenantId ?? 1;

  if (reqQty.lessThanOrEqualTo(0)) {
    throw new Error('Quantity must be greater than zero');
  }

  if (isDemoMode) {
    const setting = demoDb.tenant_settings.find(
      (s: any) => s.tenant_id === tid && s.key === 'consumption_strategy'
    );
    const strategy = setting?.value || 'fefo';

    let activeBatches = demoDb.inventory_batches.filter(
      (b: any) =>
        b.ingredient_id === ingredientId &&
        b.warehouse_id === warehouseId &&
        b.tenant_id === tid &&
        (b.status === 'active' || b.status === 'partially_consumed') &&
        new Decimal(b.remaining_quantity).greaterThan(0)
    );

    if (strategy === 'fefo') {
      activeBatches.sort((a: any, b: any) => {
        const dateCmp = new Date(a.expiration_date).getTime() - new Date(b.expiration_date).getTime();
        if (dateCmp !== 0) return dateCmp;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });
    } else {
      activeBatches.sort(
        (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    }

    const consumed: { batch_id: number; quantity_consumed: number; batch_number: string }[] = [];
    let remainingToConsume = reqQty;

    for (const batch of activeBatches) {
      if (remainingToConsume.lessThanOrEqualTo(0)) break;

      const batchRemaining = new Decimal(batch.remaining_quantity);
      const consumeQty = Decimal.min(remainingToConsume, batchRemaining);

      batch.remaining_quantity = batchRemaining.minus(consumeQty).toNumber();

      let movementType: string;
      if (batch.status === 'active' && consumeQty.equals(batchRemaining)) {
        batch.status = 'consumed';
        movementType = 'full_consumption';
      } else if (batch.status === 'active') {
        batch.status = 'partially_consumed';
        movementType = 'partial_consumption';
      } else if (batch.status === 'partially_consumed' && consumeQty.equals(batchRemaining)) {
        batch.status = 'consumed';
        movementType = 'full_consumption';
      } else {
        movementType = 'partial_consumption';
      }

      demoDb.batch_movements.push({
        id: demoDb.batch_movements.length + 1,
        batch_id: batch.id,
        ingredient_id: ingredientId,
        warehouse_id: warehouseId,
        quantity: consumeQty.times(-1).toNumber(),
        type: movementType,
        reference_id: `consumption-${batch.id}-${Date.now()}`,
        created_at: new Date(),
        tenant_id: tid,
      });

      consumed.push({
        batch_id: batch.id,
        quantity_consumed: consumeQty.toNumber(),
        batch_number: batch.batch_number,
      });

      remainingToConsume = remainingToConsume.minus(consumeQty);

      eventBus.emit(Events.BATCH_CONSUMED, {
        tenantId: tid,
        batchId: batch.id,
        batchNumber: batch.batch_number,
        ingredientId,
        warehouseId,
        quantityConsumed: consumeQty.toNumber(),
        remainingQuantity: batch.remaining_quantity,
      });
    }

    const totalConsumed = reqQty.minus(remainingToConsume);
    await ensureStockRow(null, warehouseId, ingredientId, tid);
    await updateStockQuantity(null, warehouseId, ingredientId, totalConsumed.times(-1), tid);
    await logMovement(null, warehouseId, ingredientId, totalConsumed.times(-1), 'batch_consumption', `batch-consumption-${Date.now()}`, tid);

    return {
      consumed,
      remaining: remainingToConsume.toNumber(),
    };
  }

  const { client, release } = await getClient();
  try {
    await client.query('BEGIN');

    const strategyResult = await client.query(
      `SELECT value FROM tenant_settings WHERE tenant_id = $1 AND key = 'consumption_strategy'`,
      [tid]
    );
    const strategy = strategyResult.rows.length > 0 ? strategyResult.rows[0].value : 'fefo';

    let activeBatches: any[];
    if (strategy === 'fefo') {
      const result = await client.query(
        `SELECT * FROM inventory_batches
         WHERE ingredient_id = $1 AND warehouse_id = $2 AND tenant_id = $3
         AND status IN ('active', 'partially_consumed') AND remaining_quantity > 0
         ORDER BY expiration_date ASC, created_at ASC
         FOR UPDATE`,
        [ingredientId, warehouseId, tid]
      );
      activeBatches = result.rows;
    } else {
      const result = await client.query(
        `SELECT * FROM inventory_batches
         WHERE ingredient_id = $1 AND warehouse_id = $2 AND tenant_id = $3
         AND status IN ('active', 'partially_consumed') AND remaining_quantity > 0
         ORDER BY created_at ASC
         FOR UPDATE`,
        [ingredientId, warehouseId, tid]
      );
      activeBatches = result.rows;
    }

    const consumed: { batch_id: number; quantity_consumed: number; batch_number: string }[] = [];
    let remainingToConsume = reqQty;

    for (const batch of activeBatches) {
      if (remainingToConsume.lessThanOrEqualTo(0)) break;

      const batchRemaining = new Decimal(batch.remaining_quantity);
      const consumeQty = Decimal.min(remainingToConsume, batchRemaining);

      let newStatus: string;
      let movementType: string;

      if (batch.status === 'active' && consumeQty.equals(batchRemaining)) {
        newStatus = 'consumed';
        movementType = 'full_consumption';
      } else if (batch.status === 'active') {
        newStatus = 'partially_consumed';
        movementType = 'partial_consumption';
      } else if (batch.status === 'partially_consumed' && consumeQty.equals(batchRemaining)) {
        newStatus = 'consumed';
        movementType = 'full_consumption';
      } else {
        newStatus = 'partially_consumed';
        movementType = 'partial_consumption';
      }

      await client.query(
        `UPDATE inventory_batches
         SET remaining_quantity = remaining_quantity - $1, status = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3 AND tenant_id = $4`,
        [consumeQty.toString(), newStatus, batch.id, tid]
      );

      await client.query(
        `INSERT INTO batch_movements (batch_id, ingredient_id, warehouse_id, quantity, type, reference_id, tenant_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [batch.id, ingredientId, warehouseId, consumeQty.times(-1).toString(), movementType,
         `consumption-${batch.id}-${Date.now()}`, tid]
      );

      consumed.push({
        batch_id: batch.id,
        quantity_consumed: consumeQty.toNumber(),
        batch_number: batch.batch_number,
      });

      remainingToConsume = remainingToConsume.minus(consumeQty);

      eventBus.emit(Events.BATCH_CONSUMED, {
        tenantId: tid,
        batchId: batch.id,
        batchNumber: batch.batch_number,
        ingredientId,
        warehouseId,
        quantityConsumed: consumeQty.toNumber(),
        remainingQuantity: new Decimal(batch.remaining_quantity).minus(consumeQty).toNumber(),
      });
    }

    const totalConsumed = reqQty.minus(remainingToConsume);
    await ensureStockRow(client, warehouseId, ingredientId, tid);
    await updateStockQuantity(client, warehouseId, ingredientId, totalConsumed.times(-1), tid);
    await logMovement(client, warehouseId, ingredientId, totalConsumed.times(-1), 'batch_consumption', `batch-consumption-${Date.now()}`, tid);

    await client.query('COMMIT');

    return {
      consumed,
      remaining: remainingToConsume.toNumber(),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    release();
  }
}

export async function transferBatch(
  batchId: number,
  destinationWarehouseId: number,
  quantity: number,
  tenantId?: number | null
): Promise<any> {
  const transferQty = new Decimal(quantity);
  const tid = tenantId ?? 1;

  if (transferQty.lessThanOrEqualTo(0)) {
    throw new Error('Quantity must be greater than zero');
  }

  if (isDemoMode) {
    const batch = demoDb.inventory_batches.find(
      (b: any) => b.id === batchId && b.tenant_id === tid
    );
    if (!batch) throw new Error('Batch not found');
    if (batch.warehouse_id === destinationWarehouseId) {
      throw new Error('Destination warehouse must be different from source warehouse');
    }

    const batchRemaining = new Decimal(batch.remaining_quantity);
    if (batchRemaining.lessThan(transferQty)) {
      throw new Error(`Insufficient batch quantity. Available: ${batchRemaining.toString()}`);
    }

    batch.remaining_quantity = batchRemaining.minus(transferQty).toNumber();
    if (new Decimal(batch.remaining_quantity).equals(0)) {
      batch.status = 'consumed';
    }

    demoDb.batch_movements.push({
      id: demoDb.batch_movements.length + 1,
      batch_id: batch.id,
      ingredient_id: batch.ingredient_id,
      warehouse_id: batch.warehouse_id,
      quantity: transferQty.times(-1).toNumber(),
      type: 'transfer_out',
      reference_id: `transfer-${batch.id}-to-${destinationWarehouseId}`,
      created_at: new Date(),
      tenant_id: tid,
    });

    const newBatch = {
      id: demoDb.inventory_batches.length + 1,
      batch_number: batch.batch_number,
      ingredient_id: batch.ingredient_id,
      warehouse_id: destinationWarehouseId,
      supplier_id: batch.supplier_id,
      initial_quantity: transferQty.toNumber(),
      remaining_quantity: transferQty.toNumber(),
      unit_price: batch.unit_price,
      expiration_date: batch.expiration_date,
      production_date: batch.production_date,
      status: 'active',
      created_at: new Date(),
      updated_at: new Date(),
      tenant_id: tid,
    };
    demoDb.inventory_batches.push(newBatch);

    demoDb.batch_movements.push({
      id: demoDb.batch_movements.length + 1,
      batch_id: newBatch.id,
      ingredient_id: batch.ingredient_id,
      warehouse_id: destinationWarehouseId,
      quantity: transferQty.toNumber(),
      type: 'transfer_in',
      reference_id: `transfer-${batch.id}-to-${destinationWarehouseId}`,
      created_at: new Date(),
      tenant_id: tid,
    });

    await ensureStockRow(null, batch.warehouse_id, batch.ingredient_id, tid);
    await updateStockQuantity(null, batch.warehouse_id, batch.ingredient_id, transferQty.times(-1), tid);
    await ensureStockRow(null, destinationWarehouseId, batch.ingredient_id, tid);
    await updateStockQuantity(null, destinationWarehouseId, batch.ingredient_id, transferQty, tid);
    await logMovement(null, batch.warehouse_id, batch.ingredient_id, transferQty.times(-1), 'transfer_out', `batch-transfer-${batch.id}`, tid);
    await logMovement(null, destinationWarehouseId, batch.ingredient_id, transferQty, 'transfer_in', `batch-transfer-${batch.id}`, tid);

    eventBus.emit(Events.BATCH_TRANSFERRED, {
      tenantId: tid,
      batchId: batch.id,
      newBatchId: newBatch.id,
      batchNumber: batch.batch_number,
      ingredientId: batch.ingredient_id,
      sourceWarehouseId: batch.warehouse_id,
      destinationWarehouseId,
      quantity: transferQty.toNumber(),
    });

    return {
      source_batch: { ...batch, remaining_quantity: batch.remaining_quantity },
      destination_batch: newBatch,
      quantity: transferQty.toNumber(),
    };
  }

  const { client, release } = await getClient();
  try {
    await client.query('BEGIN');

    const batchResult = await client.query(
      'SELECT * FROM inventory_batches WHERE id = $1 AND tenant_id = $2 FOR UPDATE',
      [batchId, tid]
    );
    if (batchResult.rows.length === 0) throw new Error('Batch not found');
    const batch = batchResult.rows[0];
    if (batch.warehouse_id === destinationWarehouseId) {
      throw new Error('Destination warehouse must be different from source warehouse');
    }

    const batchRemaining = new Decimal(batch.remaining_quantity);
    if (batchRemaining.lessThan(transferQty)) {
      throw new Error(`Insufficient batch quantity. Available: ${batchRemaining.toString()}`);
    }

    const newRemaining = batchRemaining.minus(transferQty);
    const newStatus = newRemaining.equals(0) ? 'consumed' : batch.status;

    await client.query(
      `UPDATE inventory_batches
       SET remaining_quantity = $1, status = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 AND tenant_id = $4`,
      [newRemaining.toString(), newStatus, batchId, tid]
    );

    await client.query(
      `INSERT INTO batch_movements (batch_id, ingredient_id, warehouse_id, quantity, type, reference_id, tenant_id)
       VALUES ($1, $2, $3, $4, 'transfer_out', $5, $6)`,
      [batchId, batch.ingredient_id, batch.warehouse_id, transferQty.times(-1).toString(),
       `transfer-${batchId}-to-${destinationWarehouseId}`, tid]
    );

    const newBatchResult = await client.query(
      `INSERT INTO inventory_batches (batch_number, ingredient_id, warehouse_id, supplier_id, initial_quantity, remaining_quantity, unit_price, expiration_date, production_date, status, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', $10)
       RETURNING *`,
      [batch.batch_number, batch.ingredient_id, destinationWarehouseId, batch.supplier_id,
       transferQty.toString(), transferQty.toString(), batch.unit_price,
       batch.expiration_date, batch.production_date, tid]
    );
    const newBatch = newBatchResult.rows[0];

    await client.query(
      `INSERT INTO batch_movements (batch_id, ingredient_id, warehouse_id, quantity, type, reference_id, tenant_id)
       VALUES ($1, $2, $3, $4, 'transfer_in', $5, $6)`,
      [newBatch.id, batch.ingredient_id, destinationWarehouseId, transferQty.toString(),
       `transfer-${batchId}-to-${destinationWarehouseId}`, tid]
    );

    await ensureStockRow(client, batch.warehouse_id, batch.ingredient_id, tid);
    await updateStockQuantity(client, batch.warehouse_id, batch.ingredient_id, transferQty.times(-1), tid);
    await ensureStockRow(client, destinationWarehouseId, batch.ingredient_id, tid);
    await updateStockQuantity(client, destinationWarehouseId, batch.ingredient_id, transferQty, tid);
    await logMovement(client, batch.warehouse_id, batch.ingredient_id, transferQty.times(-1), 'transfer_out', `batch-transfer-${batchId}`, tid);
    await logMovement(client, destinationWarehouseId, batch.ingredient_id, transferQty, 'transfer_in', `batch-transfer-${batchId}`, tid);

    await client.query('COMMIT');

    eventBus.emit(Events.BATCH_TRANSFERRED, {
      tenantId: tid,
      batchId,
      newBatchId: newBatch.id,
      batchNumber: batch.batch_number,
      ingredientId: batch.ingredient_id,
      sourceWarehouseId: batch.warehouse_id,
      destinationWarehouseId,
      quantity: transferQty.toNumber(),
    });

    return {
      source_batch: await getBatchById(batchId, tid),
      destination_batch: newBatch,
      quantity: transferQty.toNumber(),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    release();
  }
}

export async function splitBatch(
  batchId: number,
  splitQuantity: number,
  tenantId?: number | null
): Promise<any> {
  const splitQty = new Decimal(splitQuantity);
  const tid = tenantId ?? 1;

  if (splitQty.lessThanOrEqualTo(0)) {
    throw new Error('Split quantity must be greater than zero');
  }

  if (isDemoMode) {
    const batch = demoDb.inventory_batches.find(
      (b: any) => b.id === batchId && b.tenant_id === tid
    );
    if (!batch) throw new Error('Batch not found');
    if (batch.status !== 'active' && batch.status !== 'partially_consumed') {
      throw new Error('Cannot split a batch that is not active');
    }

    const batchRemaining = new Decimal(batch.remaining_quantity);
    if (batchRemaining.lessThanOrEqualTo(splitQty) || batchRemaining.lessThanOrEqualTo(0)) {
      throw new Error('Split quantity must be less than remaining quantity');
    }

    batch.remaining_quantity = batchRemaining.minus(splitQty).toNumber();

    const newBatch = {
      id: demoDb.inventory_batches.length + 1,
      batch_number: `${batch.batch_number}-S`,
      ingredient_id: batch.ingredient_id,
      warehouse_id: batch.warehouse_id,
      supplier_id: batch.supplier_id,
      initial_quantity: splitQty.toNumber(),
      remaining_quantity: splitQty.toNumber(),
      unit_price: batch.unit_price,
      expiration_date: batch.expiration_date,
      production_date: batch.production_date,
      status: 'active',
      created_at: new Date(),
      updated_at: new Date(),
      tenant_id: tid,
    };
    demoDb.inventory_batches.push(newBatch);

    demoDb.batch_movements.push({
      id: demoDb.batch_movements.length + 1,
      batch_id: batch.id,
      ingredient_id: batch.ingredient_id,
      warehouse_id: batch.warehouse_id,
      quantity: splitQty.times(-1).toNumber(),
      type: 'split_out',
      reference_id: `split-${batch.id}-to-${newBatch.id}`,
      created_at: new Date(),
      tenant_id: tid,
    });

    demoDb.batch_movements.push({
      id: demoDb.batch_movements.length + 1,
      batch_id: newBatch.id,
      ingredient_id: batch.ingredient_id,
      warehouse_id: batch.warehouse_id,
      quantity: splitQty.toNumber(),
      type: 'split_in',
      reference_id: `split-${batch.id}-to-${newBatch.id}`,
      created_at: new Date(),
      tenant_id: tid,
    });

    eventBus.emit(Events.BATCH_SPLIT, {
      tenantId: tid,
      sourceBatchId: batch.id,
      newBatchId: newBatch.id,
      batchNumber: batch.batch_number,
      ingredientId: batch.ingredient_id,
      warehouseId: batch.warehouse_id,
      splitQuantity: splitQty.toNumber(),
    });

    return {
      source_batch: { ...batch, remaining_quantity: batch.remaining_quantity },
      new_batch: newBatch,
      split_quantity: splitQty.toNumber(),
    };
  }

  const { client, release } = await getClient();
  try {
    await client.query('BEGIN');

    const batchResult = await client.query(
      'SELECT * FROM inventory_batches WHERE id = $1 AND tenant_id = $2 FOR UPDATE',
      [batchId, tid]
    );
    if (batchResult.rows.length === 0) throw new Error('Batch not found');
    const batch = batchResult.rows[0];
    if (batch.status !== 'active' && batch.status !== 'partially_consumed') {
      throw new Error('Cannot split a batch that is not active');
    }

    const batchRemaining = new Decimal(batch.remaining_quantity);
    if (batchRemaining.lessThanOrEqualTo(splitQty) || batchRemaining.lessThanOrEqualTo(0)) {
      throw new Error('Split quantity must be less than remaining quantity');
    }

    const newRemaining = batchRemaining.minus(splitQty);
    await client.query(
      `UPDATE inventory_batches
       SET remaining_quantity = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND tenant_id = $3`,
      [newRemaining.toString(), batchId, tid]
    );

    await client.query(
      `INSERT INTO batch_movements (batch_id, ingredient_id, warehouse_id, quantity, type, reference_id, tenant_id)
       VALUES ($1, $2, $3, $4, 'split_out', $5, $6)`,
      [batchId, batch.ingredient_id, batch.warehouse_id, splitQty.times(-1).toString(),
       `split-${batchId}`, tid]
    );

    const newBatchResult = await client.query(
      `INSERT INTO inventory_batches (batch_number, ingredient_id, warehouse_id, supplier_id, initial_quantity, remaining_quantity, unit_price, expiration_date, production_date, status, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', $10)
       RETURNING *`,
      [`${batch.batch_number}-S`, batch.ingredient_id, batch.warehouse_id, batch.supplier_id,
       splitQty.toString(), splitQty.toString(), batch.unit_price,
       batch.expiration_date, batch.production_date, tid]
    );
    const newBatch = newBatchResult.rows[0];

    await client.query(
      `INSERT INTO batch_movements (batch_id, ingredient_id, warehouse_id, quantity, type, reference_id, tenant_id)
       VALUES ($1, $2, $3, $4, 'split_in', $5, $6)`,
      [newBatch.id, batch.ingredient_id, batch.warehouse_id, splitQty.toString(),
       `split-${batchId}`, tid]
    );

    await client.query('COMMIT');

    eventBus.emit(Events.BATCH_SPLIT, {
      tenantId: tid,
      sourceBatchId: batchId,
      newBatchId: newBatch.id,
      batchNumber: batch.batch_number,
      ingredientId: batch.ingredient_id,
      warehouseId: batch.warehouse_id,
      splitQuantity: splitQty.toNumber(),
    });

    return {
      source_batch: await getBatchById(batchId, tid),
      new_batch: newBatch,
      split_quantity: splitQty.toNumber(),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    release();
  }
}

export async function adjustBatch(
  batchId: number,
  newQuantity: number,
  reason: string,
  tenantId?: number | null
): Promise<any> {
  const newQty = new Decimal(newQuantity);
  const tid = tenantId ?? 1;

  if (newQty.lessThan(0)) {
    throw new Error('New quantity cannot be negative');
  }

  if (isDemoMode) {
    const batch = demoDb.inventory_batches.find(
      (b: any) => b.id === batchId && b.tenant_id === tid
    );
    if (!batch) throw new Error('Batch not found');
    if (batch.status === 'consumed' || batch.status === 'discarded' || batch.status === 'expired') {
      throw new Error('Cannot adjust a consumed, discarded, or expired batch');
    }

    const oldQty = new Decimal(batch.remaining_quantity);
    const delta = newQty.minus(oldQty);

    batch.remaining_quantity = newQty.toNumber();
    if (newQty.equals(0)) {
      batch.status = 'consumed';
    } else if (oldQty.equals(batch.initial_quantity) && delta.lessThan(0)) {
      batch.status = 'partially_consumed';
    }

    demoDb.batch_movements.push({
      id: demoDb.batch_movements.length + 1,
      batch_id: batch.id,
      ingredient_id: batch.ingredient_id,
      warehouse_id: batch.warehouse_id,
      quantity: delta.toNumber(),
      type: 'adjustment',
      reference_id: reason,
      created_at: new Date(),
      tenant_id: tid,
    });

    await ensureStockRow(null, batch.warehouse_id, batch.ingredient_id, tid);
    await updateStockQuantity(null, batch.warehouse_id, batch.ingredient_id, delta, tid);
    await logMovement(null, batch.warehouse_id, batch.ingredient_id, delta, 'batch_adjustment', `batch-adjust-${batch.id}`, tid);

    eventBus.emit(Events.BATCH_ADJUSTED, {
      tenantId: tid,
      batchId: batch.id,
      batchNumber: batch.batch_number,
      ingredientId: batch.ingredient_id,
      warehouseId: batch.warehouse_id,
      previousQuantity: oldQty.toNumber(),
      newQuantity: newQty.toNumber(),
      reason,
    });

    return {
      ...batch,
      previous_quantity: oldQty.toNumber(),
      new_quantity: newQty.toNumber(),
      reason,
    };
  }

  const { client, release } = await getClient();
  try {
    await client.query('BEGIN');

    const batchResult = await client.query(
      'SELECT * FROM inventory_batches WHERE id = $1 AND tenant_id = $2 FOR UPDATE',
      [batchId, tid]
    );
    if (batchResult.rows.length === 0) throw new Error('Batch not found');
    const batch = batchResult.rows[0];

    if (batch.status === 'consumed' || batch.status === 'discarded' || batch.status === 'expired') {
      throw new Error('Cannot adjust a consumed, discarded, or expired batch');
    }

    const oldQty = new Decimal(batch.remaining_quantity);
    const delta = newQty.minus(oldQty);

    let newStatus = batch.status;
    if (newQty.equals(0)) {
      newStatus = 'consumed';
    } else if (oldQty.equals(new Decimal(batch.initial_quantity)) && delta.lessThan(0)) {
      newStatus = 'partially_consumed';
    }

    await client.query(
      `UPDATE inventory_batches
       SET remaining_quantity = $1, status = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 AND tenant_id = $4`,
      [newQty.toString(), newStatus, batchId, tid]
    );

    await client.query(
      `INSERT INTO batch_movements (batch_id, ingredient_id, warehouse_id, quantity, type, reference_id, tenant_id)
       VALUES ($1, $2, $3, $4, 'adjustment', $5, $6)`,
      [batchId, batch.ingredient_id, batch.warehouse_id, delta.toString(), reason, tid]
    );

    if (!delta.equals(0)) {
      await ensureStockRow(client, batch.warehouse_id, batch.ingredient_id, tid);
      await updateStockQuantity(client, batch.warehouse_id, batch.ingredient_id, delta, tid);
      await logMovement(client, batch.warehouse_id, batch.ingredient_id, delta, 'batch_adjustment', `batch-adjust-${batch.id}`, tid);
    }

    await client.query('COMMIT');

    eventBus.emit(Events.BATCH_ADJUSTED, {
      tenantId: tid,
      batchId,
      batchNumber: batch.batch_number,
      ingredientId: batch.ingredient_id,
      warehouseId: batch.warehouse_id,
      previousQuantity: oldQty.toNumber(),
      newQuantity: newQty.toNumber(),
      reason,
    });

    return {
      ...batch,
      previous_quantity: oldQty.toNumber(),
      new_quantity: newQty.toNumber(),
      reason,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    release();
  }
}

export async function discardBatch(
  batchId: number,
  reason: string,
  tenantId?: number | null
): Promise<any> {
  const tid = tenantId ?? 1;

  if (isDemoMode) {
    const batch = demoDb.inventory_batches.find(
      (b: any) => b.id === batchId && b.tenant_id === tid
    );
    if (!batch) throw new Error('Batch not found');
    if (batch.status === 'discarded') throw new Error('Batch is already discarded');

    const remainingQty = new Decimal(batch.remaining_quantity);
    batch.status = 'discarded';
    batch.remaining_quantity = 0;

    demoDb.batch_movements.push({
      id: demoDb.batch_movements.length + 1,
      batch_id: batch.id,
      ingredient_id: batch.ingredient_id,
      warehouse_id: batch.warehouse_id,
      quantity: remainingQty.times(-1).toNumber(),
      type: 'discard',
      reference_id: reason,
      created_at: new Date(),
      tenant_id: tid,
    });

    await ensureStockRow(null, batch.warehouse_id, batch.ingredient_id, tid);
    await updateStockQuantity(null, batch.warehouse_id, batch.ingredient_id, remainingQty.times(-1), tid);
    await logMovement(null, batch.warehouse_id, batch.ingredient_id, remainingQty.times(-1), 'batch_discard', `batch-discard-${batch.id}`, tid);

    eventBus.emit(Events.BATCH_DISCARDED, {
      tenantId: tid,
      batchId: batch.id,
      batchNumber: batch.batch_number,
      ingredientId: batch.ingredient_id,
      warehouseId: batch.warehouse_id,
      quantityDiscarded: remainingQty.toNumber(),
      reason,
    });

    return { ...batch, reason };
  }

  const { client, release } = await getClient();
  try {
    await client.query('BEGIN');

    const batchResult = await client.query(
      'SELECT * FROM inventory_batches WHERE id = $1 AND tenant_id = $2 FOR UPDATE',
      [batchId, tid]
    );
    if (batchResult.rows.length === 0) throw new Error('Batch not found');
    const batch = batchResult.rows[0];
    if (batch.status === 'discarded') throw new Error('Batch is already discarded');

    const remainingQty = new Decimal(batch.remaining_quantity);

    await client.query(
      `UPDATE inventory_batches
       SET status = 'discarded', remaining_quantity = 0, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND tenant_id = $2`,
      [batchId, tid]
    );

    await client.query(
      `INSERT INTO batch_movements (batch_id, ingredient_id, warehouse_id, quantity, type, reference_id, tenant_id)
       VALUES ($1, $2, $3, $4, 'discard', $5, $6)`,
      [batchId, batch.ingredient_id, batch.warehouse_id, remainingQty.times(-1).toString(), reason, tid]
    );

    await ensureStockRow(client, batch.warehouse_id, batch.ingredient_id, tid);
    await updateStockQuantity(client, batch.warehouse_id, batch.ingredient_id, remainingQty.times(-1), tid);
    await logMovement(client, batch.warehouse_id, batch.ingredient_id, remainingQty.times(-1), 'batch_discard', `batch-discard-${batch.id}`, tid);

    await client.query('COMMIT');

    eventBus.emit(Events.BATCH_DISCARDED, {
      tenantId: tid,
      batchId,
      batchNumber: batch.batch_number,
      ingredientId: batch.ingredient_id,
      warehouseId: batch.warehouse_id,
      quantityDiscarded: remainingQty.toNumber(),
      reason,
    });

    return { ...batch, status: 'discarded', remaining_quantity: 0, reason };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    release();
  }
}

export async function expireBatches(tenantId?: number | null): Promise<{ expiredCount: number }> {
  const filter = resolveTenantFilter(tenantId);
  const tid = filter || 1;

  if (isDemoMode) {
    const now = new Date();
    const expiredBatches = demoDb.inventory_batches.filter((b: any) => {
      if (filter && b.tenant_id !== filter) return false;
      if (b.status !== 'active' && b.status !== 'partially_consumed') return false;
      if (!b.expiration_date) return false;
      return new Date(b.expiration_date) < now;
    });

    for (const batch of expiredBatches) {
      const remainingQty = new Decimal(batch.remaining_quantity);
      batch.status = 'expired';
      batch.remaining_quantity = 0;

      demoDb.batch_movements.push({
        id: demoDb.batch_movements.length + 1,
        batch_id: batch.id,
        ingredient_id: batch.ingredient_id,
        warehouse_id: batch.warehouse_id,
        quantity: remainingQty.times(-1).toNumber(),
        type: 'expired',
        reference_id: 'auto-expiry',
        created_at: new Date(),
        tenant_id: tid,
      });

      await ensureStockRow(null, batch.warehouse_id, batch.ingredient_id, tid);
      await updateStockQuantity(null, batch.warehouse_id, batch.ingredient_id, remainingQty.times(-1), tid);
      await logMovement(null, batch.warehouse_id, batch.ingredient_id, remainingQty.times(-1), 'batch_expired', `batch-expired-${batch.id}`, tid);

      eventBus.emit(Events.BATCH_EXPIRED, {
        tenantId: tid,
        batchId: batch.id,
        batchNumber: batch.batch_number,
        ingredientId: batch.ingredient_id,
        warehouseId: batch.warehouse_id,
        quantityExpired: remainingQty.toNumber(),
        expirationDate: batch.expiration_date,
      });
    }

    return { expiredCount: expiredBatches.length };
  }

  const now = new Date().toISOString();

  const expiredResult = await query(
    `UPDATE inventory_batches
     SET status = 'expired', remaining_quantity = 0, updated_at = CURRENT_TIMESTAMP
     WHERE tenant_id = $1
     AND status IN ('active', 'partially_consumed')
     AND expiration_date < $2
     AND expiration_date IS NOT NULL
     RETURNING id, batch_number, ingredient_id, warehouse_id, remaining_quantity, expiration_date`,
    [tid, now]
  );

  const expiredBatches = expiredResult.rows;

  for (const batch of expiredBatches) {
    const remainingQty = new Decimal(batch.remaining_quantity);

    await query(
      `INSERT INTO batch_movements (batch_id, ingredient_id, warehouse_id, quantity, type, reference_id, tenant_id)
       VALUES ($1, $2, $3, $4, 'expired', 'auto-expiry', $5)`,
      [batch.id, batch.ingredient_id, batch.warehouse_id, remainingQty.times(-1).toString(), tid]
    );

    const stockCheck = await query(
      'SELECT quantity FROM inventory_stocks WHERE department_id = $1 AND ingredient_id = $2 AND tenant_id = $3',
      [batch.warehouse_id, batch.ingredient_id, tid]
    );
    if (stockCheck.rows.length > 0) {
      await query(
        'UPDATE inventory_stocks SET quantity = GREATEST(0, quantity - $1), updated_at = CURRENT_TIMESTAMP WHERE department_id = $2 AND ingredient_id = $3 AND tenant_id = $4',
        [remainingQty.toString(), batch.warehouse_id, batch.ingredient_id, tid]
      );
    }

    await query(
      `INSERT INTO stock_movements (department_id, ingredient_id, quantity, type, reference_id, tenant_id)
       VALUES ($1, $2, $3, 'batch_expired', $4, $5)`,
      [batch.warehouse_id, batch.ingredient_id, remainingQty.times(-1).toString(), `batch-expired-${batch.id}`, tid]
    );

    eventBus.emit(Events.BATCH_EXPIRED, {
      tenantId: tid,
      batchId: batch.id,
      batchNumber: batch.batch_number,
      ingredientId: batch.ingredient_id,
      warehouseId: batch.warehouse_id,
      quantityExpired: remainingQty.toNumber(),
      expirationDate: batch.expiration_date,
    });
  }

  return { expiredCount: expiredBatches.length };
}

export async function getExpiringBatches(
  tenantId?: number | null,
  withinDays?: number
): Promise<{
  expiring_today: number;
  expiring_this_week: number;
  expired: number;
  near_expiration: number;
  inventory_value_at_risk: number;
}> {
  const filter = resolveTenantFilter(tenantId);
  const tid = filter || 1;
  const days = withinDays || 30;

  if (isDemoMode) {
    const now = new Date();
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    const endOfWeek = new Date(now);
    endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));
    const futureDate = new Date(now);
    futureDate.setDate(futureDate.getDate() + days);

    const relevantBatches = demoDb.inventory_batches.filter((b: any) => {
      if (filter && b.tenant_id !== filter) return false;
      return b.expiration_date != null;
    });

    let expiringToday = 0;
    let expiringThisWeek = 0;
    let expired = 0;
    let nearExpiration = 0;
    let valueAtRisk = new Decimal(0);

    for (const batch of relevantBatches) {
      const expDate = new Date(batch.expiration_date);
      const remainingQty = new Decimal(batch.remaining_quantity);
      const unitPrice = new Decimal(batch.unit_price || 0);

      if (expDate < now && (batch.status === 'active' || batch.status === 'partially_consumed')) {
        expired++;
      }

      if (expDate >= now && expDate <= endOfToday) {
        expiringToday++;
        valueAtRisk = valueAtRisk.plus(remainingQty.times(unitPrice));
      }

      if (expDate >= now && expDate <= endOfWeek) {
        expiringThisWeek++;
        valueAtRisk = valueAtRisk.plus(remainingQty.times(unitPrice));
      }

      if (expDate >= now && expDate <= futureDate) {
        nearExpiration++;
        valueAtRisk = valueAtRisk.plus(remainingQty.times(unitPrice));
      }
    }

    return {
      expiring_today: expiringToday,
      expiring_this_week: expiringThisWeek,
      expired,
      near_expiration: nearExpiration,
      inventory_value_at_risk: valueAtRisk.toNumber(),
    };
  }

  const result = await query(
    `SELECT
       COUNT(*) FILTER (WHERE expiration_date::date = CURRENT_DATE AND status IN ('active', 'partially_consumed')) AS expiring_today,
       COUNT(*) FILTER (WHERE expiration_date::date <= (CURRENT_DATE + INTERVAL '7 days')::date AND expiration_date::date >= CURRENT_DATE AND status IN ('active', 'partially_consumed')) AS expiring_this_week,
       COUNT(*) FILTER (WHERE expiration_date < CURRENT_TIMESTAMP AND status IN ('active', 'partially_consumed')) AS expired,
       COUNT(*) FILTER (WHERE expiration_date::date <= (CURRENT_DATE + $1::integer)::date AND expiration_date::date >= CURRENT_DATE AND status IN ('active', 'partially_consumed')) AS near_expiration,
       COALESCE(SUM(remaining_quantity * unit_price) FILTER (WHERE expiration_date::date <= (CURRENT_DATE + $1::integer)::date AND expiration_date::date >= CURRENT_DATE AND status IN ('active', 'partially_consumed')), 0) AS inventory_value_at_risk
     FROM inventory_batches
     WHERE tenant_id = $2 AND expiration_date IS NOT NULL`,
    [days, tid]
  );

  const row = result.rows[0];
  return {
    expiring_today: parseInt(row.expiring_today || '0', 10),
    expiring_this_week: parseInt(row.expiring_this_week || '0', 10),
    expired: parseInt(row.expired || '0', 10),
    near_expiration: parseInt(row.near_expiration || '0', 10),
    inventory_value_at_risk: parseFloat(row.inventory_value_at_risk || '0'),
  };
}
