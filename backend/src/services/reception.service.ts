import { Decimal } from 'decimal.js';
import { query, isDemoMode, demoDb, getClient } from '../database';
import { ensureStockRow, updateStockQuantity, logMovement } from './stock.service';
import { eventBus, Events } from './event.service';

function resolveTenantFilter(tenantId?: number | null): number | undefined {
  if (tenantId === null) return undefined;
  return tenantId ?? 1;
}

export async function generateBatchNumber(tenantId: number, ingredientId: number): Promise<string> {
  const tid = tenantId || 1;
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const dateStr = `${y}${m}${d}`;

  if (isDemoMode) {
    const existing = demoDb.inventory_batches.filter(
      (b: any) => b.tenant_id === tid && b.ingredient_id === ingredientId
    );
    const seq = existing.length + 1;
    return `BATCH-${tid}-${ingredientId}-${dateStr}-${String(seq).padStart(3, '0')}`;
  }

  const result = await query(
    `SELECT COUNT(*) as count FROM inventory_batches
     WHERE tenant_id = $1 AND ingredient_id = $2
     AND batch_number LIKE $3`,
    [tid, ingredientId, `BATCH-${tid}-${ingredientId}-${dateStr}-%`]
  );
  const seq = (parseInt(result.rows[0]?.count || '0', 10)) + 1;
  return `BATCH-${tid}-${ingredientId}-${dateStr}-${String(seq).padStart(3, '0')}`;
}

function generateReceptionNumber(tenantId: number): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const dateStr = `${y}${m}${d}`;

  if (isDemoMode) {
    const existing = demoDb.goods_receptions.filter((r: any) => r.tenant_id === tenantId);
    const seq = existing.length + 1;
    return `REC-${tenantId}-${dateStr}-${String(seq).padStart(3, '0')}`;
  }

  return `REC-${tenantId}-${dateStr}-NNN`;
}

export async function createReception(data: any, tenantId?: number | null, userId?: number | null): Promise<any> {
  const tid = tenantId ?? 1;

  const validStatuses = ['approved', 'ordered', 'partially_received'];

  if (isDemoMode) {
    const po = demoDb.purchase_orders.find(
      (p: any) => p.id === data.purchase_order_id && p.tenant_id === tid
    );
    if (!po) throw new Error('Purchase order not found');
    if (!validStatuses.includes(po.status)) {
      throw new Error(`Cannot receive against a purchase order with status '${po.status}'`);
    }

    const receptionNumber = generateReceptionNumber(tid);
    const reception: any = {
      id: demoDb.goods_receptions.length + 1,
      tenant_id: tid,
      purchase_order_id: data.purchase_order_id,
      warehouse_id: data.warehouse_id,
      reception_number: receptionNumber,
      reception_date: new Date(),
      notes: data.notes || null,
      received_by: userId || null,
      created_at: new Date(),
      updated_at: new Date(),
    };
    demoDb.goods_receptions.push(reception);

    let hasRejected = false;
    let hasDamaged = false;
    let hasReceived = false;

    for (const item of data.items) {
      const poi = demoDb.purchase_order_items.find(
        (pi: any) => pi.id === item.purchase_order_item_id && pi.tenant_id === tid
      );

      const receptionItem: any = {
        id: demoDb.goods_reception_items.length + 1,
        tenant_id: tid,
        goods_reception_id: reception.id,
        purchase_order_item_id: item.purchase_order_item_id,
        ingredient_id: item.ingredient_id,
        received_quantity: item.received_quantity || 0,
        rejected_quantity: item.rejected_quantity || 0,
        damaged_quantity: item.damaged_quantity || 0,
        unit_price: poi?.unit_price || null,
        batch_number: item.batch_number || null,
        expiration_date: item.expiration_date || null,
        storage_location: item.storage_location || null,
        notes: null,
        created_at: new Date(),
      };
      demoDb.goods_reception_items.push(receptionItem);

      if ((item.received_quantity || 0) > 0) {
        hasReceived = true;

        const batchNumber = item.batch_number || await generateBatchNumber(tid, item.ingredient_id);
        const unitPrice = poi ? new Decimal(poi.unit_price || 0) : new Decimal(0);
        const receivedQty = new Decimal(item.received_quantity);
        const totalCost = unitPrice.times(receivedQty);

        const batch: any = {
          id: demoDb.inventory_batches.length + 1,
          tenant_id: tid,
          batch_number: batchNumber,
          ingredient_id: item.ingredient_id,
          supplier_id: null,
          purchase_order_id: data.purchase_order_id,
          goods_reception_id: reception.id,
          warehouse_id: data.warehouse_id,
          initial_quantity: item.received_quantity,
          remaining_quantity: item.received_quantity,
          unit: poi?.inventory_unit || null,
          unit_price: unitPrice.toNumber(),
          total_cost: totalCost.toNumber(),
          manufacturing_date: null,
          expiration_date: item.expiration_date || null,
          storage_location: item.storage_location || null,
          status: 'active',
          notes: null,
          created_at: new Date(),
          updated_at: new Date(),
        };
        demoDb.inventory_batches.push(batch);

        demoDb.batch_movements.push({
          id: demoDb.batch_movements.length + 1,
          tenant_id: tid,
          batch_id: batch.id,
          ingredient_id: item.ingredient_id,
          quantity: item.received_quantity,
          movement_type: 'reception',
          reference_type: 'goods_reception',
          reference_id: reception.id,
          unit_price: unitPrice.toNumber(),
          notes: null,
          created_at: new Date(),
        });

        await ensureStockRow(null, data.warehouse_id, item.ingredient_id, tid);
        await updateStockQuantity(null, data.warehouse_id, item.ingredient_id, receivedQty, tid);
        await logMovement(null, data.warehouse_id, item.ingredient_id, receivedQty, 'purchase', `reception-${reception.id}`, tid);

        if (poi) {
          poi.received_quantity = (poi.received_quantity || 0) + (item.received_quantity || 0);
          poi.rejected_quantity = (poi.rejected_quantity || 0) + (item.rejected_quantity || 0);
          poi.damaged_quantity = (poi.damaged_quantity || 0) + (item.damaged_quantity || 0);
        }
      }

      if ((item.rejected_quantity || 0) > 0) hasRejected = true;
      if ((item.damaged_quantity || 0) > 0) hasDamaged = true;
    }

    if (hasReceived) {
      const poItems = demoDb.purchase_order_items.filter(
        (pi: any) => pi.purchase_order_id === data.purchase_order_id && pi.tenant_id === tid
      );
      const allFullyReceived = poItems.every(
        (pi: any) => new Decimal(pi.received_quantity || 0).greaterThanOrEqualTo(new Decimal(pi.ordered_quantity || 0))
      );
      po.status = allFullyReceived ? 'received' : 'partially_received';

      if (allFullyReceived) {
        eventBus.emit(Events.GOODS_RECEIVED, {
          tenantId: tid, receptionId: reception.id, purchaseOrderId: data.purchase_order_id,
          receptionNumber, itemsCount: data.items.length, receivedBy: userId,
        });
      } else {
        eventBus.emit(Events.GOODS_PARTIALLY_RECEIVED, {
          tenantId: tid, receptionId: reception.id, purchaseOrderId: data.purchase_order_id,
          receptionNumber, itemsCount: data.items.length, receivedBy: userId,
        });
      }
    }

    if (hasRejected) {
      eventBus.emit(Events.GOODS_REJECTED, {
        tenantId: tid, receptionId: reception.id, purchaseOrderId: data.purchase_order_id,
        receptionNumber, receivedBy: userId,
      });
    }

    if (hasDamaged) {
      eventBus.emit(Events.GOODS_DAMAGED, {
        tenantId: tid, receptionId: reception.id, purchaseOrderId: data.purchase_order_id,
        receptionNumber, receivedBy: userId,
      });
    }

    return reception;
  }

  // PostgreSQL mode
  const { client, release } = await getClient();
  try {
    await client.query('BEGIN');

    const poResult = await client.query(
      `SELECT * FROM purchase_orders WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [data.purchase_order_id, tid]
    );
    if (poResult.rows.length === 0) throw new Error('Purchase order not found');
    const po = poResult.rows[0];
    if (!validStatuses.includes(po.status)) {
      throw new Error(`Cannot receive against a purchase order with status '${po.status}'`);
    }

    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const seqResult = await client.query(
      `SELECT COUNT(*) as count FROM goods_receptions WHERE tenant_id = $1 AND reception_number LIKE $2`,
      [tid, `REC-${tid}-${dateStr}-%`]
    );
    const recSeq = (parseInt(seqResult.rows[0]?.count || '0', 10)) + 1;
    const receptionNumber = `REC-${tid}-${dateStr}-${String(recSeq).padStart(3, '0')}`;

    const receptionResult = await client.query(
      `INSERT INTO goods_receptions (tenant_id, purchase_order_id, warehouse_id, reception_number, notes, received_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [tid, data.purchase_order_id, data.warehouse_id, receptionNumber, data.notes || null, userId]
    );
    const reception = receptionResult.rows[0];

    let hasRejected = false;
    let hasDamaged = false;
    let hasReceived = false;

    for (const item of data.items) {
      await client.query(
        `INSERT INTO goods_reception_items (tenant_id, goods_reception_id, purchase_order_item_id, ingredient_id, received_quantity, rejected_quantity, damaged_quantity, batch_number, expiration_date, storage_location)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [tid, reception.id, item.purchase_order_item_id, item.ingredient_id,
         item.received_quantity || 0, item.rejected_quantity || 0, item.damaged_quantity || 0,
         item.batch_number || null, item.expiration_date || null, item.storage_location || null]
      );

      if ((item.received_quantity || 0) > 0) {
        hasReceived = true;

        const poiResult = await client.query(
          'SELECT * FROM purchase_order_items WHERE id = $1 AND tenant_id = $2',
          [item.purchase_order_item_id, tid]
        );
        const poi = poiResult.rows[0];

        const batchNumber = item.batch_number || await generateBatchNumber(tid, item.ingredient_id);
        const unitPrice = poi ? new Decimal(poi.unit_price || 0) : new Decimal(0);
        const receivedQty = new Decimal(item.received_quantity);
        const totalCost = unitPrice.times(receivedQty);

        const batchResult = await client.query(
          `INSERT INTO inventory_batches (tenant_id, batch_number, ingredient_id, purchase_order_id, goods_reception_id, warehouse_id, initial_quantity, remaining_quantity, unit, unit_price, total_cost, expiration_date, storage_location)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
          [tid, batchNumber, item.ingredient_id, data.purchase_order_id, reception.id, data.warehouse_id,
           item.received_quantity, item.received_quantity, poi?.inventory_unit || null, unitPrice.toString(),
           totalCost.toString(), item.expiration_date || null, item.storage_location || null]
        );
        const batch = batchResult.rows[0];

        await client.query(
          `INSERT INTO batch_movements (tenant_id, batch_id, ingredient_id, quantity, movement_type, reference_type, reference_id, unit_price)
           VALUES ($1, $2, $3, $4, 'reception', 'goods_reception', $5, $6)`,
          [tid, batch.id, item.ingredient_id, item.received_quantity, reception.id, unitPrice.toString()]
        );

        await ensureStockRow(client, data.warehouse_id, item.ingredient_id, tid);
        await updateStockQuantity(client, data.warehouse_id, item.ingredient_id, receivedQty, tid);
        await logMovement(client, data.warehouse_id, item.ingredient_id, receivedQty, 'purchase', `reception-${reception.id}`, tid);

        await client.query(
          `UPDATE purchase_order_items SET received_quantity = received_quantity + $1, rejected_quantity = rejected_quantity + $2, damaged_quantity = damaged_quantity + $3 WHERE id = $4`,
          [item.received_quantity, item.rejected_quantity || 0, item.damaged_quantity || 0, item.purchase_order_item_id]
        );
      }

      if ((item.rejected_quantity || 0) > 0) hasRejected = true;
      if ((item.damaged_quantity || 0) > 0) hasDamaged = true;
    }

    let newStatus: string | null = null;
    if (hasReceived) {
      const allItemsResult = await client.query(
        'SELECT ordered_quantity, received_quantity FROM purchase_order_items WHERE purchase_order_id = $1 AND tenant_id = $2',
        [data.purchase_order_id, tid]
      );
      const allFullyReceived = allItemsResult.rows.every(
        (i: any) => new Decimal(i.received_quantity).greaterThanOrEqualTo(new Decimal(i.ordered_quantity))
      );
      newStatus = allFullyReceived ? 'received' : 'partially_received';

      await client.query(
        `UPDATE purchase_orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND tenant_id = $3`,
        [newStatus, data.purchase_order_id, tid]
      );
    }

    await client.query('COMMIT');

    if (hasReceived) {
      if (newStatus === 'received') {
        eventBus.emit(Events.GOODS_RECEIVED, {
          tenantId: tid, receptionId: reception.id, purchaseOrderId: data.purchase_order_id,
          receptionNumber, itemsCount: data.items.length, receivedBy: userId,
        });
      } else {
        eventBus.emit(Events.GOODS_PARTIALLY_RECEIVED, {
          tenantId: tid, receptionId: reception.id, purchaseOrderId: data.purchase_order_id,
          receptionNumber, itemsCount: data.items.length, receivedBy: userId,
        });
      }
    }

    if (hasRejected) {
      eventBus.emit(Events.GOODS_REJECTED, {
        tenantId: tid, receptionId: reception.id, purchaseOrderId: data.purchase_order_id,
        receptionNumber, receivedBy: userId,
      });
    }

    if (hasDamaged) {
      eventBus.emit(Events.GOODS_DAMAGED, {
        tenantId: tid, receptionId: reception.id, purchaseOrderId: data.purchase_order_id,
        receptionNumber, receivedBy: userId,
      });
    }

    return reception;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    release();
  }
}

export async function getAllReceptions(
  tenantId?: number | null,
  filters?: {
    po_number?: string;
    date_from?: string;
    date_to?: string;
    page?: number;
    limit?: number;
  }
): Promise<{ data: any[]; total: number; page: number; limit: number }> {
  const filter = resolveTenantFilter(tenantId);
  const page = filters?.page || 1;
  const limit = filters?.limit || 20;
  const offset = (page - 1) * limit;

  if (isDemoMode) {
    let items = demoDb.goods_receptions
      .filter((r: any) => !filter || r.tenant_id === filter)
      .map((r: any) => {
        const po = demoDb.purchase_orders.find((po: any) => po.id === r.purchase_order_id);
        const supplier = po ? demoDb.suppliers.find((s: any) => s.id === po.supplier_id) : null;
        const warehouse = demoDb.departments.find((d: any) => d.id === r.warehouse_id);
        const itemsCount = demoDb.goods_reception_items.filter(
          (i: any) => i.goods_reception_id === r.id
        ).length;
        return {
          ...r,
          po_reference: po?.reference_number || null,
          supplier_name: supplier?.name || 'Unknown',
          warehouse_name: warehouse?.name || 'Unknown',
          items_count: itemsCount,
        };
      });

    if (filters?.po_number) {
      const q = filters.po_number.toLowerCase();
      items = items.filter((r: any) => r.po_reference && r.po_reference.toLowerCase().includes(q));
    }
    if (filters?.date_from) {
      const from = new Date(filters.date_from);
      items = items.filter((r: any) => new Date(r.reception_date) >= from);
    }
    if (filters?.date_to) {
      const to = new Date(filters.date_to);
      items = items.filter((r: any) => new Date(r.reception_date) <= to);
    }

    items.sort((a: any, b: any) => new Date(b.reception_date).getTime() - new Date(a.reception_date).getTime());
    const total = items.length;
    const paginated = items.slice(offset, offset + limit);
    return { data: paginated, total, page, limit };
  }

  let where = filter ? 'WHERE gr.tenant_id = $1' : '';
  const params: any[] = filter ? [filter] : [];
  let paramIdx = filter ? 2 : 1;

  if (filters?.po_number) {
    where += `${where ? ' AND' : 'WHERE'} po.reference_number ILIKE $${paramIdx}`;
    params.push(`%${filters.po_number}%`);
    paramIdx++;
  }
  if (filters?.date_from) {
    where += `${where ? ' AND' : 'WHERE'} gr.reception_date >= $${paramIdx}`;
    params.push(filters.date_from);
    paramIdx++;
  }
  if (filters?.date_to) {
    where += `${where ? ' AND' : 'WHERE'} gr.reception_date <= $${paramIdx}`;
    params.push(filters.date_to);
    paramIdx++;
  }

  const countResult = await query(
    `SELECT COUNT(*) FROM goods_receptions gr
     LEFT JOIN purchase_orders po ON gr.purchase_order_id = po.id
     ${where}`,
    params
  );
  const total = parseInt(countResult.rows[0]?.count || '0', 10);

  params.push(limit, offset);
  const result = await query(
    `SELECT gr.*, po.reference_number AS po_reference,
            s.name AS supplier_name,
            d.name AS warehouse_name,
            (SELECT COUNT(*) FROM goods_reception_items WHERE goods_reception_id = gr.id) AS items_count
     FROM goods_receptions gr
     LEFT JOIN purchase_orders po ON gr.purchase_order_id = po.id
     LEFT JOIN suppliers s ON po.supplier_id = s.id
     LEFT JOIN departments d ON gr.warehouse_id = d.id
     ${where}
     ORDER BY gr.reception_date DESC
     LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
    params
  );

  return { data: result.rows, total, page, limit };
}

export async function getReceptionById(id: number, tenantId?: number | null): Promise<any> {
  const filter = resolveTenantFilter(tenantId);

  if (isDemoMode) {
    const reception = demoDb.goods_receptions.find(
      (r: any) => r.id === id && (!filter || r.tenant_id === filter)
    );
    if (!reception) return null;

    const items = demoDb.goods_reception_items
      .filter((i: any) => i.goods_reception_id === id)
      .map((i: any) => {
        const ing = demoDb.ingredients.find((ing: any) => ing.id === i.ingredient_id);
        return {
          ...i,
          ingredient_name: ing?.name || 'Unknown',
          ingredient_unit: ing?.unit || '',
        };
      });

    const po = demoDb.purchase_orders.find((po: any) => po.id === reception.purchase_order_id);
    const warehouse = demoDb.departments.find((d: any) => d.id === reception.warehouse_id);

    return {
      ...reception,
      items,
      po_reference: po?.reference_number || null,
      po_status: po?.status || null,
      warehouse_name: warehouse?.name || 'Unknown',
    };
  }

  const receptionResult = filter
    ? await query('SELECT * FROM goods_receptions WHERE id = $1 AND tenant_id = $2', [id, filter])
    : await query('SELECT * FROM goods_receptions WHERE id = $1', [id]);
  if (receptionResult.rows.length === 0) return null;
  const reception = receptionResult.rows[0];

  const itemsResult = await query(
    `SELECT gri.*, i.name AS ingredient_name, i.unit AS ingredient_unit
     FROM goods_reception_items gri
     LEFT JOIN ingredients i ON gri.ingredient_id = i.id
     WHERE gri.goods_reception_id = $1`,
    [id]
  );

  const poResult = filter
    ? await query('SELECT reference_number, status FROM purchase_orders WHERE id = $1 AND tenant_id = $2', [reception.purchase_order_id, filter])
    : await query('SELECT reference_number, status FROM purchase_orders WHERE id = $1', [reception.purchase_order_id]);

  const warehouseResult = filter
    ? await query('SELECT name FROM departments WHERE id = $1 AND tenant_id = $2', [reception.warehouse_id, filter])
    : await query('SELECT name FROM departments WHERE id = $1', [reception.warehouse_id]);

  return {
    ...reception,
    items: itemsResult.rows,
    po_reference: poResult.rows[0]?.reference_number || null,
    po_status: poResult.rows[0]?.status || null,
    warehouse_name: warehouseResult.rows[0]?.name || 'Unknown',
  };
}
