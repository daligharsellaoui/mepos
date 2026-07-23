import { Decimal } from 'decimal.js';
import { query, isDemoMode, demoDb, getClient } from '../database';
import { eventBus, Events } from './event.service';
import { updateStockQuantity, logMovement } from './stock.service';

function resolveTenantFilter(tenantId?: number | null): number | undefined {
  if (tenantId === null) return undefined;
  return tenantId ?? 1;
}

export async function createCountSession(
  data: { warehouse_id: number; notes?: string },
  tenantId?: number | null,
  userId?: number | null
): Promise<any> {
  const tid = resolveTenantFilter(tenantId) ?? 1;

  if (isDemoMode) {
    const warehouse = demoDb.departments.find(d => d.id === data.warehouse_id && d.tenant_id === tid);
    if (!warehouse) throw new Error('Warehouse not found');

    const newSession = {
      id: demoDb.inventory_counts.length > 0 ? Math.max(...demoDb.inventory_counts.map((s: any) => s.id)) + 1 : 1,
      warehouse_id: data.warehouse_id,
      status: 'draft',
      notes: data.notes || null,
      created_by: userId || null,
      approved_by: null,
      approved_at: null,
      created_at: new Date(),
      updated_at: new Date(),
      tenant_id: tid,
    };
    demoDb.inventory_counts.push(newSession);

    const stocks = demoDb.inventory_stocks.filter((s: any) => s.department_id === data.warehouse_id);
    stocks.forEach((s: any) => {
      demoDb.inventory_count_items.push({
        id: demoDb.inventory_count_items.length > 0 ? Math.max(...demoDb.inventory_count_items.map((i: any) => i.id)) + 1 : 1,
        count_session_id: newSession.id,
        ingredient_id: s.ingredient_id,
        expected_quantity: s.quantity,
        actual_quantity: null,
        reason: null,
        notes: null,
        tenant_id: tid,
      });
    });

    eventBus.emit(Events.INVENTORY_COUNT_CREATED, {
      tenantId: tid,
      countSessionId: newSession.id,
      warehouseId: data.warehouse_id,
      itemCount: stocks.length,
    });

    return newSession;
  }

  const { client, release } = await getClient();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO inventory_counts (warehouse_id, status, notes, counted_by, tenant_id)
       VALUES ($1, 'draft', $2, $3, $4) RETURNING *`,
      [data.warehouse_id, data.notes || null, userId, tid]
    );
    const newSession = result.rows[0];

    const stocks = await client.query(
      'SELECT ingredient_id, quantity FROM inventory_stocks WHERE department_id = $1 AND tenant_id = $2',
      [data.warehouse_id, tid]
    );

    for (const stock of stocks.rows) {
      await client.query(
        `INSERT INTO inventory_count_items (count_session_id, ingredient_id, expected_quantity, tenant_id)
         VALUES ($1, $2, $3, $4)`,
        [newSession.id, stock.ingredient_id, stock.quantity, tid]
      );
    }

    await client.query('COMMIT');

    eventBus.emit(Events.INVENTORY_COUNT_CREATED, {
      tenantId: tid,
      countSessionId: newSession.id,
      warehouseId: data.warehouse_id,
      itemCount: stocks.rows.length,
    });

    return newSession;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    release();
  }
}

export async function getAllCountSessions(
  tenantId?: number | null,
  filters?: {
    status?: string;
    warehouse_id?: number;
    date_from?: string;
    date_to?: string;
    page?: number;
    limit?: number;
  }
): Promise<{ data: any[]; total: number; page: number; limit: number }> {
  const filter = resolveTenantFilter(tenantId);
  const page = filters?.page || 1;
  const limit = filters?.limit || 50;
  const offset = (page - 1) * limit;

  if (isDemoMode) {
    let sessions = demoDb.inventory_counts.filter((s: any) => !filter || s.tenant_id === filter);

    if (filters?.status) {
      sessions = sessions.filter((s: any) => s.status === filters.status);
    }
    if (filters?.warehouse_id) {
      sessions = sessions.filter((s: any) => s.warehouse_id === filters.warehouse_id);
    }
    if (filters?.date_from) {
      const from = new Date(filters.date_from);
      sessions = sessions.filter((s: any) => new Date(s.created_at) >= from);
    }
    if (filters?.date_to) {
      const to = new Date(filters.date_to);
      sessions = sessions.filter((s: any) => new Date(s.created_at) <= to);
    }

    sessions.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const total = sessions.length;
    const data = sessions.slice(offset, offset + limit).map((s: any) => {
      const warehouse = demoDb.departments.find((d: any) => d.id === s.warehouse_id);
      const createdBy = demoDb.users.find((u: any) => u.id === s.created_by);
      const items = demoDb.inventory_count_items.filter((i: any) => i.count_session_id === s.id);
      return {
        ...s,
        warehouse_name: warehouse?.name || 'Unknown',
        created_by_username: createdBy?.username || null,
        item_count: items.length,
        counted_items: items.filter((i: any) => i.actual_quantity !== null).length,
      };
    });

    return { data, total, page, limit };
  }

  let baseSql = 'FROM inventory_counts ic JOIN departments d ON ic.warehouse_id = d.id LEFT JOIN users u ON ic.created_by = u.id';
  const params: any[] = [];
  const conditions: string[] = [];

  if (filter) {
    params.push(filter);
    conditions.push(`ic.tenant_id = $${params.length}`);
  }
  if (filters?.status) {
    params.push(filters.status);
    conditions.push(`ic.status = $${params.length}`);
  }
  if (filters?.warehouse_id) {
    params.push(filters.warehouse_id);
    conditions.push(`ic.warehouse_id = $${params.length}`);
  }
  if (filters?.date_from) {
    params.push(filters.date_from);
    conditions.push(`ic.created_at >= $${params.length}`);
  }
  if (filters?.date_to) {
    params.push(filters.date_to);
    conditions.push(`ic.created_at <= $${params.length}`);
  }

  if (conditions.length > 0) {
    baseSql += ' WHERE ' + conditions.join(' AND ');
  }

  const countResult = await query(`SELECT COUNT(*) ${baseSql}`, params);
  const total = parseInt(countResult.rows[0]?.count || '0', 10);

  const selectSql = `
    SELECT ic.*, d.name as warehouse_name, u.username as created_by_username,
           (SELECT COUNT(*) FROM inventory_count_items WHERE count_session_id = ic.id) as item_count,
           (SELECT COUNT(*) FROM inventory_count_items WHERE count_session_id = ic.id AND actual_quantity IS NOT NULL) as counted_items
    ${baseSql}
    ORDER BY ic.created_at DESC
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `;
  params.push(limit, offset);

  const result = await query(selectSql, params);
  return { data: result.rows, total, page, limit };
}

export async function getCountSessionById(
  id: number,
  tenantId?: number | null
): Promise<any> {
  const filter = resolveTenantFilter(tenantId);

  if (isDemoMode) {
    const session = demoDb.inventory_counts.find((s: any) => s.id === id && (!filter || s.tenant_id === filter));
    if (!session) return null;

    const warehouse = demoDb.departments.find((d: any) => d.id === session.warehouse_id);
    const createdBy = demoDb.users.find((u: any) => u.id === session.created_by);
    const approvedBy = session.approved_by ? demoDb.users.find((u: any) => u.id === session.approved_by) : null;

    const items = demoDb.inventory_count_items
      .filter((i: any) => i.count_session_id === id)
      .map((i: any) => {
        const ing = demoDb.ingredients.find((g: any) => g.id === i.ingredient_id);
        return {
          ...i,
          ingredient_name: ing?.name || 'Unknown',
          unit: ing?.unit || '',
          difference: i.actual_quantity !== null && i.expected_quantity !== null
            ? i.actual_quantity - i.expected_quantity
            : null,
        };
      });

    return {
      ...session,
      warehouse_name: warehouse?.name || 'Unknown',
      created_by_username: createdBy?.username || null,
      approved_by_username: approvedBy?.username || null,
      items,
    };
  }

  const tid = filter ?? 1;
  const result = await query(
    `SELECT ic.*, d.name as warehouse_name, u1.username as created_by_username, u2.username as approved_by_username
     FROM inventory_counts ic
     JOIN departments d ON ic.warehouse_id = d.id
     LEFT JOIN users u1 ON ic.created_by = u1.id
     LEFT JOIN users u2 ON ic.approved_by = u2.id
     WHERE ic.id = $1 AND ic.tenant_id = $2`,
    [id, tid]
  );

  if (result.rows.length === 0) return null;
  const session = result.rows[0];

  const itemsResult = await query(
    `SELECT ici.*, i.name as ingredient_name, i.unit
     FROM inventory_count_items ici
     JOIN ingredients i ON ici.ingredient_id = i.id
     WHERE ici.count_session_id = $1 AND ici.tenant_id = $2
     ORDER BY i.name`,
    [id, tid]
  );

  session.items = itemsResult.rows;
  return session;
}

export async function updateCountItem(
  countItemId: number,
  data: { actual_quantity?: number; reason?: string; notes?: string },
  tenantId?: number | null
): Promise<any> {
  const filter = resolveTenantFilter(tenantId);
  const tid = filter ?? 1;

  if (isDemoMode) {
    const idx = demoDb.inventory_count_items.findIndex(
      (i: any) => i.id === countItemId && i.tenant_id === tid
    );
    if (idx === -1) throw new Error('Count item not found');

    const item = demoDb.inventory_count_items[idx];
    if (data.actual_quantity !== undefined) {
      item.actual_quantity = data.actual_quantity;
    }
    if (data.reason !== undefined) {
      item.reason = data.reason;
    }
    if (data.notes !== undefined) {
      item.notes = data.notes;
    }

    const ing = demoDb.ingredients.find((g: any) => g.id === item.ingredient_id);
    return {
      ...item,
      ingredient_name: ing?.name || 'Unknown',
      unit: ing?.unit || '',
      difference: item.actual_quantity !== null && item.expected_quantity !== null
        ? item.actual_quantity - item.expected_quantity
        : null,
    };
  }

  const updates: string[] = [];
  const params: any[] = [];
  let pIdx = 1;

  if (data.actual_quantity !== undefined) {
    updates.push(`actual_quantity = $${pIdx++}`);
    params.push(data.actual_quantity);
  }
  if (data.reason !== undefined) {
    updates.push(`reason = $${pIdx++}`);
    params.push(data.reason);
  }
  if (data.notes !== undefined) {
    updates.push(`notes = $${pIdx++}`);
    params.push(data.notes);
  }

  if (updates.length === 0) {
    const current = await query(
      'SELECT * FROM inventory_count_items WHERE id = $1 AND tenant_id = $2',
      [countItemId, tid]
    );
    if (current.rows.length === 0) throw new Error('Count item not found');

    const enriched = await query(
      `SELECT ici.*, i.name as ingredient_name, i.unit
       FROM inventory_count_items ici
       JOIN ingredients i ON ici.ingredient_id = i.id
       WHERE ici.id = $1 AND ici.tenant_id = $2`,
      [countItemId, tid]
    );
    return enriched.rows[0];
  }

  params.push(countItemId, tid);
  const sql = `UPDATE inventory_count_items SET ${updates.join(', ')} WHERE id = $${pIdx++} AND tenant_id = $${pIdx++} RETURNING *`;
  const result = await query(sql, params);

  if (result.rows.length === 0) throw new Error('Count item not found');

  const enriched = await query(
    `SELECT ici.*, i.name as ingredient_name, i.unit
     FROM inventory_count_items ici
     JOIN ingredients i ON ici.ingredient_id = i.id
     WHERE ici.id = $1 AND ici.tenant_id = $2`,
    [countItemId, tid]
  );

  return enriched.rows[0];
}

export async function startCountSession(
  id: number,
  tenantId?: number | null
): Promise<any> {
  const filter = resolveTenantFilter(tenantId);
  const tid = filter ?? 1;

  if (isDemoMode) {
    const session = demoDb.inventory_counts.find(
      (s: any) => s.id === id && s.tenant_id === tid
    );
    if (!session) throw new Error('Count session not found');
    if (session.status !== 'draft') throw new Error('Count session must be in draft status to start');

    session.status = 'in_progress';
    session.updated_at = new Date();

    eventBus.emit(Events.INVENTORY_COUNT_STARTED, {
      tenantId: tid,
      countSessionId: id,
      warehouseId: session.warehouse_id,
    });

    return session;
  }

  const result = await query(
    `UPDATE inventory_counts
     SET status = 'in_progress', updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND tenant_id = $2 AND status = 'draft'
     RETURNING *`,
    [id, tid]
  );

  if (result.rows.length === 0) {
    const check = await query(
      'SELECT status FROM inventory_counts WHERE id = $1 AND tenant_id = $2',
      [id, tid]
    );
    if (check.rows.length === 0) throw new Error('Count session not found');
    throw new Error('Count session must be in draft status to start');
  }

  const session = result.rows[0];
  eventBus.emit(Events.INVENTORY_COUNT_STARTED, {
    tenantId: tid,
    countSessionId: id,
    warehouseId: session.warehouse_id,
  });

  return session;
}

export async function completeCountSession(
  id: number,
  tenantId?: number | null
): Promise<any> {
  const filter = resolveTenantFilter(tenantId);
  const tid = filter ?? 1;

  if (isDemoMode) {
    const session = demoDb.inventory_counts.find(
      (s: any) => s.id === id && s.tenant_id === tid
    );
    if (!session) throw new Error('Count session not found');
    if (session.status !== 'in_progress') throw new Error('Count session must be in progress to complete');

    const items = demoDb.inventory_count_items.filter(
      (i: any) => i.count_session_id === id
    );

    for (const item of items) {
      const hasActual = item.actual_quantity !== null && item.actual_quantity !== undefined;
      const hasNotes = item.notes !== null && item.notes !== undefined && item.notes !== '';
      if (!hasActual && !hasNotes) {
        const ing = demoDb.ingredients.find((g: any) => g.id === item.ingredient_id);
        throw new Error(
          `Item '${ing?.name || 'Unknown'}' must have actual quantity or notes`
        );
      }
    }

    session.status = 'completed';
    session.updated_at = new Date();

    eventBus.emit(Events.INVENTORY_COUNT_COMPLETED, {
      tenantId: tid,
      countSessionId: id,
      warehouseId: session.warehouse_id,
      itemCount: items.length,
    });

    return session;
  }

  const { client, release } = await getClient();
  try {
    await client.query('BEGIN');

    const sessionRes = await client.query(
      'SELECT * FROM inventory_counts WHERE id = $1 AND tenant_id = $2 FOR UPDATE',
      [id, tid]
    );
    if (sessionRes.rows.length === 0) throw new Error('Count session not found');
    const session = sessionRes.rows[0];
    if (session.status !== 'in_progress') {
      throw new Error('Count session must be in progress to complete');
    }

    const items = await client.query(
      'SELECT ici.*, i.name as ingredient_name FROM inventory_count_items ici JOIN ingredients i ON ici.ingredient_id = i.id WHERE ici.count_session_id = $1 AND ici.tenant_id = $2',
      [id, tid]
    );

    for (const item of items.rows) {
      const hasActual = item.actual_quantity !== null && item.actual_quantity !== undefined;
      const hasNotes = item.notes !== null && item.notes !== undefined && item.notes !== '';
      if (!hasActual && !hasNotes) {
        throw new Error(
          `Item '${item.ingredient_name}' must have actual quantity or notes`
        );
      }
    }

    const result = await client.query(
      `UPDATE inventory_counts
       SET status = 'completed', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [id, tid]
    );

    await client.query('COMMIT');

    eventBus.emit(Events.INVENTORY_COUNT_COMPLETED, {
      tenantId: tid,
      countSessionId: id,
      warehouseId: session.warehouse_id,
      itemCount: items.rows.length,
    });

    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    release();
  }
}

export async function approveCountSession(
  id: number,
  tenantId?: number | null,
  userId?: number | null
): Promise<any> {
  const filter = resolveTenantFilter(tenantId);
  const tid = filter ?? 1;

  if (isDemoMode) {
    const session = demoDb.inventory_counts.find(
      (s: any) => s.id === id && s.tenant_id === tid
    );
    if (!session) throw new Error('Count session not found');
    if (session.status !== 'completed') throw new Error('Count session must be completed to approve');

    const items = demoDb.inventory_count_items.filter(
      (i: any) => i.count_session_id === id
    );

    for (const item of items) {
      const diff = item.actual_quantity !== null && item.expected_quantity !== null
        ? item.actual_quantity - item.expected_quantity
        : 0;

      if (diff !== 0) {
        const stock = demoDb.inventory_stocks.find(
          (s: any) => s.department_id === session.warehouse_id && s.ingredient_id === item.ingredient_id
        );
        const currentQty = stock ? stock.quantity : 0;
        const newQty = item.actual_quantity !== null ? item.actual_quantity : currentQty;

        demoDb.inventory_adjustments.push({
          id: demoDb.inventory_adjustments.length + 1,
          count_session_id: id,
          count_item_id: item.id,
          ingredient_id: item.ingredient_id,
          department_id: session.warehouse_id,
          previous_quantity: currentQty,
          new_quantity: newQty,
          difference: newQty - currentQty,
          reference: `count-${id}-item-${item.id}`,
          created_at: new Date(),
          tenant_id: tid,
        });

        const delta = newQty - currentQty;
        if (stock) {
          stock.quantity = newQty;
        }

        const deptId = session.warehouse_id;
        const ref = `count-${id}-item-${item.id}`;
        if (delta !== 0) {
          demoDb.stock_movements.push({
            id: demoDb.stock_movements.length + 1,
            department_id: deptId,
            ingredient_id: item.ingredient_id,
            quantity: delta,
            type: 'reconciliation',
            reference_id: ref,
            created_at: new Date(),
            tenant_id: tid,
          });
        }
      }
    }

    session.status = 'approved';
    session.approved_by = userId || null;
    session.approved_at = new Date();
    session.updated_at = new Date();

    eventBus.emit(Events.INVENTORY_COUNT_APPROVED, {
      tenantId: tid,
      countSessionId: id,
      warehouseId: session.warehouse_id,
      approvedBy: userId,
    });

    return session;
  }

  const { client, release } = await getClient();
  try {
    await client.query('BEGIN');

    const sessionRes = await client.query(
      'SELECT * FROM inventory_counts WHERE id = $1 AND tenant_id = $2 FOR UPDATE',
      [id, tid]
    );
    if (sessionRes.rows.length === 0) throw new Error('Count session not found');
    const session = sessionRes.rows[0];
    if (session.status !== 'completed') throw new Error('Count session must be completed to approve');

    const items = await client.query(
      'SELECT ici.*, i.name as ingredient_name FROM inventory_count_items ici JOIN ingredients i ON ici.ingredient_id = i.id WHERE ici.count_session_id = $1 AND ici.tenant_id = $2',
      [id, tid]
    );

    for (const item of items.rows) {
      const expected = parseFloat(item.expected_quantity) || 0;
      const actual = item.actual_quantity !== null ? parseFloat(item.actual_quantity) : expected;
      const diff = actual - expected;

      if (diff !== 0) {
        const stockRes = await client.query(
          'SELECT quantity FROM inventory_stocks WHERE department_id = $1 AND ingredient_id = $2 AND tenant_id = $3 FOR UPDATE',
          [session.warehouse_id, item.ingredient_id, tid]
        );
        const currentQty = stockRes.rows.length > 0 ? parseFloat(stockRes.rows[0].quantity) : 0;
        const delta = actual - currentQty;

        await client.query(
          `INSERT INTO inventory_adjustments (count_session_id, count_item_id, ingredient_id, department_id, previous_quantity, new_quantity, difference, reference, tenant_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [id, item.id, item.ingredient_id, session.warehouse_id, currentQty, actual, diff, `count-${id}-item-${item.id}`, tid]
        );

        await updateStockQuantity(client, session.warehouse_id, item.ingredient_id, new Decimal(delta), tid);

        await logMovement(
          client,
          session.warehouse_id,
          item.ingredient_id,
          new Decimal(actual - currentQty),
          'reconciliation',
          `count-${id}-item-${item.id}`,
          tid
        );
      }
    }

    const result = await client.query(
      `UPDATE inventory_counts
       SET status = 'approved', approved_by = $1, approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND tenant_id = $3
       RETURNING *`,
      [userId, id, tid]
    );

    await client.query('COMMIT');

    eventBus.emit(Events.INVENTORY_COUNT_APPROVED, {
      tenantId: tid,
      countSessionId: id,
      warehouseId: session.warehouse_id,
      approvedBy: userId,
    });

    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    release();
  }
}

export async function cancelCountSession(
  id: number,
  tenantId?: number | null
): Promise<any> {
  const filter = resolveTenantFilter(tenantId);
  const tid = filter ?? 1;

  if (isDemoMode) {
    const session = demoDb.inventory_counts.find(
      (s: any) => s.id === id && s.tenant_id === tid
    );
    if (!session) throw new Error('Count session not found');
    if (session.status === 'approved' || session.status === 'cancelled') {
      throw new Error('Count session cannot be cancelled in its current status');
    }

    session.status = 'cancelled';
    session.updated_at = new Date();

    eventBus.emit(Events.INVENTORY_COUNT_CANCELLED, {
      tenantId: tid,
      countSessionId: id,
      warehouseId: session.warehouse_id,
    });

    return session;
  }

  const result = await query(
    `UPDATE inventory_counts
     SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND tenant_id = $2 AND status NOT IN ('approved', 'cancelled')
     RETURNING *`,
    [id, tid]
  );

  if (result.rows.length === 0) {
    const check = await query(
      'SELECT status FROM inventory_counts WHERE id = $1 AND tenant_id = $2',
      [id, tid]
    );
    if (check.rows.length === 0) throw new Error('Count session not found');
    throw new Error('Count session cannot be cancelled in its current status');
  }

  const session = result.rows[0];
  eventBus.emit(Events.INVENTORY_COUNT_CANCELLED, {
    tenantId: tid,
    countSessionId: id,
    warehouseId: session.warehouse_id,
  });

  return session;
}

export async function getCountDiscrepancies(
  id: number,
  tenantId?: number | null
): Promise<any[]> {
  const filter = resolveTenantFilter(tenantId);
  const tid = filter ?? 1;

  if (isDemoMode) {
    const session = demoDb.inventory_counts.find(
      (s: any) => s.id === id && s.tenant_id === tid
    );
    if (!session) throw new Error('Count session not found');

    const items = demoDb.inventory_count_items
      .filter((i: any) => i.count_session_id === id)
      .map((i: any) => {
        const ing = demoDb.ingredients.find((g: any) => g.id === i.ingredient_id);
        const diff = i.actual_quantity !== null && i.expected_quantity !== null
          ? i.actual_quantity - i.expected_quantity
          : null;
        return {
          ...i,
          ingredient_name: ing?.name || 'Unknown',
          unit: ing?.unit || '',
          difference: diff,
        };
      })
      .filter((i: any) => i.difference !== null && i.difference !== 0);

    items.sort((a: any, b: any) => Math.abs(b.difference) - Math.abs(a.difference));
    return items;
  }

  const result = await query(
    `SELECT ici.*, i.name as ingredient_name, i.unit
     FROM inventory_count_items ici
     JOIN ingredients i ON ici.ingredient_id = i.id
     WHERE ici.count_session_id = $1 AND ici.tenant_id = $2
       AND ici.actual_quantity IS NOT NULL
       AND ici.actual_quantity != ici.expected_quantity
     ORDER BY ABS(ici.actual_quantity - ici.expected_quantity) DESC`,
    [id, tid]
  );

  return result.rows;
}
