import { query, isDemoMode, demoDb, getClient } from '../database';
import { eventBus, Events } from './event.service';

function resolveTenantFilter(tenantId?: number | null): number | undefined {
  if (tenantId === null) return undefined;
  return tenantId ?? 1;
}

function calculateLineTotal(
  unitPrice: number,
  orderedQuantity: number,
  discountPercent: number,
  taxRate: number
): { line_total: number; discount_amount: number; tax_amount: number } {
  const subtotal = unitPrice * orderedQuantity;
  const discountAmount = subtotal * (discountPercent / 100);
  const afterDiscount = subtotal - discountAmount;
  const taxAmount = afterDiscount * (taxRate / 100);
  const lineTotal = afterDiscount + taxAmount;
  return {
    line_total: Math.round(lineTotal * 100) / 100,
    discount_amount: Math.round(discountAmount * 100) / 100,
    tax_amount: Math.round(taxAmount * 100) / 100,
  };
}

function recalcOrderTotals(items: any[]): { subtotal: number; discount_total: number; tax_total: number; total: number } {
  let subtotal = 0;
  let discountTotal = 0;
  let taxTotal = 0;
  for (const item of items) {
    subtotal += item.unit_price * item.ordered_quantity;
    discountTotal += item.discount_amount || 0;
    taxTotal += item.tax_amount || 0;
  }
  const total = subtotal - discountTotal + taxTotal;
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    discount_total: Math.round(discountTotal * 100) / 100,
    tax_total: Math.round(taxTotal * 100) / 100,
    total: Math.round(total * 100) / 100,
  };
}

export async function generateReferenceNumber(tenantId?: number | null): Promise<string> {
  const filter = resolveTenantFilter(tenantId);
  const tid = filter ?? 1;
  const now = new Date();
  const yyyy = now.getFullYear().toString();
  const mm = (now.getMonth() + 1).toString().padStart(2, '0');
  const dd = now.getDate().toString().padStart(2, '0');
  const dateStr = `${yyyy}${mm}${dd}`;

  if (isDemoMode) {
    const existing = demoDb.purchase_orders
      .filter((po: any) => po.tenant_id === tid)
      .map((po: any) => po.reference_number);
    let seq = 1;
    const prefix = `PO-${tid}-${dateStr}-`;
    while (existing.includes(`${prefix}${seq.toString().padStart(3, '0')}`)) {
      seq++;
    }
    return `${prefix}${seq.toString().padStart(3, '0')}`;
  }

  const prefix = `PO-${tid}-${dateStr}-`;
  const lastResult = await query(
    `SELECT reference_number FROM purchase_orders
     WHERE tenant_id = $1 AND reference_number LIKE $2
     ORDER BY id DESC LIMIT 1`,
    [tid, `${prefix}%`]
  );
  let seq = 1;
  if (lastResult.rows.length > 0) {
    const lastRef = lastResult.rows[0].reference_number;
    const lastSeq = parseInt(lastRef.split('-').pop(), 10);
    if (!isNaN(lastSeq)) {
      seq = lastSeq + 1;
    }
  }
  return `${prefix}${seq.toString().padStart(3, '0')}`;
}

export async function getAllPurchaseOrders(
  tenantId?: number | null,
  filters?: {
    status?: string;
    supplier_id?: number;
    date_from?: string;
    date_to?: string;
    search?: string;
    page?: number;
    perPage?: number;
  }
): Promise<{ orders: any[]; total: number; page: number; perPage: number; totalPages: number }> {
  const filter = resolveTenantFilter(tenantId);
  const currentPage = filters?.page || 1;
  const itemsPerPage = filters?.perPage || 10;
  const offset = (currentPage - 1) * itemsPerPage;

  if (isDemoMode) {
    let orders = filter
      ? demoDb.purchase_orders.filter((po: any) => po.tenant_id === filter)
      : [...demoDb.purchase_orders];

    if (filters?.status) {
      orders = orders.filter((po: any) => po.status === filters.status);
    }
    if (filters?.supplier_id) {
      orders = orders.filter((po: any) => po.supplier_id === filters.supplier_id);
    }
    if (filters?.date_from) {
      const from = new Date(filters.date_from);
      orders = orders.filter((po: any) => new Date(po.created_at) >= from);
    }
    if (filters?.date_to) {
      const to = new Date(filters.date_to);
      orders = orders.filter((po: any) => new Date(po.created_at) <= to);
    }
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      orders = orders.filter((po: any) =>
        po.reference_number.toLowerCase().includes(q)
      );
    }

    orders.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const total = orders.length;
    const paginated = orders.slice(offset, offset + itemsPerPage).map((po: any) => {
      const supplier = demoDb.suppliers.find((s: any) => s.id === po.supplier_id);
      const warehouse = demoDb.departments.find((d: any) => d.id === po.warehouse_id);
      const user = demoDb.users.find((u: any) => u.id === po.created_by);
      return {
        ...po,
        supplier_name: supplier?.name || null,
        warehouse_name: warehouse?.name || null,
        created_by_name: user?.username || user?.full_name || null,
      };
    });

    return {
      orders: paginated,
      total,
      page: currentPage,
      perPage: itemsPerPage,
      totalPages: Math.ceil(total / itemsPerPage),
    };
  }

  let sql = `SELECT po.*, s.name as supplier_name, d.name as warehouse_name,
             u.username as created_by_name
             FROM purchase_orders po
             LEFT JOIN suppliers s ON po.supplier_id = s.id
             LEFT JOIN departments d ON po.warehouse_id = d.id
             LEFT JOIN users u ON po.created_by = u.id
             WHERE po.tenant_id = $1`;
  const params: any[] = [filter ?? 1];
  let countSql = 'SELECT COUNT(*) FROM purchase_orders WHERE tenant_id = $1';
  const countParams: any[] = [filter ?? 1];
  let paramIndex = 2;

  if (filters?.status) {
    sql += ` AND po.status = $${paramIndex}`;
    countSql += ` AND status = $${paramIndex}`;
    params.push(filters.status);
    countParams.push(filters.status);
    paramIndex++;
  }
  if (filters?.supplier_id) {
    sql += ` AND po.supplier_id = $${paramIndex}`;
    countSql += ` AND supplier_id = $${paramIndex}`;
    params.push(filters.supplier_id);
    countParams.push(filters.supplier_id);
    paramIndex++;
  }
  if (filters?.date_from) {
    sql += ` AND po.created_at >= $${paramIndex}`;
    countSql += ` AND created_at >= $${paramIndex}`;
    params.push(filters.date_from);
    countParams.push(filters.date_from);
    paramIndex++;
  }
  if (filters?.date_to) {
    sql += ` AND po.created_at <= $${paramIndex}`;
    countSql += ` AND created_at <= $${paramIndex}`;
    params.push(filters.date_to);
    countParams.push(filters.date_to);
    paramIndex++;
  }
  if (filters?.search) {
    sql += ` AND LOWER(po.reference_number) LIKE $${paramIndex}`;
    countSql += ` AND LOWER(reference_number) LIKE $${paramIndex}`;
    params.push(`%${filters.search.toLowerCase()}%`);
    countParams.push(`%${filters.search.toLowerCase()}%`);
    paramIndex++;
  }

  const countResult = await query(countSql, countParams);
  const total = parseInt(countResult.rows[0].count, 10);

  sql += ` ORDER BY po.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(itemsPerPage, offset);

  const result = await query(sql, params);
  return {
    orders: result.rows,
    total,
    page: currentPage,
    perPage: itemsPerPage,
    totalPages: Math.ceil(total / itemsPerPage),
  };
}

export async function getPurchaseOrderById(id: number, tenantId?: number | null): Promise<any> {
  const filter = resolveTenantFilter(tenantId);
  const tid = filter ?? 1;

  if (isDemoMode) {
    const po = demoDb.purchase_orders.find((p: any) => p.id === id && p.tenant_id === tid);
    if (!po) return null;

    const items = demoDb.purchase_order_items
      .filter((i: any) => i.purchase_order_id === id)
      .map((i: any) => {
        const ing = demoDb.ingredients.find((g: any) => g.id === i.ingredient_id);
        return { ...i, ingredient_name: ing?.name || null };
      });

    const supplier = demoDb.suppliers.find((s: any) => s.id === po.supplier_id);
    const warehouse = demoDb.departments.find((d: any) => d.id === po.warehouse_id);
    const user = demoDb.users.find((u: any) => u.id === po.created_by);

    return {
      ...po,
      items,
      supplier_name: supplier?.name || null,
      warehouse_name: warehouse?.name || null,
      created_by_name: user?.username || user?.full_name || null,
    };
  }

  const result = await query(
    `SELECT po.*, s.name as supplier_name, d.name as warehouse_name,
            u.username as created_by_name
     FROM purchase_orders po
     LEFT JOIN suppliers s ON po.supplier_id = s.id
     LEFT JOIN departments d ON po.warehouse_id = d.id
     LEFT JOIN users u ON po.created_by = u.id
     WHERE po.id = $1 AND po.tenant_id = $2`,
    [id, tid]
  );
  if (result.rows.length === 0) return null;

  const itemsResult = await query(
    `SELECT poi.*, i.name as ingredient_name
     FROM purchase_order_items poi
     LEFT JOIN ingredients i ON poi.ingredient_id = i.id
     WHERE poi.purchase_order_id = $1 AND poi.tenant_id = $2`,
    [id, tid]
  );

  return { ...result.rows[0], items: itemsResult.rows };
}

export async function createPurchaseOrder(
  data: {
    supplier_id: number;
    warehouse_id: number;
    expected_delivery?: string;
    currency?: string;
    notes?: string;
    items: Array<{
      ingredient_id: number;
      ordered_quantity: number;
      purchase_unit: string;
      inventory_unit: string;
      conversion_ratio: number;
      unit_price: number;
      discount_percent?: number;
      tax_rate?: number;
      line_notes?: string;
    }>;
  },
  tenantId?: number | null,
  userId?: number | null
): Promise<any> {
  const filter = resolveTenantFilter(tenantId);
  const tid = filter ?? 1;
  const uid = userId ?? null;

  if (!data.items || data.items.length === 0) {
    throw new Error('Purchase order must have at least one item.');
  }

  const referenceNumber = await generateReferenceNumber(tid);
  const now = new Date().toISOString();

  const lineItems = data.items.map((item) => {
    const calc = calculateLineTotal(
      item.unit_price,
      item.ordered_quantity,
      item.discount_percent || 0,
      item.tax_rate || 0
    );
    return {
      ingredient_id: item.ingredient_id,
      ordered_quantity: item.ordered_quantity,
      purchase_unit: item.purchase_unit,
      inventory_unit: item.inventory_unit,
      conversion_ratio: item.conversion_ratio,
      unit_price: item.unit_price,
      discount_percent: item.discount_percent || 0,
      tax_rate: item.tax_rate || 0,
      discount_amount: calc.discount_amount,
      tax_amount: calc.tax_amount,
      line_total: calc.line_total,
      line_notes: item.line_notes || null,
    };
  });

  const totals = recalcOrderTotals(lineItems);

  if (isDemoMode) {
    const newId = demoDb.purchase_orders.length > 0
      ? Math.max(...demoDb.purchase_orders.map((p: any) => p.id)) + 1
      : 1;

    const newOrder = {
      id: newId,
      tenant_id: tid,
      reference_number: referenceNumber,
      supplier_id: data.supplier_id,
      warehouse_id: data.warehouse_id,
      expected_delivery: data.expected_delivery || null,
      currency: data.currency || 'TND',
      notes: data.notes || null,
      status: 'draft',
      subtotal: totals.subtotal,
      discount_total: totals.discount_total,
      tax_total: totals.tax_total,
      total: totals.total,
      created_by: uid,
      approved_by: null,
      approved_at: null,
      created_at: now,
      updated_at: now,
    };
    demoDb.purchase_orders.push(newOrder);

    let itemId = demoDb.purchase_order_items.length > 0
      ? Math.max(...demoDb.purchase_order_items.map((i: any) => i.id)) + 1
      : 1;
    for (const item of lineItems) {
      demoDb.purchase_order_items.push({
        id: itemId++,
        purchase_order_id: newId,
        tenant_id: tid,
        ...item,
      });
    }

    eventBus.emit(Events.PURCHASE_ORDER_CREATED, {
      tenantId: tid, id: newId, referenceNumber,
      supplierId: data.supplier_id, total: totals.total,
    });

    return { ...newOrder, items: lineItems };
  }

  const { client, release } = await getClient();
  try {
    await client.query('BEGIN');

    const poResult = await client.query(
      `INSERT INTO purchase_orders
       (tenant_id, reference_number, supplier_id, warehouse_id, expected_delivery,
        currency, notes, status, subtotal, discount_total, tax_total, total,
        created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', $8, $9, $10, $11, $12, NOW(), NOW())
       RETURNING *`,
      [tid, referenceNumber, data.supplier_id, data.warehouse_id,
       data.expected_delivery || null, data.currency || 'TND', data.notes || null,
       totals.subtotal, totals.discount_total, totals.tax_total, totals.total, uid]
    );
    const newOrder = poResult.rows[0];

    for (const item of lineItems) {
      await client.query(
        `INSERT INTO purchase_order_items
         (purchase_order_id, tenant_id, ingredient_id, ordered_quantity,
          purchase_unit, inventory_unit, conversion_ratio, unit_price,
          discount_percent, tax_rate, discount_amount, tax_amount, line_total, line_notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [newOrder.id, tid, item.ingredient_id, item.ordered_quantity,
         item.purchase_unit, item.inventory_unit, item.conversion_ratio,
         item.unit_price, item.discount_percent, item.tax_rate,
         item.discount_amount, item.tax_amount, item.line_total, item.line_notes]
      );
    }

    await client.query('COMMIT');

    eventBus.emit(Events.PURCHASE_ORDER_CREATED, {
      tenantId: tid, id: newOrder.id, referenceNumber,
      supplierId: data.supplier_id, total: totals.total,
    });

    return { ...newOrder, items: lineItems };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    release();
  }
}

export async function updatePurchaseOrder(
  id: number,
  data: {
    supplier_id?: number;
    warehouse_id?: number;
    expected_delivery?: string;
    currency?: string;
    notes?: string;
    items?: Array<{
      ingredient_id: number;
      ordered_quantity: number;
      purchase_unit: string;
      inventory_unit: string;
      conversion_ratio: number;
      unit_price: number;
      discount_percent?: number;
      tax_rate?: number;
      line_notes?: string;
    }>;
  },
  tenantId?: number | null
): Promise<any> {
  const filter = resolveTenantFilter(tenantId);
  const tid = filter ?? 1;
  const now = new Date().toISOString();

  if (isDemoMode) {
    const idx = demoDb.purchase_orders.findIndex(
      (po: any) => po.id === id && po.tenant_id === tid
    );
    if (idx === -1) throw new Error('Purchase order not found.');
    if (demoDb.purchase_orders[idx].status !== 'draft') {
      throw new Error('Only draft orders can be edited.');
    }

    const updated = { ...demoDb.purchase_orders[idx] };
    if (data.supplier_id !== undefined) updated.supplier_id = data.supplier_id;
    if (data.warehouse_id !== undefined) updated.warehouse_id = data.warehouse_id;
    if (data.expected_delivery !== undefined) updated.expected_delivery = data.expected_delivery;
    if (data.currency !== undefined) updated.currency = data.currency;
    if (data.notes !== undefined) updated.notes = data.notes;

    if (data.items && data.items.length > 0) {
      const lineItems = data.items.map((item) => {
        const calc = calculateLineTotal(
          item.unit_price,
          item.ordered_quantity,
          item.discount_percent || 0,
          item.tax_rate || 0
        );
        return {
          ingredient_id: item.ingredient_id,
          ordered_quantity: item.ordered_quantity,
          purchase_unit: item.purchase_unit,
          inventory_unit: item.inventory_unit,
          conversion_ratio: item.conversion_ratio,
          unit_price: item.unit_price,
          discount_percent: item.discount_percent || 0,
          tax_rate: item.tax_rate || 0,
          discount_amount: calc.discount_amount,
          tax_amount: calc.tax_amount,
          line_total: calc.line_total,
          line_notes: item.line_notes || null,
        };
      });

      const totals = recalcOrderTotals(lineItems);
      updated.subtotal = totals.subtotal;
      updated.discount_total = totals.discount_total;
      updated.tax_total = totals.tax_total;
      updated.total = totals.total;

      demoDb.purchase_order_items = demoDb.purchase_order_items.filter(
        (i: any) => i.purchase_order_id !== id
      );

      let itemId = demoDb.purchase_order_items.length > 0
        ? Math.max(...demoDb.purchase_order_items.map((i: any) => i.id)) + 1
        : 1;
      for (const item of lineItems) {
        demoDb.purchase_order_items.push({
          id: itemId++,
          purchase_order_id: id,
          tenant_id: tid,
          ...item,
        });
      }
      updated.items = lineItems;
    }

    updated.updated_at = now;
    demoDb.purchase_orders[idx] = updated;

    eventBus.emit(Events.PURCHASE_ORDER_UPDATED, {
      tenantId: tid, id, referenceNumber: updated.reference_number,
    });

    return updated;
  }

  const statusCheck = await query(
    'SELECT status, reference_number FROM purchase_orders WHERE id = $1 AND tenant_id = $2',
    [id, tid]
  );
  if (statusCheck.rows.length === 0) throw new Error('Purchase order not found.');
  if (statusCheck.rows[0].status !== 'draft') {
    throw new Error('Only draft orders can be edited.');
  }

  const { client, release } = await getClient();
  try {
    await client.query('BEGIN');

    const setClauses: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    const scalarFields = ['supplier_id', 'warehouse_id', 'expected_delivery', 'currency', 'notes'];
    for (const field of scalarFields) {
      if (data[field as keyof typeof data] !== undefined) {
        setClauses.push(`${field} = $${paramIndex}`);
        params.push((data as any)[field]);
        paramIndex++;
      }
    }

    if (data.items && data.items.length > 0) {
      const lineItems = data.items.map((item) => {
        const calc = calculateLineTotal(
          item.unit_price,
          item.ordered_quantity,
          item.discount_percent || 0,
          item.tax_rate || 0
        );
        return {
          ingredient_id: item.ingredient_id,
          ordered_quantity: item.ordered_quantity,
          purchase_unit: item.purchase_unit,
          inventory_unit: item.inventory_unit,
          conversion_ratio: item.conversion_ratio,
          unit_price: item.unit_price,
          discount_percent: item.discount_percent || 0,
          tax_rate: item.tax_rate || 0,
          discount_amount: calc.discount_amount,
          tax_amount: calc.tax_amount,
          line_total: calc.line_total,
          line_notes: item.line_notes || null,
        };
      });

      const totals = recalcOrderTotals(lineItems);
      setClauses.push(`subtotal = $${paramIndex++}`);
      params.push(totals.subtotal);
      setClauses.push(`discount_total = $${paramIndex++}`);
      params.push(totals.discount_total);
      setClauses.push(`tax_total = $${paramIndex++}`);
      params.push(totals.tax_total);
      setClauses.push(`total = $${paramIndex++}`);
      params.push(totals.total);

      await client.query(
        'DELETE FROM purchase_order_items WHERE purchase_order_id = $1 AND tenant_id = $2',
        [id, tid]
      );

      for (const item of lineItems) {
        await client.query(
          `INSERT INTO purchase_order_items
           (purchase_order_id, tenant_id, ingredient_id, ordered_quantity,
            purchase_unit, inventory_unit, conversion_ratio, unit_price,
            discount_percent, tax_rate, discount_amount, tax_amount, line_total, line_notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          [id, tid, item.ingredient_id, item.ordered_quantity,
           item.purchase_unit, item.inventory_unit, item.conversion_ratio,
           item.unit_price, item.discount_percent, item.tax_rate,
           item.discount_amount, item.tax_amount, item.line_total, item.line_notes]
        );
      }
    }

    if (setClauses.length > 0) {
      setClauses.push(`updated_at = NOW()`);
      params.push(id, tid);
      const sql = `UPDATE purchase_orders SET ${setClauses.join(', ')} WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex++} RETURNING *`;

      const result = await client.query(sql, params);
      if (result.rows.length === 0) throw new Error('Purchase order not found.');

      await client.query('COMMIT');

      eventBus.emit(Events.PURCHASE_ORDER_UPDATED, {
        tenantId: tid, id, referenceNumber: statusCheck.rows[0].reference_number,
      });

      return result.rows[0];
    }

    await client.query('COMMIT');

    const result = await query(
      'SELECT * FROM purchase_orders WHERE id = $1 AND tenant_id = $2',
      [id, tid]
    );
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    release();
  }
}

export async function submitPurchaseOrder(
  id: number,
  tenantId?: number | null,
  userId?: number | null
): Promise<any> {
  const filter = resolveTenantFilter(tenantId);
  const tid = filter ?? 1;
  const uid = userId ?? null;
  const now = new Date().toISOString();

  if (isDemoMode) {
    const po = demoDb.purchase_orders.find((p: any) => p.id === id && p.tenant_id === tid);
    if (!po) throw new Error('Purchase order not found.');
    if (po.status !== 'draft') throw new Error('Only draft orders can be submitted.');

    po.status = 'pending_approval';
    po.updated_at = now;

    eventBus.emit(Events.PURCHASE_ORDER_SUBMITTED, {
      tenantId: tid, id, referenceNumber: po.reference_number,
    });

    return po;
  }

  const result = await query(
    `UPDATE purchase_orders
     SET status = 'pending_approval', updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND status = 'draft'
     RETURNING *`,
    [id, tid]
  );
  if (result.rows.length === 0) {
    const check = await query(
      'SELECT status FROM purchase_orders WHERE id = $1 AND tenant_id = $2',
      [id, tid]
    );
    if (check.rows.length === 0) throw new Error('Purchase order not found.');
    throw new Error('Only draft orders can be submitted.');
  }

  eventBus.emit(Events.PURCHASE_ORDER_SUBMITTED, {
    tenantId: tid, id, referenceNumber: result.rows[0].reference_number,
  });

  return result.rows[0];
}

export async function approvePurchaseOrder(
  id: number,
  tenantId?: number | null,
  userId?: number | null
): Promise<any> {
  const filter = resolveTenantFilter(tenantId);
  const tid = filter ?? 1;
  const uid = userId ?? null;
  const now = new Date().toISOString();

  if (isDemoMode) {
    const po = demoDb.purchase_orders.find((p: any) => p.id === id && p.tenant_id === tid);
    if (!po) throw new Error('Purchase order not found.');
    if (po.status !== 'pending_approval') throw new Error('Only pending orders can be approved.');

    po.status = 'approved';
    po.approved_by = uid;
    po.approved_at = now;
    po.updated_at = now;

    eventBus.emit(Events.PURCHASE_ORDER_APPROVED, {
      tenantId: tid, id, referenceNumber: po.reference_number,
    });

    return po;
  }

  const result = await query(
    `UPDATE purchase_orders
     SET status = 'approved', approved_by = $1, approved_at = NOW(), updated_at = NOW()
     WHERE id = $2 AND tenant_id = $3 AND status = 'pending_approval'
     RETURNING *`,
    [uid, id, tid]
  );
  if (result.rows.length === 0) {
    const check = await query(
      'SELECT status FROM purchase_orders WHERE id = $1 AND tenant_id = $2',
      [id, tid]
    );
    if (check.rows.length === 0) throw new Error('Purchase order not found.');
    throw new Error('Only pending orders can be approved.');
  }

  eventBus.emit(Events.PURCHASE_ORDER_APPROVED, {
    tenantId: tid, id, referenceNumber: result.rows[0].reference_number,
  });

  return result.rows[0];
}

export async function rejectPurchaseOrder(
  id: number,
  tenantId?: number | null,
  userId?: number | null
): Promise<any> {
  const filter = resolveTenantFilter(tenantId);
  const tid = filter ?? 1;
  const now = new Date().toISOString();

  if (isDemoMode) {
    const po = demoDb.purchase_orders.find((p: any) => p.id === id && p.tenant_id === tid);
    if (!po) throw new Error('Purchase order not found.');
    if (po.status !== 'pending_approval') throw new Error('Only pending orders can be rejected.');

    po.status = 'draft';
    po.updated_at = now;

    eventBus.emit(Events.PURCHASE_ORDER_REJECTED, {
      tenantId: tid, id, referenceNumber: po.reference_number,
    });

    return po;
  }

  const result = await query(
    `UPDATE purchase_orders
     SET status = 'draft', updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND status = 'pending_approval'
     RETURNING *`,
    [id, tid]
  );
  if (result.rows.length === 0) {
    const check = await query(
      'SELECT status FROM purchase_orders WHERE id = $1 AND tenant_id = $2',
      [id, tid]
    );
    if (check.rows.length === 0) throw new Error('Purchase order not found.');
    throw new Error('Only pending orders can be rejected.');
  }

  eventBus.emit(Events.PURCHASE_ORDER_REJECTED, {
    tenantId: tid, id, referenceNumber: result.rows[0].reference_number,
  });

  return result.rows[0];
}

export async function cancelPurchaseOrder(
  id: number,
  tenantId?: number | null,
  userId?: number | null
): Promise<any> {
  const filter = resolveTenantFilter(tenantId);
  const tid = filter ?? 1;
  const now = new Date().toISOString();

  if (isDemoMode) {
    const po = demoDb.purchase_orders.find((p: any) => p.id === id && p.tenant_id === tid);
    if (!po) throw new Error('Purchase order not found.');
    if (po.status === 'received' || po.status === 'closed') {
      throw new Error('Cannot cancel a received or closed order.');
    }

    po.status = 'cancelled';
    po.updated_at = now;

    eventBus.emit(Events.PURCHASE_ORDER_CANCELLED, {
      tenantId: tid, id, referenceNumber: po.reference_number,
    });

    return po;
  }

  const result = await query(
    `UPDATE purchase_orders
     SET status = 'cancelled', updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND status NOT IN ('received', 'closed')
     RETURNING *`,
    [id, tid]
  );
  if (result.rows.length === 0) {
    const check = await query(
      'SELECT status FROM purchase_orders WHERE id = $1 AND tenant_id = $2',
      [id, tid]
    );
    if (check.rows.length === 0) throw new Error('Purchase order not found.');
    throw new Error('Cannot cancel a received or closed order.');
  }

  eventBus.emit(Events.PURCHASE_ORDER_CANCELLED, {
    tenantId: tid, id, referenceNumber: result.rows[0].reference_number,
  });

  return result.rows[0];
}

export async function closePurchaseOrder(
  id: number,
  tenantId?: number | null,
  userId?: number | null
): Promise<any> {
  const filter = resolveTenantFilter(tenantId);
  const tid = filter ?? 1;
  const now = new Date().toISOString();

  if (isDemoMode) {
    const po = demoDb.purchase_orders.find((p: any) => p.id === id && p.tenant_id === tid);
    if (!po) throw new Error('Purchase order not found.');

    po.status = 'closed';
    po.updated_at = now;

    eventBus.emit(Events.PURCHASE_ORDER_CLOSED, {
      tenantId: tid, id, referenceNumber: po.reference_number,
    });

    return po;
  }

  const result = await query(
    `UPDATE purchase_orders
     SET status = 'closed', updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2
     RETURNING *`,
    [id, tid]
  );
  if (result.rows.length === 0) throw new Error('Purchase order not found.');

  eventBus.emit(Events.PURCHASE_ORDER_CLOSED, {
    tenantId: tid, id, referenceNumber: result.rows[0].reference_number,
  });

  return result.rows[0];
}

export async function deletePurchaseOrder(
  id: number,
  tenantId?: number | null
): Promise<{ success: boolean; message: string }> {
  const filter = resolveTenantFilter(tenantId);
  const tid = filter ?? 1;

  if (isDemoMode) {
    const idx = demoDb.purchase_orders.findIndex(
      (po: any) => po.id === id && po.tenant_id === tid
    );
    if (idx === -1) throw new Error('Purchase order not found.');
    if (demoDb.purchase_orders[idx].status !== 'draft') {
      throw new Error('Only draft orders can be deleted.');
    }

    demoDb.purchase_order_items = demoDb.purchase_order_items.filter(
      (i: any) => i.purchase_order_id !== id
    );
    demoDb.purchase_orders.splice(idx, 1);

    return { success: true, message: 'Purchase order deleted successfully.' };
  }

  const statusCheck = await query(
    'SELECT status FROM purchase_orders WHERE id = $1 AND tenant_id = $2',
    [id, tid]
  );
  if (statusCheck.rows.length === 0) throw new Error('Purchase order not found.');
  if (statusCheck.rows[0].status !== 'draft') {
    throw new Error('Only draft orders can be deleted.');
  }

  const { client, release } = await getClient();
  try {
    await client.query('BEGIN');

    await client.query(
      'DELETE FROM purchase_order_items WHERE purchase_order_id = $1 AND tenant_id = $2',
      [id, tid]
    );

    const result = await client.query(
      'DELETE FROM purchase_orders WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [id, tid]
    );

    if (result.rows.length === 0) throw new Error('Purchase order not found.');

    await client.query('COMMIT');
    return { success: true, message: 'Purchase order deleted successfully.' };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    release();
  }
}
