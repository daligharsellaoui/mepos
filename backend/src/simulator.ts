import http from 'http';
import { query, isDemoMode, demoDb } from './database';

const PORT = process.env.PORT || 5000;
const API_KEY = process.env.API_KEY || 'mepos_sec_key_prod_abc123';

// Helper to map recipes to departments dynamically based on name keywords
function getRecipesForDepartment(deptName: string, allRecipes: any[]): any[] {
  const nameLower = deptName.toLowerCase();
  let matched: any[] = [];

  if (nameLower.includes('cuisine') || nameLower.includes('kitchen') || nameLower.includes('pizza') || nameLower.includes('burger')) {
    matched = allRecipes.filter(r => 
      /pizza|burger|frite|eau/i.test(r.name) || [1, 2, 3, 4, 5, 7, 9].includes(r.id)
    );
  } else if (nameLower.includes('comptoir') || nameLower.includes('dessert') || nameLower.includes('crepe') || nameLower.includes('crêpe')) {
    matched = allRecipes.filter(r => 
      /crepe|crêpe|dessert|eau/i.test(r.name) || [6, 9].includes(r.id)
    );
  } else if (nameLower.includes('bar') || nameLower.includes('boisson') || nameLower.includes('drink') || nameLower.includes('café') || nameLower.includes('cafe')) {
    matched = allRecipes.filter(r => 
      /soda|cola|boisson|eau|jus|caf/i.test(r.name) || [8, 9].includes(r.id)
    );
  }

  // Fallback: if no recipes matched, or it is a generic department, return all active recipes
  if (matched.length === 0) {
    matched = allRecipes.filter(r => r.is_active !== false);
  }

  return matched;
}

// Generate a random ticket
function generateRandomTicketData(ticketIndex: number, date: Date, departments: any[], allRecipes: any[]) {
  // 1. Find selling points (non-central departments)
  let sellingDepts = departments.filter(d => !/central|principal|main|stockage/i.test(d.name));
  if (sellingDepts.length === 0) {
    sellingDepts = departments;
  }

  // 2. Select a random department
  const dept = sellingDepts[Math.floor(Math.random() * sellingDepts.length)];
  const deptId = dept.id;

  // 3. Map recipes dynamically for this department
  const recipes = getRecipesForDepartment(dept.name, allRecipes);
  if (recipes.length === 0) {
    return null;
  }

  const numItems = Math.floor(Math.random() * 3) + 1; // 1 to 3 items
  const items: any[] = [];
  let total = 0;

  // Shuffle recipes and take first numItems
  const shuffled = [...recipes].sort(() => 0.5 - Math.random());
  const selectedRecipes = shuffled.slice(0, Math.min(numItems, recipes.length));

  selectedRecipes.forEach(recipe => {
    const qty = Math.floor(Math.random() * 2) + 1; // 1 or 2 pcs
    const price = parseFloat(recipe.sale_price || recipe.price || 1.50);
    total += price * qty;
    items.push({
      recipe_id: recipe.id,
      quantity: qty,
      unit_price: price
    });
  });

  const extId = `TK-SIM-${date.getFullYear()}${(date.getMonth()+1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}-${ticketIndex.toString().padStart(4, '0')}`;

  return {
    external_ticket_id: extId,
    department_id: deptId,
    ticket_date: date.toISOString(),
    total_amount: total,
    items
  };
}

// Seed 30 days of historical sales directly to avoid stock depletion
export async function seedHistoricalSales() {
  console.log('[Simulator] Checking if sales history seeding is required...');

  let salesCount = 0;
  if (isDemoMode) {
    salesCount = demoDb.sales_tickets.length;
  } else {
    try {
      const res = await query('SELECT COUNT(*) FROM sales_tickets');
      salesCount = parseInt(res.rows[0].count, 10);
    } catch (err) {
      console.error('[Simulator] Failed to check DB sales count:', err);
      return;
    }
  }

  if (salesCount > 10) {
    console.log(`[Simulator] Sales history already has ${salesCount} tickets. Skipping history seed.`);
    return;
  }

  // Fetch departments & recipes to map dynamically
  let departments: any[] = [];
  let recipes: any[] = [];

  if (isDemoMode) {
    departments = demoDb.departments;
    recipes = demoDb.recipes;
  } else {
    try {
      const deptsRes = await query('SELECT * FROM departments');
      departments = deptsRes.rows;
      const recipesRes = await query('SELECT * FROM recipes');
      recipes = recipesRes.rows;
    } catch (err) {
      console.error('[Simulator] Failed to fetch departments/recipes for sales seeding:', err);
      return;
    }
  }

  if (departments.length === 0 || recipes.length === 0) {
    console.log('[Simulator] No departments or recipes found. Skipping sales seed.');
    return;
  }

  console.log('[Simulator] Seeding 30 days of historical sales data...');
  const now = new Date();
  let ticketIdCounter = 1;
  let itemIdCounter = 1;

  for (let i = 30; i >= 0; i--) {
    const currentDate = new Date(now.getTime() - i * 24 * 3600 * 1000);
    
    // Higher sales on weekends
    const dayOfWeek = currentDate.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6; // Fri, Sat, Sun
    const numTickets = isWeekend ? (Math.floor(Math.random() * 15) + 15) : (Math.floor(Math.random() * 10) + 8);

    for (let t = 1; t <= numTickets; t++) {
      // Pick random hour of day: lunch (12-14) or dinner (19-22)
      const ticketDate = new Date(currentDate.getTime());
      const isLunch = Math.random() > 0.4;
      const hour = isLunch ? (Math.floor(Math.random() * 2) + 12) : (Math.floor(Math.random() * 3) + 19);
      const minute = Math.floor(Math.random() * 60);
      ticketDate.setHours(hour, minute, 0, 0);

      const ticket = generateRandomTicketData(t, ticketDate, departments, recipes);
      if (!ticket) continue;

      if (isDemoMode) {
        const tId = ticketIdCounter++;
        demoDb.sales_tickets.push({
          id: tId,
          tenant_id: 1,
          external_ticket_id: ticket.external_ticket_id,
          department_id: ticket.department_id,
          ticket_date: ticket.ticket_date,
          total_amount: ticket.total_amount
        });

        ticket.items.forEach(item => {
          demoDb.sales_ticket_items.push({
            id: itemIdCounter++,
            tenant_id: 1,
            sales_ticket_id: tId,
            recipe_id: item.recipe_id,
            quantity: item.quantity,
            unit_price: item.unit_price
          });
        });
      } else {
        // Postgres insertions
        try {
          const ticketRes = await query(
            `INSERT INTO sales_tickets (external_ticket_id, department_id, ticket_date, total_amount, tenant_id) 
             VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [ticket.external_ticket_id, ticket.department_id, ticket.ticket_date, ticket.total_amount, 1]
          );
          const tId = ticketRes.rows[0].id;

          for (const item of ticket.items) {
            await query(
              `INSERT INTO sales_ticket_items (sales_ticket_id, tenant_id, recipe_id, quantity, unit_price) 
               VALUES ($1, $2, $3, $4, $5)`,
              [tId, 1, item.recipe_id, item.quantity, item.unit_price]
            );
          }
        } catch (err) {
          console.error('[Simulator] Failed to insert postgres ticket:', err);
        }
      }
    }
  }

  // Adjust sequences
  if (!isDemoMode) {
    try {
      await query("SELECT setval('sales_tickets_id_seq', (SELECT MAX(id) FROM sales_tickets))");
      await query("SELECT setval('sales_ticket_items_id_seq', (SELECT MAX(id) FROM sales_ticket_items))");
    } catch (err) {
      console.warn('[Simulator] Failed to reset PG sequences');
    }
  }

  console.log(`[Simulator] Historical sales seed completed. Generated ${ticketIdCounter - 1} tickets.`);
}

// Post a ticket to the sync API to trigger stock deduction & alerts
function postLiveTicket(ticket: any) {
  const payload = JSON.stringify({
    department_id: ticket.department_id,
    tickets: [
      {
        external_ticket_id: ticket.external_ticket_id,
        ticket_date: ticket.ticket_date,
        total_amount: ticket.total_amount,
        items: ticket.items
      }
    ]
  });

  const options = {
    hostname: 'localhost',
    port: PORT,
    path: '/api/v1/sales/sync',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'Content-Length': Buffer.byteLength(payload)
    }
  };

  const req = http.request(options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        if (json.status === 'success') {
          console.log(`[Simulator] Live sale synced: ${ticket.external_ticket_id} (Total: ${ticket.total_amount} TND, Dept: ${ticket.department_id})`);
        } else {
          console.error('[Simulator] Failed to sync live ticket:', data);
        }
      } catch (err) {
        console.error('[Simulator] Error parsing sync response:', data);
      }
    });
  });

  req.on('error', (err) => {
    console.error('[Simulator] Error sending live sales request:', err.message);
  });

  req.write(payload);
  req.end();
}

export async function seedHistoricalLosses() {
  console.log('[Simulator] Checking if ingredient losses seeding is required...');

  let lossesCount = 0;
  if (isDemoMode) {
    lossesCount = demoDb.ingredient_losses.length;
  } else {
    try {
      const res = await query('SELECT COUNT(*) FROM ingredient_losses');
      lossesCount = parseInt(res.rows[0].count, 10);
    } catch (err) {
      console.error('[Simulator] Failed to check DB losses count:', err);
      return;
    }
  }

  if (lossesCount > 0) {
    console.log(`[Simulator] Losses history already has ${lossesCount} entries. Skipping losses seed.`);
    return;
  }

  // Fetch departments & ingredients to map dynamically
  let departments: any[] = [];
  let ingredients: any[] = [];

  if (isDemoMode) {
    departments = demoDb.departments;
    ingredients = demoDb.ingredients;
  } else {
    try {
      const deptsRes = await query('SELECT * FROM departments');
      departments = deptsRes.rows;
      const ingsRes = await query('SELECT * FROM ingredients');
      ingredients = ingsRes.rows;
    } catch (err) {
      console.error('[Simulator] Failed to fetch departments/ingredients for losses seeding:', err);
      return;
    }
  }

  if (departments.length === 0 || ingredients.length === 0) {
    console.log('[Simulator] No departments or ingredients found. Skipping losses seed.');
    return;
  }

  console.log('[Simulator] Seeding historical ingredient losses...');
  const now = new Date();

  // Find department matches
  const centralDept = departments.find(d => /central|principal|main/i.test(d.name)) || departments[0];
  const kitchenDept = departments.find(d => /cuisine|kitchen|pizza|burger/i.test(d.name)) || departments.find(d => d.id !== centralDept.id) || departments[0];
  const dessertDept = departments.find(d => /comptoir|dessert|crepe|crêpe/i.test(d.name)) || kitchenDept;
  const barDept = departments.find(d => /bar|boisson|drink/i.test(d.name)) || centralDept;

  // Find ingredient matches
  const farineIng = ingredients.find(i => /farine/i.test(i.name)) || ingredients[0];
  const mozzarellaIng = ingredients.find(i => /mozzarella/i.test(i.name)) || ingredients[0];
  const steakIng = ingredients.find(i => /steak|boeuf|bœuf/i.test(i.name)) || ingredients[0];
  const nutellaIng = ingredients.find(i => /nutella/i.test(i.name)) || ingredients[0];
  const sodaIng = ingredients.find(i => /soda|cola|boisson/i.test(i.name)) || ingredients[0];

  const seedLosses = [
    {
      department: centralDept,
      ingredient: farineIng,
      quantity: 10.0000,
      loss_reason: 'spoilage',
      cost_loss: 18.00,
      opportunity_loss: 875.00,
      reported_by: 1,
      daysAgo: 5
    },
    {
      department: kitchenDept,
      ingredient: mozzarellaIng,
      quantity: 2.0000,
      loss_reason: 'preparation_error',
      cost_loss: 36.00,
      opportunity_loss: 233.33,
      reported_by: 3,
      daysAgo: 3
    },
    {
      department: kitchenDept,
      ingredient: steakIng,
      quantity: 5.0000,
      loss_reason: 'spoilage',
      cost_loss: 17.50,
      opportunity_loss: 46.25,
      reported_by: 3,
      daysAgo: 2
    },
    {
      department: dessertDept,
      ingredient: nutellaIng,
      quantity: 500.0000,
      loss_reason: 'theft',
      cost_loss: 12.50,
      opportunity_loss: 85.00,
      reported_by: 2,
      daysAgo: 8
    },
    {
      department: barDept,
      ingredient: sodaIng,
      quantity: 6.0000,
      loss_reason: 'other',
      cost_loss: 7.20,
      opportunity_loss: 15.00,
      reported_by: 2,
      daysAgo: 1
    }
  ];

  let lossIdCounter = 1;
  for (const sl of seedLosses) {
    if (!sl.department || !sl.ingredient) continue;

    const lossDate = new Date(now.getTime() - sl.daysAgo * 24 * 3600 * 1000);
    const deptId = sl.department.id;
    const ingId = sl.ingredient.id;
    
    if (isDemoMode) {
      demoDb.ingredient_losses.push({
        id: lossIdCounter++,
        department_id: deptId,
        ingredient_id: ingId,
        quantity: sl.quantity,
        loss_reason: sl.loss_reason,
        cost_loss: sl.cost_loss,
        opportunity_loss: sl.opportunity_loss,
        reported_by: sl.reported_by,
        created_at: lossDate.toISOString()
      });
      
      let stockRow = demoDb.inventory_stocks.find(
        st => st.department_id === deptId && st.ingredient_id === ingId
      );
      if (stockRow) {
        stockRow.quantity = Math.max(0, stockRow.quantity - sl.quantity);
      }
      demoDb.stock_movements.push({
        id: demoDb.stock_movements.length + 1,
        department_id: deptId,
        ingredient_id: ingId,
        quantity: -sl.quantity,
        type: 'loss',
        reference_id: 'loss_report',
        created_at: lossDate
      });
    } else {
      try {
        await query(
          `INSERT INTO ingredient_losses (department_id, ingredient_id, quantity, loss_reason, cost_loss, opportunity_loss, reported_by, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [deptId, ingId, sl.quantity, sl.loss_reason, sl.cost_loss, sl.opportunity_loss, sl.reported_by, lossDate]
        );
        await query(
          `UPDATE inventory_stocks SET quantity = GREATEST(0, quantity - $1), updated_at = CURRENT_TIMESTAMP
           WHERE department_id = $2 AND ingredient_id = $3`,
          [sl.quantity, deptId, ingId]
        );
        await query(
          `INSERT INTO stock_movements (department_id, ingredient_id, quantity, type, reference_id, created_at)
           VALUES ($1, $2, $3, 'loss', 'loss_report', $4)`,
          [deptId, ingId, -sl.quantity, lossDate]
        );
      } catch (err) {
        console.error('[Simulator] Failed to insert postgres loss:', err);
      }
    }
  }

  if (!isDemoMode) {
    try {
      await query("SELECT setval('ingredient_losses_id_seq', (SELECT MAX(id) FROM ingredient_losses))");
    } catch (err) {
      console.warn('[Simulator] Failed to reset PG losses sequence');
    }
  }
  console.log(`[Simulator] Historical losses seed completed.`);
}

// Start background live sales loop
export function startSalesSimulator() {
  // Wait 3 seconds before first live sale to let HTTP server start
  setTimeout(async () => {
    // 1. Seed history (skip if already seeded by comprehensive seed)
    await seedHistoricalSales();
    await seedHistoricalLosses();

    console.log('[Simulator] Starting background sales loop (Every 15 seconds)...');
    let ticketIndex = 10000;

    setInterval(async () => {
      ticketIndex++;
      const now = new Date();

      if (isDemoMode) {
        // Generate live tickets for tenant 1 (Burger House)
        const depts1 = demoDb.departments.filter((d: any) => d.tenant_id === 1);
        const recipes1 = demoDb.recipes.filter((r: any) => r.tenant_id === 1);
        if (depts1.length > 0 && recipes1.length > 0) {
          const ticket1 = generateRandomTicketData(ticketIndex, now, depts1, recipes1);
          if (ticket1) {
            ticket1.external_ticket_id = ticket1.external_ticket_id.replace('TK-', 'TK-BH-');
            postLiveTicket(ticket1);
          }
        }

        // Generate live tickets for tenant 2 (Pizza Palace)
        const depts2 = demoDb.departments.filter((d: any) => d.tenant_id === 2);
        const recipes2 = demoDb.recipes.filter((r: any) => r.tenant_id === 2);
        if (depts2.length > 0 && recipes2.length > 0) {
          const ticket2 = generateRandomTicketData(ticketIndex + 1000, now, depts2, recipes2);
          if (ticket2) {
            ticket2.external_ticket_id = ticket2.external_ticket_id.replace('TK-', 'TK-PP-');
            postLiveTicket(ticket2);
          }
        }
      } else {
        try {
          const deptsRes = await query('SELECT * FROM departments');
          const departments = deptsRes.rows;
          const recipesRes = await query('SELECT * FROM recipes');
          const recipes = recipesRes.rows;

          if (departments.length > 0 && recipes.length > 0) {
            const ticket = generateRandomTicketData(ticketIndex, now, departments, recipes);
            if (ticket) {
              postLiveTicket(ticket);
            }
          }
        } catch (err) {
          console.error('[Simulator] Failed to fetch departments/recipes for live sale:', err);
        }
      }
    }, 15000); // every 15 seconds
  }, 3000);
}
