import { Decimal } from 'decimal.js';
import { query, isDemoMode, demoDb, getClient } from '../database';
import { getEffectiveDepartmentId, processSaleDeduction } from './stock.service';

/**
 * Sync sales tickets: process stock deductions with idempotency checks.
 */
export async function syncTickets(
  departmentId: number,
  tickets: any[]
): Promise<{ syncedTicketsCount: number; deductedStocks: any[]; warnings: string[] }> {
  const deptId = typeof departmentId === 'string' ? parseInt(departmentId, 10) : departmentId;

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

      // Idempotency check
      const alreadySynced = demoDb.sales_tickets.some(
        (t: any) => t.department_id === department.id && t.external_ticket_id === external_ticket_id
      );
      if (alreadySynced) continue;

      // Create ticket
      const ticketId = demoDb.sales_tickets.length + 1;
      demoDb.sales_tickets.push({
        id: ticketId,
        external_ticket_id,
        department_id: department.id,
        ticket_date: new Date(ticket_date),
        total_amount
      });

      // Add ticket items
      for (const item of items) {
        demoDb.sales_ticket_items.push({
          id: demoDb.sales_ticket_items.length + 1,
          sales_ticket_id: ticketId,
          recipe_id: item.recipe_id,
          quantity: item.quantity,
          unit_price: item.unit_price
        });
      }

      // Process stock deductions
      const result = await processSaleDeduction(
        null, stockDeptId, stockDeptId, department.name, items, ticketId
      );
      deductedStocks.push(...result.deductedStocks);
      warnings.push(...result.warnings);
      syncedTicketsCount++;
    }

    return { syncedTicketsCount, deductedStocks, warnings };
  }

  // PostgreSQL mode
  const deptResult = await query('SELECT * FROM departments WHERE id = $1', [deptId]);
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

      // Idempotency check
      const ticketCheck = await client.query(
        'SELECT id FROM sales_tickets WHERE department_id = $1 AND external_ticket_id = $2',
        [deptId, external_ticket_id]
      );
      if (ticketCheck.rows.length > 0) continue;

      // Insert ticket
      const insertTicketRes = await client.query(
        `INSERT INTO sales_tickets (external_ticket_id, department_id, ticket_date, total_amount)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [external_ticket_id, deptId, ticket_date, total_amount]
      );
      const ticketId = insertTicketRes.rows[0].id;

      // Insert items
      for (const item of items) {
        await client.query(
          `INSERT INTO sales_ticket_items (sales_ticket_id, recipe_id, quantity, unit_price)
           VALUES ($1, $2, $3, $4)`,
          [ticketId, item.recipe_id, item.quantity, item.unit_price]
        );
      }

      // Process stock deductions
      const result = await processSaleDeduction(
        client, deptId, stockDeptId, department.name, items, ticketId
      );
      deductedStocks.push(...result.deductedStocks);
      warnings.push(...result.warnings);
      syncedTicketsCount++;
    }

    await client.query('COMMIT');
    return { syncedTicketsCount, deductedStocks, warnings };
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
  startDate: string,
  endDate: string,
  startHour: string,
  endHour: string
): Promise<{ totalRevenue: number; totalItemsSold: number; items: any[] }> {
  const startTimestamp = `${startDate}T${startHour}:00.000Z`;
  const endTimestamp = `${endDate}T${endHour}:59.999Z`;

  if (isDemoMode) {
    const tickets = demoDb.sales_tickets.filter((t: any) => {
      return t.ticket_date >= startTimestamp && t.ticket_date <= endTimestamp;
    });

    const ticketIds = tickets.map((t: any) => t.id);
    const items = demoDb.sales_ticket_items.filter((item: any) => ticketIds.includes(item.sales_ticket_id));

    const grouped: { [key: number]: any } = {};
    items.forEach((item: any) => {
      const recipe = demoDb.recipes.find((r: any) => r.id === item.recipe_id);
      const rName = recipe ? recipe.name : 'Unknown';
      if (!grouped[item.recipe_id]) {
        grouped[item.recipe_id] = {
          recipe_id: item.recipe_id,
          recipe_name: rName,
          quantity: 0,
          unit_price: item.unit_price,
          total_revenue: 0
        };
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
           SUM(i.quantity) as quantity,
           AVG(i.unit_price) as unit_price,
           SUM(i.quantity * i.unit_price) as total_revenue
    FROM sales_tickets t
    JOIN sales_ticket_items i ON t.id = i.sales_ticket_id
    JOIN recipes r ON i.recipe_id = r.id
    WHERE t.ticket_date >= $1::timestamptz AND t.ticket_date <= $2::timestamptz
    GROUP BY i.recipe_id, r.name
  `, [startTimestamp, endTimestamp]);

  const items = result.rows.map((row: any) => ({
    recipe_id: row.recipe_id,
    recipe_name: row.recipe_name,
    quantity: parseFloat(row.quantity),
    unit_price: parseFloat(row.unit_price),
    total_revenue: parseFloat(row.total_revenue)
  }));

  const totalRevenue = items.reduce((sum: number, item: any) => sum + item.total_revenue, 0);
  const totalItemsSold = items.reduce((sum: number, item: any) => sum + item.quantity, 0);

  return { totalRevenue, totalItemsSold, items };
}

/**
 * Get daily sales totals for the last 7 days.
 */
export async function getSalesHistory(): Promise<{ date: string; revenue: number }[]> {
  if (isDemoMode) {
    const dailySales: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 3600 * 1000);
      dailySales[d.toISOString().split('T')[0]] = 0;
    }

    demoDb.sales_tickets.forEach((t: any) => {
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
    GROUP BY DATE(ticket_date)
    ORDER BY date ASC
  `);

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
