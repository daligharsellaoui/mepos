import crypto from 'crypto';

const now = new Date();
const _90daysAgo = new Date(now.getTime() - 90 * 86400000);
const _60daysAgo = new Date(now.getTime() - 60 * 86400000);

function daysAgo(n: number): Date {
  return new Date(now.getTime() - n * 86400000);
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number, decimals = 2): number {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isWeekend(d: Date): boolean {
  const day = d.getDay();
  return day === 0 || day === 5 || day === 6;
}

// ─── Tenant Definitions ───

interface TenantDef {
  id: number;
  name: string;
  slug: string;
  business: string;
  email: string;
  phone: string;
  address: string;
  connectorType: string;
  users: Array<{ id: number; username: string; role: 'admin' | 'manager' | 'cook'; first_name: string; last_name: string; password: string }>;
  departments: Array<{ id: number; name: string; stock_type: string; description: string }>;
  ingredients: Array<{
    id: number; name: string; unit: string; purchase_price_per_unit: number;
    alert_threshold: number; purchase_unit: string; purchase_unit_price: number; conversion_factor: number
  }>;
  recipes: Array<{ id: number; name: string; sale_price: number; ingredient_ids: number[]; quantities: number[] }>;
  suppliers: Array<{
    name: string; company_name?: string; tax_number?: string; city?: string; country?: string;
    email?: string; phone?: string; contact_person?: string; preferred?: boolean;
    payment_terms?: string; contact?: string; registration_number?: string;
  }>;
  agents: Array<{
    id: number; name: string; connector_type: string; machine_name: string;
    config: any; version: string
  }>;
}

const burgerHouse: TenantDef = {
  id: 1,
  name: 'Burger House Tunis',
  slug: 'burger-house-tunis',
  business: 'Burger Restaurant',
  email: 'contact@burgerhouse.tn',
  phone: '+216 71 123 456',
  address: '15 Avenue Habib Bourguiba, Tunis Centre',
  connectorType: 'database',
  users: [
    { id: 1, username: 'ahmed', role: 'admin', first_name: 'Ahmed', last_name: 'Ben Salah', password: 'admin123' },
    { id: 2, username: 'sami', role: 'manager', first_name: 'Sami', last_name: 'Trabelsi', password: 'manager123' },
    { id: 3, username: 'youssef', role: 'cook', first_name: 'Youssef', last_name: 'Gharbi', password: 'cook123' },
  ],
  departments: [
    { id: 1, name: 'Dépôt Central', stock_type: 'isolated', description: 'Stockage principal des matières premières' },
    { id: 2, name: 'Cuisine', stock_type: 'isolated', description: 'Zone de préparation et cuisson' },
    { id: 3, name: 'Chambre Froide', stock_type: 'isolated', description: 'Stockage réfrigéré des périssables' },
  ],
  ingredients: [
    { id: 1, name: 'Viande Hachée Bœuf', unit: 'kg', purchase_price_per_unit: 18.50, alert_threshold: 10, purchase_unit: 'carton', purchase_unit_price: 185.00, conversion_factor: 10 },
    { id: 2, name: 'Blanc de Poulet', unit: 'kg', purchase_price_per_unit: 14.00, alert_threshold: 8, purchase_unit: 'carton', purchase_unit_price: 140.00, conversion_factor: 10 },
    { id: 3, name: 'Pain Burger', unit: 'pcs', purchase_price_per_unit: 0.65, alert_threshold: 50, purchase_unit: 'paquet', purchase_unit_price: 15.60, conversion_factor: 24 },
    { id: 4, name: 'Fromage Cheddar', unit: 'kg', purchase_price_per_unit: 24.00, alert_threshold: 3, purchase_unit: 'bloc', purchase_unit_price: 120.00, conversion_factor: 5 },
    { id: 5, name: 'Tomates', unit: 'kg', purchase_price_per_unit: 3.50, alert_threshold: 5, purchase_unit: 'caisse', purchase_unit_price: 35.00, conversion_factor: 10 },
    { id: 6, name: 'Oignons', unit: 'kg', purchase_price_per_unit: 2.00, alert_threshold: 5, purchase_unit: 'sac', purchase_unit_price: 20.00, conversion_factor: 10 },
    { id: 7, name: 'Salade Laitue', unit: 'kg', purchase_price_per_unit: 4.00, alert_threshold: 3, purchase_unit: 'caisse', purchase_unit_price: 40.00, conversion_factor: 10 },
    { id: 8, name: 'Cornichons', unit: 'kg', purchase_price_per_unit: 5.50, alert_threshold: 2, purchase_unit: 'pot', purchase_unit_price: 27.50, conversion_factor: 5 },
    { id: 9, name: 'Frites Surgelées', unit: 'kg', purchase_price_per_unit: 5.00, alert_threshold: 15, purchase_unit: 'carton', purchase_unit_price: 100.00, conversion_factor: 20 },
    { id: 10, name: 'Huile de Friture', unit: 'L', purchase_price_per_unit: 5.00, alert_threshold: 10, purchase_unit: 'bidon', purchase_unit_price: 100.00, conversion_factor: 20 },
    { id: 11, name: 'Mayonnaise', unit: 'L', purchase_price_per_unit: 6.00, alert_threshold: 3, purchase_unit: 'bidon', purchase_unit_price: 60.00, conversion_factor: 10 },
    { id: 12, name: 'Ketchup', unit: 'L', purchase_price_per_unit: 5.50, alert_threshold: 3, purchase_unit: 'bidon', purchase_unit_price: 55.00, conversion_factor: 10 },
    { id: 13, name: 'Moutarde', unit: 'L', purchase_price_per_unit: 7.00, alert_threshold: 2, purchase_unit: 'bidon', purchase_unit_price: 35.00, conversion_factor: 5 },
    { id: 14, name: 'Farine de Blé', unit: 'kg', purchase_price_per_unit: 1.80, alert_threshold: 10, purchase_unit: 'sac', purchase_unit_price: 36.00, conversion_factor: 20 },
    { id: 16, name: 'Œufs', unit: 'pcs', purchase_price_per_unit: 0.40, alert_threshold: 24, purchase_unit: 'plateau', purchase_unit_price: 12.00, conversion_factor: 30 },
    { id: 17, name: 'Boissons Gazeuses', unit: 'pcs', purchase_price_per_unit: 1.20, alert_threshold: 48, purchase_unit: 'plateau', purchase_unit_price: 28.80, conversion_factor: 24 },
    { id: 18, name: 'Eau Minérale', unit: 'pcs', purchase_price_per_unit: 0.60, alert_threshold: 36, purchase_unit: 'fardeau', purchase_unit_price: 7.20, conversion_factor: 12 },
    { id: 19, name: 'Sel', unit: 'kg', purchase_price_per_unit: 1.00, alert_threshold: 2, purchase_unit: 'sac', purchase_unit_price: 10.00, conversion_factor: 10 },
    { id: 20, name: 'Poivre Noir', unit: 'kg', purchase_price_per_unit: 25.00, alert_threshold: 1, purchase_unit: 'sac', purchase_unit_price: 25.00, conversion_factor: 1 },
    { id: 22, name: 'Pommes de Terre', unit: 'kg', purchase_price_per_unit: 2.50, alert_threshold: 10, purchase_unit: 'sac', purchase_unit_price: 50.00, conversion_factor: 20 },
  ],
  recipes: [
    { id: 1, name: 'Classic Burger', sale_price: 14.50, ingredient_ids: [3, 1, 4, 7, 5, 6, 8], quantities: [1, 0.15, 0.025, 0.02, 0.03, 0.02, 0.015] },
    { id: 2, name: 'Double Burger', sale_price: 19.50, ingredient_ids: [3, 1, 4, 7, 5, 6, 8], quantities: [1, 0.30, 0.05, 0.02, 0.03, 0.02, 0.015] },
    { id: 3, name: 'Cheese Burger', sale_price: 16.00, ingredient_ids: [3, 1, 4, 7, 5, 8], quantities: [1, 0.15, 0.04, 0.02, 0.03, 0.015] },
    { id: 4, name: 'Chicken Burger', sale_price: 15.50, ingredient_ids: [3, 2, 7, 5, 11], quantities: [1, 0.15, 0.02, 0.03, 0.015] },
    { id: 5, name: 'French Fries', sale_price: 5.50, ingredient_ids: [9, 10, 19], quantities: [0.25, 0.04, 0.005] },
    { id: 6, name: 'Chicken Nuggets (6pcs)', sale_price: 11.00, ingredient_ids: [2, 14, 16, 10, 19], quantities: [0.20, 0.05, 1, 0.03, 0.003] },
    { id: 7, name: 'Soda', sale_price: 3.00, ingredient_ids: [17], quantities: [1] },
    { id: 8, name: 'Eau Minérale', sale_price: 1.50, ingredient_ids: [18], quantities: [1] },
  ],
  suppliers: [
    { name: 'Fresh Meat Tunisia', company_name: 'Fresh Meat Tunisia SARL', tax_number: '1234567X/A/M/000', city: 'Tunis', country: 'Tunisie', email: 'contact@freshmeat.tn', phone: '+216 71 123 456', contact_person: 'Mohamed Ali Ben Salem', preferred: true, payment_terms: '30 jours' },
    { name: 'SOTUB', company_name: 'Société Tunisienne des Boissons', tax_number: '2345678Y/B/M/001', city: 'Ben Arous', country: 'Tunisie', email: 'commandes@sotub.tn', phone: '+216 71 234 567', contact_person: 'Leila Trabelsi', preferred: true },
    { name: 'Chahia', company_name: 'Chahia Tunisie', tax_number: '3456789Z/C/M/002', city: 'Mégrine', country: 'Tunisie', email: 'pro@chahia.tn', phone: '+216 70 123 456', contact_person: 'Karim Mansour' },
    { name: 'Société des Fromages', company_name: 'Société Tunisienne des Fromages', tax_number: '4567890A/D/M/003', city: 'Sfax', country: 'Tunisie', email: 'info@fromages.tn', phone: '+216 74 123 456', contact_person: 'Sami Ben Ahmed' },
    { name: 'Les Grands Moulins', company_name: 'Les Grands Moulins de Tunis', tax_number: '5678901B/E/M/004', city: 'Tunis', country: 'Tunisie', email: 'commercial@grands-moulins.tn', phone: '+216 71 345 678', contact_person: 'Fatma Belhaj', preferred: true },
    { name: 'Marché Central', company_name: 'Marché Central des Produits Frais', tax_number: '6789012C/F/M/005', city: 'Tunis', country: 'Tunisie', email: 'contact@marchecentral.tn', phone: '+216 71 456 789', contact_person: 'Hichem Garbouj', preferred: true },
    { name: 'Tunisie Légumes', company_name: 'Tunisie Légumes SARL', tax_number: '7890123D/G/M/006', city: 'Nabeul', country: 'Tunisie', email: 'ventes@tunisie-legumes.tn', phone: '+216 72 123 456', contact_person: 'Nadia Mejri' },
  ],
  agents: [
    {
      id: 1, name: 'POS-DB-Sync', connector_type: 'database',
      machine_name: 'POS-TERMINAL-01', version: '2.4.0',
      config: {
        host: 'localhost', port: 5432, database: 'legacy-pos-db',
        user: 'pos_user', password: 'pos_pass_2024', ssl: false,
        polling_interval: 12000, sync_tables: ['tickets', 'ticket_items']
      }
    },
  ],
};



// ─── Seed Data Generator ───

export interface SeedData {
  tenants: any[];
  users: any[];
  departments: any[];
  ingredients: any[];
  inventory_stocks: any[];
  recipes: any[];
  recipe_ingredients: any[];
  sales_tickets: any[];
  sales_ticket_items: any[];
  stock_movements: any[];
  ingredient_losses: any[];
  transfer_requests: any[];
  agents: any[];
  agent_heartbeats: any[];
  tenant_settings: any[];
  audit_logs: any[];
  suppliers: any[];
  purchases: any[];
  product_mappings: any[];
}

function generateSales(tdef: TenantDef): { sales_tickets: any[]; sales_ticket_items: any[] } {
  const tickets: any[] = [];
  const items: any[] = [];
  let ticketId = 0;
  let itemId = 0;

  const totalDays = 90;
  for (let dayOffset = totalDays; dayOffset >= 0; dayOffset--) {
    const date = daysAgo(dayOffset);
    const weekend = isWeekend(date);
    const numTickets = weekend ? randomBetween(180, 250) : randomBetween(80, 120);
    const dateStr = formatDate(date);

    // Hour distribution: lunch (11-14) = busiest ~50%, dinner (18-22) = ~35%, other = ~15%
    const hourWeights = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 8, 10, 8, 3, 2, 3, 6, 8, 8, 6, 3, 1, 0];
    const totalWeight = hourWeights.reduce((a, b) => a + b, 0);

    for (let t = 0; t < numTickets; t++) {
      ticketId++;
      const rand = Math.random() * totalWeight;
      let cum = 0;
      let hour = 12;
      for (let h = 0; h < 24; h++) {
        cum += hourWeights[h];
        if (rand <= cum) { hour = h; break; }
      }
      const minute = Math.floor(Math.random() * 60);
      const ticketDate = new Date(date);
      ticketDate.setHours(hour, minute, Math.floor(Math.random() * 60), 0);

      const numItems = Math.random() < 0.2 ? 1 : (Math.random() < 0.4 ? 2 : (Math.random() < 0.7 ? 3 : 4));
      const shuffledRecipes = [...tdef.recipes].sort(() => 0.5 - Math.random());
      const selectedRecipes = shuffledRecipes.slice(0, Math.min(numItems, tdef.recipes.length));
      let totalAmount = 0;

      const ticketItemIds: number[] = [];
      for (const recipe of selectedRecipes) {
        itemId++;
        const qty = Math.random() < 0.7 ? 1 : (Math.random() < 0.8 ? 2 : 3);
        totalAmount += recipe.sale_price * qty;
        items.push({
          id: itemId,
          tenant_id: tdef.id,
          sales_ticket_id: ticketId,
          recipe_id: recipe.id,
          quantity: qty,
          unit_price: recipe.sale_price,
        });
        ticketItemIds.push(itemId);
      }

      tickets.push({
        id: ticketId,
        tenant_id: tdef.id,
        external_ticket_id: `TK-${tdef.slug}-${dateStr}-${String(t).padStart(4, '0')}`,
        department_id: tdef.departments[1].id, // cuisine
        ticket_date: ticketDate,
        total_amount: totalAmount,
        sync_at: new Date(ticketDate.getTime() + randomBetween(30, 300) * 1000),
        deleted_at: null,
      });
    }
  }

  return { sales_tickets: tickets, sales_ticket_items: items };
}

function generateStockMovements(
  tdef: TenantDef,
  salesTickets: any[],
  salesItems: any[],
  losses: any[],
  transfers: any[],
): any[] {
  const movements: any[] = [];
  let movId = 0;

  // 1. Purchases - simulate deliveries every 2-3 days over 60 days
  for (let dayOffset = 60; dayOffset >= 0; dayOffset -= randomBetween(2, 4)) {
    const date = daysAgo(dayOffset);
    const numIngredients = randomBetween(3, 8);
    const shuffled = [...tdef.ingredients].sort(() => 0.5 - Math.random());
    for (let i = 0; i < Math.min(numIngredients, shuffled.length); i++) {
      movId++;
      const ing = shuffled[i];
      const qty = randomFloat(5, 50) * ing.conversion_factor;
      const centralDept = tdef.departments[0].id;
      movements.push({
        id: movId,
        tenant_id: tdef.id,
        department_id: centralDept,
        ingredient_id: ing.id,
        quantity: qty,
        type: 'purchase',
        reference_id: `PO-${formatDate(date)}-${ing.id}`,
        created_at: new Date(date.getTime() + randomBetween(6, 12) * 3600000),
      });
    }
  }

  // 2. Sale deductions — aggregate by day/ingredient to reduce volume
  const deductionMap: Record<string, { qty: number; date: Date }> = {};
  for (const ticket of salesTickets) {
    if (ticket.tenant_id !== tdef.id) continue;
    const ticketItems = salesItems.filter(si => si.sales_ticket_id === ticket.id);
    for (const si of ticketItems) {
      const recipe = tdef.recipes.find(r => r.id === si.recipe_id);
      if (!recipe) continue;
      const dayKey = formatDate(new Date(ticket.ticket_date));
      for (let ri = 0; ri < recipe.ingredient_ids.length; ri++) {
        const ingId = recipe.ingredient_ids[ri];
        const qtyNeeded = recipe.quantities[ri] * si.quantity;
        const key = `${dayKey}-${ingId}`;
        if (deductionMap[key]) {
          deductionMap[key].qty += qtyNeeded;
        } else {
          deductionMap[key] = { qty: qtyNeeded, date: new Date(ticket.ticket_date) };
        }
      }
    }
  }
  const kitchenDept = tdef.departments[1].id;
  for (const [key, val] of Object.entries(deductionMap)) {
    movId++;
    const parts = key.split('-');
    const ingId = parseInt(parts[parts.length - 1], 10);
    movements.push({
      id: movId,
      tenant_id: tdef.id,
      department_id: kitchenDept,
      ingredient_id: ingId,
      quantity: -Math.round(val.qty * 10000) / 10000,
      type: 'sale_deduction',
      reference_id: `daily-sales-${key}`,
      created_at: val.date,
    });
  }

  // 3. Transfer movements
  for (const tr of transfers) {
    if (tr.tenant_id !== tdef.id) continue;
    movId++;
    movements.push({
      id: movId,
      tenant_id: tdef.id,
      department_id: tr.source_department_id,
      ingredient_id: tr.ingredient_id,
      quantity: -tr.quantity,
      type: 'transfer_out',
      reference_id: `transfer-${tr.source_department_id}-to-${tr.destination_department_id}`,
      created_at: new Date(tr.created_at),
    });
    movId++;
    movements.push({
      id: movId,
      tenant_id: tdef.id,
      department_id: tr.destination_department_id,
      ingredient_id: tr.ingredient_id,
      quantity: tr.quantity,
      type: 'transfer_in',
      reference_id: `transfer-${tr.source_department_id}-to-${tr.destination_department_id}`,
      created_at: new Date(tr.created_at),
    });
  }

  // 4. Loss movements
  for (const loss of losses) {
    if (loss.tenant_id !== tdef.id) continue;
    movId++;
    movements.push({
      id: movId,
      tenant_id: tdef.id,
      department_id: loss.department_id,
      ingredient_id: loss.ingredient_id,
      quantity: -loss.quantity,
      type: 'loss',
      reference_id: `loss-${loss.id}`,
      created_at: new Date(loss.created_at),
    });
  }

  return movements;
}

function generateCurrentStocks(tdef: TenantDef, movements: any[]): any[] {
  const stocks: any[] = [];
  let stockId = 0;

  // Build a lookup of aggregated movement deltas per department+ingredient
  const deltaMap: Record<string, number> = {};
  for (const m of movements) {
    if (m.tenant_id !== tdef.id) continue;
    const key = `${m.department_id}-${m.ingredient_id}`;
    deltaMap[key] = (deltaMap[key] || 0) + m.quantity;
  }

  for (const dept of tdef.departments) {
    for (const ing of tdef.ingredients) {
      stockId++;
      const key = `${dept.id}-${ing.id}`;
      const delta = deltaMap[key] || 0;
      const baseStock = ing.alert_threshold * 8;
      let qty = Math.max(0, Math.round((baseStock + delta) * 10000) / 10000);

      stocks.push({
        id: stockId,
        tenant_id: tdef.id,
        department_id: dept.id,
        ingredient_id: ing.id,
        quantity: qty,
        updated_at: new Date(),
      });
    }
  }

  return stocks;
}

function generateLosses(tdef: TenantDef): any[] {
  const losses: any[] = [];
  let lossId = 0;

  const lossScenarios = [
    { reason: 'spoilage', label: 'Périmé / Avarié', daysRange: [1, 60] },
    { reason: 'preparation_error', label: 'Erreur de préparation', daysRange: [1, 30] },
    { reason: 'overproduction', label: 'Surproduction', daysRange: [1, 20] },
    { reason: 'theft', label: 'Vol', daysRange: [5, 60] },
    { reason: 'customer_complaint', label: 'Plainte client - remplacement', daysRange: [1, 15] },
    { reason: 'counting_adjustment', label: 'Ajustement inventaire', daysRange: [3, 45] },
  ];

  const numLosses = tdef.id === 1 ? randomBetween(18, 25) : randomBetween(15, 20);

  for (let i = 0; i < numLosses; i++) {
    lossId++;
    const scenario = pick(lossScenarios);
    const days = randomBetween(scenario.daysRange[0], scenario.daysRange[1]);
    const date = daysAgo(days);
    date.setHours(randomBetween(8, 20), randomBetween(0, 59), 0, 0);

    const dept = pick(tdef.departments);
    const ing = pick(tdef.ingredients);
    const qty = randomFloat(0.5, 5);

    losses.push({
      id: lossId,
      tenant_id: tdef.id,
      department_id: dept.id,
      ingredient_id: ing.id,
      quantity: qty,
      loss_reason: scenario.reason,
      cost_loss: parseFloat((qty * ing.purchase_price_per_unit).toFixed(2)),
      opportunity_loss: parseFloat((qty * ing.purchase_price_per_unit * 2.5).toFixed(2)),
      reported_by: null,
      created_at: date,
    });
  }

  // Add specific scenario losses for burger house
  if (tdef.id === 1) {
    const tomato = tdef.ingredients.find(i => i.name === 'Tomates')!;
    const cheddar = tdef.ingredients.find(i => i.name === 'Fromage Cheddar')!;
    const beef = tdef.ingredients.find(i => i.name === 'Viande Hachée Bœuf')!;
    const kitchen = tdef.departments[1]!;
    const central = tdef.departments[0]!;

    lossId++;
    losses.push({ id: lossId, tenant_id: tdef.id, department_id: central.id, ingredient_id: tomato.id, quantity: 2, loss_reason: 'spoilage', cost_loss: 7.00, opportunity_loss: 17.50, reported_by: null, created_at: daysAgo(4) });
    lossId++;
    losses.push({ id: lossId, tenant_id: tdef.id, department_id: kitchen.id, ingredient_id: cheddar.id, quantity: 1, loss_reason: 'spoilage', cost_loss: 24.00, opportunity_loss: 60.00, reported_by: null, created_at: daysAgo(7) });
    lossId++;
    losses.push({ id: lossId, tenant_id: tdef.id, department_id: kitchen.id, ingredient_id: beef.id, quantity: 1.5, loss_reason: 'preparation_error', cost_loss: 27.75, opportunity_loss: 69.38, reported_by: null, created_at: daysAgo(2) });
    lossId++;
    losses.push({ id: lossId, tenant_id: tdef.id, department_id: kitchen.id, ingredient_id: beef.id, quantity: 0.5, loss_reason: 'customer_complaint', cost_loss: 9.25, opportunity_loss: 23.13, reported_by: null, created_at: daysAgo(1) });
    lossId++;
    losses.push({ id: lossId, tenant_id: tdef.id, department_id: central.id, ingredient_id: tdef.ingredients[9]!.id, quantity: 3, loss_reason: 'counting_adjustment', cost_loss: 15.00, opportunity_loss: 37.50, reported_by: null, created_at: daysAgo(12) });
  }

  // Assign users to losses
  const users = tdef.users;
  for (const loss of losses) {
    if (!loss.reported_by) {
      if (loss.loss_reason === 'customer_complaint' && users[1]) loss.reported_by = users[1].id;
      else if (loss.loss_reason === 'theft' && users[0]) loss.reported_by = users[0].id;
      else if (loss.loss_reason === 'counting_adjustment' && (users[0] || users[1])) loss.reported_by = users[0] ? users[0].id : users[1]!.id;
      else if (users[2]) loss.reported_by = users[2].id;
      else if (users[0]) loss.reported_by = users[0].id;
    }
  }

  return losses;
}

function generateTransfers(tdef: TenantDef): any[] {
  const transfers: any[] = [];
  let trId = 0;

  const users = tdef.users;

  // Completed transfers
  const completedCount = randomBetween(4, 7);
  for (let i = 0; i < completedCount; i++) {
    trId++;
    const srcDept = tdef.departments[0]; // central
    const destDept = pick(tdef.departments.slice(1)); // kitchen or cold
    const ing = pick(tdef.ingredients);
    const qty = randomFloat(2, 15);
    const days = randomBetween(2, 50);
    const date = daysAgo(days);

    transfers.push({
      id: trId,
      tenant_id: tdef.id,
      source_department_id: srcDept.id,
      destination_department_id: destDept.id,
      ingredient_id: ing.id,
      quantity: qty,
      status: 'approved',
      requested_by: users[2]!.id,
      validated_by: users[1]!.id,
      created_at: new Date(date.getTime() - 3600000),
      updated_at: date,
    });
  }

  // Pending transfers (not yet approved)
  const pendingCount = randomBetween(2, 3);
  for (let i = 0; i < pendingCount; i++) {
    trId++;
    const srcDept = tdef.departments[0];
    const destDept = pick(tdef.departments.slice(1));
    const ing = pick(tdef.ingredients);
    const qty = randomFloat(2, 10);
    const days = randomBetween(0, 3);
    const date = daysAgo(days);

    transfers.push({
      id: trId,
      tenant_id: tdef.id,
      source_department_id: srcDept.id,
      destination_department_id: destDept.id,
      ingredient_id: ing.id,
      quantity: qty,
      status: 'pending',
      requested_by: users[2]!.id,
      validated_by: null,
      created_at: date,
      updated_at: date,
    });
  }

  // One awaiting manager approval
  trId++;
  const ingPending = tdef.departments[0] === tdef.departments[0] ? pick(tdef.ingredients) : tdef.ingredients[0]!;
  transfers.push({
    id: trId,
    tenant_id: tdef.id,
    source_department_id: tdef.departments[0].id,
    destination_department_id: tdef.departments[2].id,
    ingredient_id: ingPending.id,
    quantity: randomFloat(3, 8),
    status: 'pending',
    requested_by: users[2]!.id,
    validated_by: null,
    created_at: daysAgo(0),
    updated_at: daysAgo(0),
  });

  return transfers;
}

function generateAgentHeartbeats(tdef: TenantDef): any[] {
  const heartbeats: any[] = [];
  let hbId = 0;

  for (const agent of tdef.agents) {
    const numHeartbeats = randomBetween(15, 30);
    for (let i = 0; i < numHeartbeats; i++) {
      hbId++;
      const minutesAgo = randomBetween(1, 1440);
      const date = new Date(now.getTime() - minutesAgo * 60000);
      const ticketsImported = randomBetween(5, 50);

      heartbeats.push({
        id: hbId,
        agent_id: agent.id,
        tenant_id: tdef.id,
        version: agent.version,
        status: 'online',
        health_status: 'healthy',
        last_sync_at: new Date(date.getTime() - randomBetween(10, 60) * 1000),
        connector_status: 'connected',
        sync_duration_ms: randomBetween(200, 3000),
        tickets_imported: ticketsImported,
        errors_count: 0,
        warnings: [],
        created_at: date,
      });
    }
  }

  return heartbeats;
}

function generateTenantSettings(tdef: TenantDef): any[] {
  return [
    { id: 0, tenant_id: tdef.id, category: 'restaurant', key: 'name', value: JSON.stringify(tdef.name), encrypted: false, created_at: new Date(), updated_at: new Date() },
    { id: 0, tenant_id: tdef.id, category: 'restaurant', key: 'currency', value: '"TND"', encrypted: false, created_at: new Date(), updated_at: new Date() },
    { id: 0, tenant_id: tdef.id, category: 'restaurant', key: 'timezone', value: '"Africa/Tunis"', encrypted: false, created_at: new Date(), updated_at: new Date() },
    { id: 0, tenant_id: tdef.id, category: 'general', key: 'language', value: '"fr"', encrypted: false, created_at: new Date(), updated_at: new Date() },
    { id: 0, tenant_id: tdef.id, category: 'sync', key: 'polling_interval', value: '12000', encrypted: false, created_at: new Date(), updated_at: new Date() },
    { id: 0, tenant_id: tdef.id, category: 'inventory', key: 'enable_losses', value: 'true', encrypted: false, created_at: new Date(), updated_at: new Date() },
    { id: 0, tenant_id: tdef.id, category: 'inventory', key: 'enable_transfers', value: 'true', encrypted: false, created_at: new Date(), updated_at: new Date() },
    { id: 0, tenant_id: tdef.id, category: 'sync', key: 'connector_type', value: JSON.stringify(tdef.connectorType), encrypted: false, created_at: new Date(), updated_at: new Date() },
    { id: 0, tenant_id: tdef.id, category: 'notifications', key: 'low_stock_alerts', value: 'true', encrypted: false, created_at: new Date(), updated_at: new Date() },
    { id: 0, tenant_id: tdef.id, category: 'notifications', key: 'loss_alerts', value: 'true', encrypted: false, created_at: new Date(), updated_at: new Date() },
  ];
}

function generateAuditLogs(tdef: TenantDef): any[] {
  const logs: any[] = [];
  let logId = 0;

  for (let dayOffset = 30; dayOffset >= 0; dayOffset -= randomBetween(1, 3)) {
    logId++;
    const date = daysAgo(dayOffset);
    const user = pick(tdef.users);
    const actions = ['user.login', 'inventory.view', 'recipe.modify', 'sync.run', 'settings.update', 'loss.report', 'transfer.create', 'transfer.approve', 'dashboard.view', 'report.export'];
    const action = pick(actions);

    logs.push({
      id: logId,
      tenant_id: tdef.id,
      user_id: user.id,
      action,
      entity_type: action.split('.')[0] || 'system',
      entity_id: randomBetween(1, 100),
      old_value: null,
      new_value: null,
      ip_address: '192.168.1.' + randomBetween(10, 200),
      user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0',
      created_at: new Date(date.getTime() + randomBetween(7, 20) * 3600000),
    });
  }

  return logs;
}

function generatePurchases(tdef: TenantDef): any[] {
  const purchases: any[] = [];
  let purId = 0;

  for (let dayOffset = 60; dayOffset >= 0; dayOffset -= randomBetween(2, 4)) {
    const date = daysAgo(dayOffset);
    date.setHours(randomBetween(8, 14), randomBetween(0, 59), 0, 0);

    const supplier = pick(tdef.suppliers);
    const numItems = randomBetween(2, 6);
    const shuffled = [...tdef.ingredients].sort(() => 0.5 - Math.random());

    for (let i = 0; i < Math.min(numItems, shuffled.length); i++) {
      purId++;
      const ing = shuffled[i];
      const qty = randomFloat(1, 20) * Math.max(1, ing.conversion_factor / 2);
      const unitPrice = ing.purchase_price_per_unit * Math.max(1, ing.conversion_factor / 2);

      purchases.push({
        id: purId,
        tenant_id: tdef.id,
        supplier_name: supplier.name,
        ingredient_id: ing.id,
        ingredient_name: ing.name,
        quantity: qty,
        unit_price: parseFloat(unitPrice.toFixed(2)),
        total_price: parseFloat((qty * unitPrice).toFixed(2)),
        invoice_ref: `INV-${tdef.slug}-${formatDate(date)}-${String(purId).padStart(3, '0')}`,
        delivery_date: new Date(date.getTime() + randomBetween(1, 3) * 86400000),
        received: true,
        created_at: date,
      });
    }
  }

  return purchases;
}

// ─── Main Generation ───

export function generateSeedData(): SeedData {
  let data: SeedData = {
    tenants: [],
    users: [],
    departments: [],
    ingredients: [],
    inventory_stocks: [],
    recipes: [],
    recipe_ingredients: [],
    sales_tickets: [],
    sales_ticket_items: [],
    stock_movements: [],
    ingredient_losses: [],
    transfer_requests: [],
    agents: [],
    agent_heartbeats: [],
    tenant_settings: [],
    audit_logs: [],
    suppliers: [],
    purchases: [],
    product_mappings: [],
  };

  const tenants = [burgerHouse];

  for (const tdef of tenants) {
    // Tenant
    data.tenants.push({
      id: tdef.id,
      uuid: crypto.randomUUID(),
      name: tdef.name,
      slug: tdef.slug,
      logo: null,
      email: tdef.email,
      phone: tdef.phone,
      address: tdef.address,
      country: 'Tunisia',
      timezone: 'Africa/Tunis',
      language: 'fr',
      currency: 'TND',
      status: 'active',
      subscription_plan: 'starter',
      trial_ends_at: null,
      max_users: 10,
      max_agents: 5,
      created_at: daysAgo(120),
      updated_at: now,
    });

    // Users
    for (const u of tdef.users) {
      data.users.push({
        id: u.id,
        tenant_id: tdef.id,
        username: u.username,
        password_hash: u.password,
        role: u.role,
        first_name: u.first_name,
        last_name: u.last_name,
        is_active: true,
        last_login_at: daysAgo(randomBetween(0, 2)),
        created_at: daysAgo(100),
        updated_at: now,
      });
    }

    // Departments
    for (const d of tdef.departments) {
      data.departments.push({ ...d, tenant_id: tdef.id, created_at: daysAgo(100), updated_at: now });
    }

    // Ingredients
    for (const i of tdef.ingredients) {
      data.ingredients.push({
        ...i, tenant_id: tdef.id,
        created_at: daysAgo(100), updated_at: now,
      });
    }

    // Recipes + Recipe Ingredients
    for (const r of tdef.recipes) {
      data.recipes.push({
        id: r.id,
        tenant_id: tdef.id,
        name: r.name,
        sale_price: r.sale_price,
        is_active: true,
        created_at: daysAgo(90),
        updated_at: now,
      });
      for (let ri = 0; ri < r.ingredient_ids.length; ri++) {
        const existing = data.recipe_ingredients.filter(
          x => x.recipe_id === r.id && x.ingredient_id === r.ingredient_ids[ri]
        );
        if (existing.length === 0) {
          data.recipe_ingredients.push({
            id: data.recipe_ingredients.length + 1,
            tenant_id: tdef.id,
            recipe_id: r.id,
            ingredient_id: r.ingredient_ids[ri],
            quantity_needed: r.quantities[ri],
          });
        }
      }
    }

    // Generate losses
    const losses = generateLosses(tdef);
    data.ingredient_losses.push(...losses);

    // Generate transfers
    const transfers = generateTransfers(tdef);
    data.transfer_requests.push(...transfers);

    // Generate sales
    const sales = generateSales(tdef);
    data.sales_tickets.push(...sales.sales_tickets);
    data.sales_ticket_items.push(...sales.sales_ticket_items);

    // Generate stock movements
    const movements = generateStockMovements(tdef, sales.sales_tickets, sales.sales_ticket_items, losses, transfers);
    data.stock_movements.push(...movements);

    // Generate current stock levels
    const stocks = generateCurrentStocks(tdef, movements);
    data.inventory_stocks.push(...stocks);

    // Agents
    for (const a of tdef.agents) {
      data.agents.push({
        id: a.id,
        uuid: crypto.randomUUID(),
        tenant_id: tdef.id,
        name: a.name,
        machine_name: a.machine_name,
        machine_id: `MACHINE-${String(tdef.id).padStart(2, '0')}-${a.id}`,
        operating_system: 'Windows 11 Pro',
        version: a.version,
        connector_type: a.connector_type,
        status: 'online',
        agent_secret_hash: '$2a$12$' + crypto.randomBytes(22).toString('base64').replace(/\+/g, '.').replace(/\//g, '/').substring(0, 53),
        config: a.config,
        last_seen_at: new Date(now.getTime() - randomBetween(10, 60) * 1000),
        last_sync_at: new Date(now.getTime() - randomBetween(30, 90) * 1000),
        last_heartbeat_at: new Date(now.getTime() - randomBetween(5, 30) * 1000),
        health_status: 'healthy',
        error_message: null,
        created_at: daysAgo(60),
        updated_at: now,
      });
    }

    // Agent heartbeats
    const heartbeats = generateAgentHeartbeats(tdef);
    data.agent_heartbeats.push(...heartbeats);

    // Tenant settings
    const settings = generateTenantSettings(tdef);
    // Assign unique IDs
    for (const s of settings) {
      s.id = data.tenant_settings.length + 1;
      data.tenant_settings.push(s);
    }

    // Audit logs
    const logs = generateAuditLogs(tdef);
    data.audit_logs.push(...logs);

    // Purchases / invoices
    const purchases = generatePurchases(tdef);
    data.purchases.push(...purchases);

    // Suppliers
    for (let si = 0; si < tdef.suppliers.length; si++) {
      const s = tdef.suppliers[si];
      data.suppliers.push({
        id: si + 1,
        tenant_id: tdef.id,
        name: s.name,
        company_name: s.company_name || null,
        reference: null,
        tax_number: s.tax_number || null,
        registration_number: s.registration_number || null,
        contact_person: s.contact_person || s.contact || null,
        email: s.email || null,
        phone: s.phone || null,
        mobile: null,
        website: null,
        address: null,
        city: s.city || null,
        postal_code: null,
        country: s.country || 'Tunisie',
        payment_terms: s.payment_terms || null,
        payment_method: null,
        currency: 'TND',
        delivery_delay: 0,
        minimum_order_amount: 0,
        notes: null,
        status: 'active',
        preferred: s.preferred || false,
        rating: 0,
        created_at: daysAgo(60),
        updated_at: now,
        archived_at: null,
      });
    }

    // ─── Product Mappings (External POS → mePOS Recipes) ───
    // The POS system has its own product names/codes; we map them to our 8 recipes
    const connectorType = tdef.connectorType;
    let pmId = data.product_mappings.length;

    // Mapped: External POS products that map to our 8 recipes
    const mappedProducts = [
      { extId: 'POS-BURG-001', code: 'BURG-001', name: 'Classic Burger', recipeId: 1, confidence: 100 },
      { extId: 'POS-BURG-002', code: 'BURG-002', name: 'Double Burger', recipeId: 2, confidence: 100 },
      { extId: 'POS-BURG-003', code: 'BURG-003', name: 'Cheese Burger', recipeId: 3, confidence: 95 },
      { extId: 'POS-CHK-001', code: 'CHK-001', name: 'Chicken Burger', recipeId: 4, confidence: 100 },
      { extId: 'POS-FRY-001', code: 'FRY-001', name: 'French Fries', recipeId: 5, confidence: 100 },
      { extId: 'POS-NUG-001', code: 'NUG-001', name: 'Nuggets 6pcs', recipeId: 6, confidence: 82 },
      { extId: 'POS-DRK-001', code: 'DRK-001', name: 'Soda', recipeId: 7, confidence: 100 },
      { extId: 'POS-DRK-002', code: 'DRK-002', name: 'Eau Minerale', recipeId: 8, confidence: 100 },
    ];
    for (const p of mappedProducts) {
      pmId++;
      data.product_mappings.push({
        id: pmId, tenant_id: tdef.id, connector_type: connectorType,
        external_product_id: p.extId, external_product_code: p.code,
        external_product_name: p.name, mepos_product_id: p.recipeId,
        mapping_status: 'mapped', confidence: p.confidence,
        created_at: daysAgo(30), updated_at: daysAgo(1),
      });
    }

    // Unmapped: External POS products with no matching recipe yet
    const unmappedProducts = [
      { extId: 'POS-SAL-001', code: 'SAL-001', name: 'Salade Caesar' },
      { extId: 'POS-SAL-002', code: 'SAL-002', name: 'Salade Chef' },
      { extId: 'POS-ICE-001', code: 'ICE-001', name: 'Glace Vanille' },
      { extId: 'POS-COF-001', code: 'COF-001', name: 'Cafe Express' },
    ];
    for (const p of unmappedProducts) {
      pmId++;
      data.product_mappings.push({
        id: pmId, tenant_id: tdef.id, connector_type: connectorType,
        external_product_id: p.extId, external_product_code: p.code,
        external_product_name: p.name, mepos_product_id: null,
        mapping_status: 'unmapped', confidence: 0,
        created_at: daysAgo(30), updated_at: daysAgo(30),
      });
    }

    // Ignored: Discontinued or irrelevant POS products
    const ignoredProducts = [
      { extId: 'POS-SHD-001', code: 'SHD-001', name: 'Smoothie Fraise (retire)' },
      { extId: 'POS-SPC-999', code: 'SPC-999', name: 'Menu Enfant (temporaire)' },
    ];
    for (const p of ignoredProducts) {
      pmId++;
      data.product_mappings.push({
        id: pmId, tenant_id: tdef.id, connector_type: connectorType,
        external_product_id: p.extId, external_product_code: p.code,
        external_product_name: p.name, mepos_product_id: null,
        mapping_status: 'ignored', confidence: 0,
        created_at: daysAgo(30), updated_at: daysAgo(15),
      });
    }

    // Link suppliers to ingredients (explicit mapping for ALL 20 ingredients)
    const supplierMap: Record<string, number> = {};
    data.suppliers.forEach((s: any) => { supplierMap[s.name.toLowerCase()] = s.id; });
    const ingToSupplier: Record<string, string> = {
      'Viande Hachée Bœuf': 'fresh meat tunisia',
      'Blanc de Poulet': 'fresh meat tunisia',
      'Pain Burger': 'les grands moulins',
      'Fromage Cheddar': 'société des fromages',
      'Tomates': 'tunisie légumes',
      'Oignons': 'tunisie légumes',
      'Salade Laitue': 'tunisie légumes',
      'Cornichons': 'marché central',
      'Frites Surgelées': 'marché central',
      'Huile de Friture': 'marché central',
      'Mayonnaise': 'marché central',
      'Ketchup': 'marché central',
      'Moutarde': 'marché central',
      'Farine de Blé': 'les grands moulins',
      'Œufs': 'délice danone',
      'Boissons Gazeuses': 'sotub',
      'Eau Minérale': 'sotub',
      'Sel': 'marché central',
      'Poivre Noir': 'marché central',
      'Pommes de Terre': 'tunisie légumes',
    };
    for (const ing of data.ingredients) {
      const supplierKey = ingToSupplier[ing.name];
      if (supplierKey) {
        ing.preferred_supplier_id = supplierMap[supplierKey];
      }
    }
  }

  return data;
}

export const seedData = generateSeedData();
