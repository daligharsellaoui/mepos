import { Decimal } from 'decimal.js';
import { query, isDemoMode, demoDb, getClient } from '../database';
import { getEffectiveDepartmentId, processSaleDeduction } from './stock.service';
import { resolveExternalProductId } from './mapping.service';
import { eventBus, Events } from './event.service';

interface SyncResult {
  syncedTicketsCount: number;
  deductedStocks: any[];
  warnings: string[];
  unmappedProducts: string[];
}

/**
 * Resolve tenant ID for queries.
 * null = platform admin (no filtering) | undefined = no context (default to 1) | number = specific tenant
 */
function resolveTenantFilter(tenantId?: number | null): number | undefined {
  if (tenantId === null) return undefined;
  return tenantId ?? 1;
}

/**
 * Resolve item's recipe_id from external_product_id if needed
 * Supports both formats:
 *   - { recipe_id: 5, ... }  (pre-resolved, for backward compat)
 *   - { external_product_id: 'POS-123', ... } (needs mapping lookup)
 */
async function resolveItemProduct(
  item: any,
  connectorType: string,
  tenantId: number,
  unmappedProducts: string[],
  mappingWarnings: string[]
): Promise<{ recipe_id: number | null; resolved: boolean }> {
  // If recipe_id is already provided, use it directly (backward compatibility)
  if (item.recipe_id) {
    return { recipe_id: item.recipe_id, resolved: true };
  }

  // If external_product_id is provided, resolve via mapping
  if (item.external_product_id) {
    const result = await resolveExternalProductId(tenantId, connectorType, item.external_product_id);

    if (result.mapping_status === 'mapped' && result.mepos_product_id) {
      return { recipe_id: result.mepos_product_id, resolved: true };
    }

    // Product is unmapped or ignored - block this item
    if (result.mapping_status === 'unmapped') {
      unmappedProducts.push(item.external_product_id);
      mappingWarnings.push(`Produit non mappé: ${item.external_product_id}`);
    } else if (result.mapping_status === 'ignored') {
      mappingWarnings.push(`Produit ignoré: ${item.external_product_id}`);
    }

    return { recipe_id: null, resolved: false };
  }

  // No identifier provided
  mappingWarnings.push('Élément sans product identifier (recipe_id ou external_product_id requis)');
  return { recipe_id: null, resolved: false };
}

/**
 * Sync sales tickets: process stock deductions with idempotency checks.
 * Supports two formats:
 *   1. { recipe_id: 5, quantity: 2 } - pre-resolved (backward compat)
 *   2. { external_product_id: 'POS-123', quantity: 2 } - needs mapping
 */
export async function syncTickets(
  departmentId: number,
  tickets: any[],
  tenantId?: number | null,
  connectorType: string = 'pos'
): Promise<SyncResult> {
  const deptId = typeof departmentId === 'string' ? parseInt(departmentId, 10) : departmentId;
  const tid = tenantId ?? 1;
  const unmappedProducts: string[] = [];

  if (isDemoMode) {
    const department = demoDb.departments.find((d: any) => d.id === deptId);
    if (!department) throw new Error('Department not found');

    const stockDeptId = await getEffectiveDepartmentId(departmentId);
    const deductedStocks: any[] = [];
    const warnings: string[] = [];
    let syncedTicketsCount = 0;

    for (const ticket of tickets) {
      const { external_ticket_id, ticket_date, total_amount, items } = ticket;
      if (!external_ticket_id || !items || !Array.isArray(items)) {
        throw new Error(`Invalid ticket schema for ticket ID: ${external_ticket_id}`);
      }

      // Idempotency check (tenant-scoped)
      const alreadySynced = demoDb.sales_tickets.some(
        (t: any) => t.department_id === department.id && t.external_ticket_id === external_ticket_id && t.tenant_id === tid
      );
      if (alreadySynced) continue;

      const ticketId = demoDb.sales_tickets.length + 1;
      demoDb.sales_tickets.push({
        id: ticketId, external_ticket_id, department_id: department.id,
        ticket_date: new Date(ticket_date), total_amount, tenant_id: tid,
      });

      // Resolve items via mapping
      const resolvedItems: any[] = [];
      for (const item of items) {
        const { recipe_id, resolved } = await resolveItemProduct(item, connectorType, tid, unmappedProducts, warnings);
        if (resolved && recipe_id) {
          resolvedItems.push({ ...item, recipe_id });
        }
      }

      // Skip ticket if no items could be resolved
      if (resolvedItems.length === 0) {
        warnings.push(`Ticket ${external_ticket_id} ignoré: aucun produit mappé`);
        eventBus.emit(Events.SYNC_BLOCKED_MISSING_MAPPING, {
          tenantId: tid,
          external_ticket_id,
          unmappedProducts: [...unmappedProducts]
        });
        continue;
      }

      for (const item of resolvedItems) {
        demoDb.sales_ticket_items.push({
          id: demoDb.sales_ticket_items.length + 1, sales_ticket_id: ticketId,
          recipe_id: item.recipe_id, quantity: item.quantity, unit_price: item.unit_price
        });
      }

      // Emit SALE_IMPORTED event for activity journal
      eventBus.emit(Events.SALE_IMPORTED, {
        tenantId: tid,
        ticketId,
        externalTicketId: external_ticket_id,
        totalAmount: total_amount,
        itemsCount: resolvedItems.length,
        departmentName: department.name,
        ticketDate: ticket_date,
        connectorType,
        correlationId: `sale-${external_ticket_id}-${tid}`,
      });

      const result = await processSaleDeduction(null, stockDeptId, stockDeptId, department.name, resolvedItems, ticketId, tid, `sale-${external_ticket_id}-${tid}`);
      deductedStocks.push(...result.deductedStocks);
      warnings.push(...result.warnings);
      syncedTicketsCount++;
    }

    return { syncedTicketsCount, deductedStocks, warnings, unmappedProducts };
  }

  // PostgreSQL mode
  const deptResult = await query('SELECT * FROM departments WHERE id = $1 AND tenant_id = $2', [deptId, tid]);
  if (deptResult.rows.length === 0) throw new Error('Department not found');
  const department = deptResult.rows[0];
  const stockDeptId = await getEffectiveDepartmentId(departmentId);

  const { client, release } = await getClient();
  try {
    await client.query('BEGIN');

    const deductedStocks: any[] = [];
    const warnings: string[] = [];
    let syncedTicketsCount = 0;

    for (const ticket of tickets) {
      const { external_ticket_id, ticket_date, total_amount, items } = ticket;
      if (!external_ticket_id || !items || !Array.isArray(items)) {
        throw new Error(`Invalid ticket schema for ticket ID: ${external_ticket_id}`);
      }

      const ticketCheck = await client.query(
        'SELECT id FROM sales_tickets WHERE department_id = $1 AND external_ticket_id = $2 AND tenant_id = $3',
        [deptId, external_ticket_id, tid]
      );
      if (ticketCheck.rows.length > 0) continue;

      const insertTicketRes = await client.query(
        `INSERT INTO sales_tickets (external_ticket_id, department_id, ticket_date, total_amount, tenant_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [external_ticket_id, deptId, ticket_date, total_amount, tid]
      );
      const ticketId = insertTicketRes.rows[0].id;

      // Resolve items via mapping
      const resolvedItems: any[] = [];
      for (const item of items) {
        const { recipe_id, resolved } = await resolveItemProduct(item, connectorType, tid, unmappedProducts, warnings);
        if (resolved && recipe_id) {
          resolvedItems.push({ ...item, recipe_id });
        }
      }

      // Skip ticket if no items could be resolved
      if (resolvedItems.length === 0) {
        warnings.push(`Ticket ${external_ticket_id} ignoré: aucun produit mappé`);
        eventBus.emit(Events.SYNC_BLOCKED_MISSING_MAPPING, {
          tenantId: tid,
          external_ticket_id,
          unmappedProducts: [...unmappedProducts]
        });
        continue;
      }

      for (const item of resolvedItems) {
        await client.query(
          `INSERT INTO sales_ticket_items (sales_ticket_id, tenant_id, recipe_id, quantity, unit_price) VALUES ($1, $2, $3, $4, $5)`,
          [ticketId, tid, item.recipe_id, item.quantity, item.unit_price]
        );
      }

      // Emit SALE_IMPORTED event for activity journal
      eventBus.emit(Events.SALE_IMPORTED, {
        tenantId: tid,
        ticketId,
        externalTicketId: external_ticket_id,
        totalAmount: total_amount,
        itemsCount: resolvedItems.length,
        departmentName: department.name,
        ticketDate: ticket_date,
        connectorType,
        correlationId: `sale-${external_ticket_id}-${tid}`,
      });

      const result = await processSaleDeduction(client, deptId, stockDeptId, department.name, resolvedItems, ticketId, tid, `sale-${external_ticket_id}-${tid}`);
      deductedStocks.push(...result.deductedStocks);
      warnings.push(...result.warnings);
      syncedTicketsCount++;
    }

    await client.query('COMMIT');
    return { syncedTicketsCount, deductedStocks, warnings, unmappedProducts };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    release();
  }
}

/**
 * Get sales statistics for a date range with optional hour filtering.
 */
export async function getSalesStats(
  startDate: string, endDate: string, startHour: string, endHour: string,
  tenantId?: number | null
): Promise<{ totalRevenue: number; totalItemsSold: number; items: any[] }> {
  const startTimestamp = `${startDate}T${startHour}:00.000Z`;
  const endTimestamp = `${endDate}T${endHour}:59.999Z`;
  const filter = resolveTenantFilter(tenantId);

  if (isDemoMode) {
    const tickets = demoDb.sales_tickets.filter((t: any) => {
      return t.ticket_date >= startTimestamp && t.ticket_date <= endTimestamp && (!filter || t.tenant_id === filter);
    });

    const ticketIds = tickets.map((t: any) => t.id);
    const items = demoDb.sales_ticket_items.filter((item: any) => ticketIds.includes(item.sales_ticket_id));

    const grouped: { [key: number]: any } = {};
    items.forEach((item: any) => {
      const recipe = demoDb.recipes.find((r: any) => r.id === item.recipe_id);
      const rName = recipe ? recipe.name : 'Unknown';
      if (!grouped[item.recipe_id]) {
        grouped[item.recipe_id] = { recipe_id: item.recipe_id, recipe_name: rName, quantity: 0, unit_price: item.unit_price, total_revenue: 0 };
      }
      grouped[item.recipe_id].quantity += parseFloat(item.quantity);
      grouped[item.recipe_id].total_revenue += parseFloat(item.quantity) * parseFloat(item.unit_price);
    });

    const itemsData = Object.values(grouped);
    const totalRevenue = itemsData.reduce((sum: number, item: any) => sum + item.total_revenue, 0);
    const totalItemsSold = itemsData.reduce((sum: number, item: any) => sum + item.quantity, 0);

    return { totalRevenue, totalItemsSold, items: itemsData };
  }

  const result = await query(`
    SELECT i.recipe_id, r.name as recipe_name,
           SUM(i.quantity) as quantity, AVG(i.unit_price) as unit_price,
           SUM(i.quantity * i.unit_price) as total_revenue
    FROM sales_tickets t
    JOIN sales_ticket_items i ON t.id = i.sales_ticket_id
    JOIN recipes r ON i.recipe_id = r.id
    WHERE t.ticket_date >= $1::timestamptz AND t.ticket_date <= $2::timestamptz
    ${filter ? 'AND t.tenant_id = $3' : ''}
    GROUP BY i.recipe_id, r.name
  `, filter ? [startTimestamp, endTimestamp, filter] : [startTimestamp, endTimestamp]);

  const items = result.rows.map((row: any) => ({
    recipe_id: row.recipe_id, recipe_name: row.recipe_name,
    quantity: parseFloat(row.quantity), unit_price: parseFloat(row.unit_price),
    total_revenue: parseFloat(row.total_revenue)
  }));

  const totalRevenue = items.reduce((sum: number, item: any) => sum + item.total_revenue, 0);
  const totalItemsSold = items.reduce((sum: number, item: any) => sum + item.quantity, 0);

  return { totalRevenue, totalItemsSold, items };
}

/**
 * Get daily sales totals for the last 7 days.
 */
export async function getSalesHistory(tenantId?: number | null): Promise<{ date: string; revenue: number }[]> {
  const filter = resolveTenantFilter(tenantId);

  if (isDemoMode) {
    const dailySales: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 3600 * 1000);
      dailySales[d.toISOString().split('T')[0]] = 0;
    }

    demoDb.sales_tickets.forEach((t: any) => {
      if (filter && t.tenant_id !== filter) return;
      const dayStr = new Date(t.ticket_date).toISOString().split('T')[0];
      if (dailySales[dayStr] !== undefined) {
        dailySales[dayStr] += parseFloat(t.total_amount);
      }
    });

    return Object.keys(dailySales)
      .map(date => ({ date, revenue: dailySales[date] }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  const result = await query(`
    SELECT DATE(ticket_date) as date, SUM(total_amount) as revenue
    FROM sales_tickets
    WHERE ticket_date >= CURRENT_DATE - INTERVAL '6 days'
    ${filter ? 'AND tenant_id = $1' : ''}
    GROUP BY DATE(ticket_date)
    ORDER BY date ASC
  `, filter ? [filter] : []);

  const dailySales: Record<string, number> = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 3600 * 1000);
    dailySales[d.toISOString().split('T')[0]] = 0;
  }

  result.rows.forEach((row: any) => {
    const dayStr = new Date(row.date).toISOString().split('T')[0];
    if (dailySales[dayStr] !== undefined) {
      dailySales[dayStr] = parseFloat(row.revenue);
    }
  });

  return Object.keys(dailySales)
    .map(date => ({ date, revenue: dailySales[date] }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
