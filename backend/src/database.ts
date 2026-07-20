import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;

// Create pool (may be configured lazily)
const poolConfig: any = {
  connectionTimeoutMillis: 2000 // fail fast if not running
};
if (connectionString) {
  poolConfig.connectionString = connectionString;
}

export const pool = new Pool(poolConfig);

// Default to demo mode. checkConnection() will switch to PG mode if database is available.
export let isDemoMode = true;

// Store in-memory state for Demo Mode fallback
export const demoDb: {
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
} = {
  tenants: [
    { id: 1, uuid: '00000000-0000-0000-0000-000000000001', name: 'Restaurant Demo', slug: 'restaurant-demo', email: 'admin@restaurant-demo.com', country: 'Tunisia', timezone: 'Africa/Tunis', language: 'fr', currency: 'TND', status: 'active', subscription_plan: 'starter' }
  ],
  users: [
    { id: 1, tenant_id: 1, username: 'admin', password_hash: 'admin123', role: 'admin', first_name: 'Med', last_name: 'Mair' },
    { id: 2, tenant_id: 1, username: 'gerant', password_hash: 'gerant123', role: 'manager', first_name: 'Ahmed', last_name: 'Ben Ali' },
    { id: 3, tenant_id: 1, username: 'cuisinier', password_hash: 'cuisinier123', role: 'cook', first_name: 'Youssef', last_name: 'Tunisi' }
  ],
  departments: [
    { id: 1, tenant_id: 1, name: 'Dépôt Central', stock_type: 'isolated', description: 'Stockage principal des matières premières' },
    { id: 2, tenant_id: 1, name: 'Cuisine', stock_type: 'isolated', description: 'Zone de préparation de la cuisine' },
    { id: 3, tenant_id: 1, name: 'Comptoir', stock_type: 'isolated', description: 'Vente comptoir et service clients' }
  ],
  ingredients: [
    { id: 1, tenant_id: 1, name: 'Farine de Blé', unit: 'kg', purchase_price_per_unit: 1.80, alert_threshold: 15.0000, purchase_unit: 'sac', purchase_unit_price: 36.00, conversion_factor: 20.0000 },
    { id: 2, tenant_id: 1, name: 'Mozzarella Râpée', unit: 'kg', purchase_price_per_unit: 18.00, alert_threshold: 8.0000, purchase_unit: 'carton', purchase_unit_price: 180.00, conversion_factor: 10.0000 },
    { id: 3, tenant_id: 1, name: 'Sauce Tomate', unit: 'kg', purchase_price_per_unit: 4.50, alert_threshold: 6.0000, purchase_unit: 'bidon', purchase_unit_price: 22.50, conversion_factor: 5.0000 },
    { id: 4, tenant_id: 1, name: 'Steak de Bœuf', unit: 'pcs', purchase_price_per_unit: 3.50, alert_threshold: 40.0000, purchase_unit: 'carton', purchase_unit_price: 175.00, conversion_factor: 50.0000 },
    { id: 5, tenant_id: 1, name: 'Pain Burger', unit: 'pcs', purchase_price_per_unit: 0.80, alert_threshold: 45.0000, purchase_unit: 'paquet', purchase_unit_price: 19.20, conversion_factor: 24.0000 },
    { id: 6, tenant_id: 1, name: 'Fromage Cheddar', unit: 'kg', purchase_price_per_unit: 24.00, alert_threshold: 4.0000, purchase_unit: 'bloc', purchase_unit_price: 120.00, conversion_factor: 5.0000 },
    { id: 7, tenant_id: 1, name: 'Poulet Émincé', unit: 'kg', purchase_price_per_unit: 14.00, alert_threshold: 8.0000, purchase_unit: 'sac', purchase_unit_price: 70.00, conversion_factor: 5.0000 },
    { id: 8, tenant_id: 1, name: 'Nutella', unit: 'g', purchase_price_per_unit: 0.0250, alert_threshold: 1000.0000, purchase_unit: 'pot', purchase_unit_price: 25.00, conversion_factor: 1000.0000 },
    { id: 9, tenant_id: 1, name: 'Frites Surgelées', unit: 'kg', purchase_price_per_unit: 6.00, alert_threshold: 20.0000, purchase_unit: 'carton', purchase_unit_price: 60.00, conversion_factor: 10.0000 },
    { id: 10, tenant_id: 1, name: 'Huile de Friture', unit: 'L', purchase_price_per_unit: 5.50, alert_threshold: 12.0000, purchase_unit: 'bidon', purchase_unit_price: 110.00, conversion_factor: 20.0000 },
    { id: 11, tenant_id: 1, name: 'Soda Cannette', unit: 'pcs', purchase_price_per_unit: 1.20, alert_threshold: 50.0000, purchase_unit: 'plateau', purchase_unit_price: 28.80, conversion_factor: 24.0000 },
    { id: 12, tenant_id: 1, name: 'Eau Minérale 0.5L', unit: 'pcs', purchase_price_per_unit: 0.60, alert_threshold: 60.0000, purchase_unit: 'fardeau', purchase_unit_price: 7.20, conversion_factor: 12.0000 },
    { id: 13, tenant_id: 1, name: 'Pepperoni Bœuf', unit: 'kg', purchase_price_per_unit: 28.00, alert_threshold: 3.0000, purchase_unit: 'barquette', purchase_unit_price: 56.00, conversion_factor: 2.0000 }
  ],
  inventory_stocks: [
    { id: 1, tenant_id: 1, department_id: 1, ingredient_id: 1, quantity: 300.0000 },
    { id: 2, tenant_id: 1, department_id: 1, ingredient_id: 2, quantity: 80.0000 },
    { id: 3, tenant_id: 1, department_id: 1, ingredient_id: 3, quantity: 60.0000 },
    { id: 4, tenant_id: 1, department_id: 1, ingredient_id: 4, quantity: 200.0000 },
    { id: 5, tenant_id: 1, department_id: 1, ingredient_id: 5, quantity: 150.0000 },
    { id: 6, tenant_id: 1, department_id: 1, ingredient_id: 6, quantity: 30.0000 },
    { id: 7, tenant_id: 1, department_id: 1, ingredient_id: 7, quantity: 50.0000 },
    { id: 8, tenant_id: 1, department_id: 1, ingredient_id: 8, quantity: 15000.0000 },
    { id: 9, tenant_id: 1, department_id: 1, ingredient_id: 9, quantity: 120.0000 },
    { id: 10, tenant_id: 1, department_id: 1, ingredient_id: 10, quantity: 80.0000 },
    { id: 11, tenant_id: 1, department_id: 1, ingredient_id: 11, quantity: 240.0000 },
    { id: 12, tenant_id: 1, department_id: 1, ingredient_id: 12, quantity: 200.0000 },
    { id: 13, tenant_id: 1, department_id: 1, ingredient_id: 13, quantity: 20.0000 },
    { id: 14, tenant_id: 1, department_id: 2, ingredient_id: 4, quantity: 30.0000 },
    { id: 15, tenant_id: 1, department_id: 2, ingredient_id: 5, quantity: 30.0000 },
    { id: 16, tenant_id: 1, department_id: 2, ingredient_id: 6, quantity: 5.0000 },
    { id: 17, tenant_id: 1, department_id: 2, ingredient_id: 9, quantity: 10.0000 },
    { id: 18, tenant_id: 1, department_id: 2, ingredient_id: 10, quantity: 10.0000 },
    { id: 19, tenant_id: 1, department_id: 2, ingredient_id: 1, quantity: 40.0000 },
    { id: 20, tenant_id: 1, department_id: 2, ingredient_id: 2, quantity: 10.0000 },
    { id: 21, tenant_id: 1, department_id: 2, ingredient_id: 3, quantity: 10.0000 },
    { id: 22, tenant_id: 1, department_id: 2, ingredient_id: 13, quantity: 3.0000 },
    { id: 23, tenant_id: 1, department_id: 3, ingredient_id: 1, quantity: 10.0000 },
    { id: 24, tenant_id: 1, department_id: 3, ingredient_id: 8, quantity: 3000.0000 }
  ],
  recipes: [
    { id: 1, tenant_id: 1, name: 'Pizza Margherita', sale_price: 12.50, is_active: true },
    { id: 2, tenant_id: 1, name: 'Pizza Pepperoni', sale_price: 16.50, is_active: true },
    { id: 3, tenant_id: 1, name: 'Burger Classic', sale_price: 13.50, is_active: true },
    { id: 4, tenant_id: 1, name: 'Burger Double Cheddar', sale_price: 18.50, is_active: true },
    { id: 5, tenant_id: 1, name: 'Pizza BBQ Poulet', sale_price: 17.50, is_active: true },
    { id: 6, tenant_id: 1, name: 'Crêpe Nutella', sale_price: 8.50, is_active: true },
    { id: 7, tenant_id: 1, name: 'Portion Frites', sale_price: 4.50, is_active: true },
    { id: 8, tenant_id: 1, name: 'Soda Cola Frais', sale_price: 2.50, is_active: true },
    { id: 9, tenant_id: 1, name: 'Eau Minérale', sale_price: 1.50, is_active: true }
  ],
  recipe_ingredients: [
    { id: 1, tenant_id: 1, recipe_id: 1, ingredient_id: 1, quantity_needed: 0.2000 },
    { id: 2, tenant_id: 1, recipe_id: 1, ingredient_id: 2, quantity_needed: 0.1500 },
    { id: 3, tenant_id: 1, recipe_id: 1, ingredient_id: 3, quantity_needed: 0.1000 },
    { id: 4, tenant_id: 1, recipe_id: 2, ingredient_id: 1, quantity_needed: 0.2000 },
    { id: 5, tenant_id: 1, recipe_id: 2, ingredient_id: 2, quantity_needed: 0.1500 },
    { id: 6, tenant_id: 1, recipe_id: 2, ingredient_id: 3, quantity_needed: 0.1000 },
    { id: 7, tenant_id: 1, recipe_id: 2, ingredient_id: 13, quantity_needed: 0.0800 },
    { id: 8, tenant_id: 1, recipe_id: 3, ingredient_id: 5, quantity_needed: 1.0000 },
    { id: 9, tenant_id: 1, recipe_id: 3, ingredient_id: 4, quantity_needed: 1.0000 },
    { id: 10, tenant_id: 1, recipe_id: 3, ingredient_id: 6, quantity_needed: 0.0300 },
    { id: 11, tenant_id: 1, recipe_id: 4, ingredient_id: 5, quantity_needed: 1.0000 },
    { id: 12, tenant_id: 1, recipe_id: 4, ingredient_id: 4, quantity_needed: 2.0000 },
    { id: 13, tenant_id: 1, recipe_id: 4, ingredient_id: 6, quantity_needed: 0.0600 },
    { id: 14, tenant_id: 1, recipe_id: 5, ingredient_id: 1, quantity_needed: 0.2000 },
    { id: 15, tenant_id: 1, recipe_id: 5, ingredient_id: 2, quantity_needed: 0.1500 },
    { id: 16, tenant_id: 1, recipe_id: 5, ingredient_id: 3, quantity_needed: 0.1000 },
    { id: 17, tenant_id: 1, recipe_id: 5, ingredient_id: 7, quantity_needed: 0.1000 },
    { id: 18, tenant_id: 1, recipe_id: 6, ingredient_id: 1, quantity_needed: 0.0800 },
    { id: 19, tenant_id: 1, recipe_id: 6, ingredient_id: 8, quantity_needed: 50.0000 },
    { id: 20, tenant_id: 1, recipe_id: 7, ingredient_id: 9, quantity_needed: 0.2500 },
    { id: 21, tenant_id: 1, recipe_id: 7, ingredient_id: 10, quantity_needed: 0.0500 },
    { id: 22, tenant_id: 1, recipe_id: 8, ingredient_id: 11, quantity_needed: 1.0000 },
    { id: 23, tenant_id: 1, recipe_id: 9, ingredient_id: 12, quantity_needed: 1.0000 }
  ],
  sales_tickets: [],
  sales_ticket_items: [],
  stock_movements: [],
  ingredient_losses: [],
  transfer_requests: [
    {
      id: 1,
      tenant_id: 1,
      source_department_id: 1,
      destination_department_id: 2,
      ingredient_id: 6,
      quantity: 5.0000,
      status: 'pending',
      requested_by: 3,
      validated_by: null,
      created_at: new Date(Date.now() - 3600 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 3600 * 1000).toISOString()
    }
  ],
  agents: [],
  agent_heartbeats: [],
  tenant_settings: []
};

// Check DB Connection
export async function checkConnection() {
  try {
    const client = await pool.connect();
    console.log('Successfully connected to PostgreSQL.');
    client.release();
    isDemoMode = false;
  } catch (err) {
    console.warn('\n========================================================================');
    console.warn('WARNING: Could not connect to PostgreSQL database.');
    console.warn('mePOS STOCK API will run in DEMO MODE (In-Memory database state).');
    console.warn('No modifications will be persisted, but the API remains fully functional.');
    console.warn('========================================================================\n');
    isDemoMode = true;
  }
}

// Helper for executing queries
export async function query(text: string, params?: any[]) {
  if (isDemoMode) {
    return { rows: [] as any[], rowCount: 0 };
  }
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  return res;
}

// Helper for transaction execution
export async function getClient() {
  if (isDemoMode) {
    const mockClient = {
      query: async (text: string, params?: any[]) => {
        return { rows: [] as any[], rowCount: 0 };
      }
    };
    return { client: mockClient as any, release: () => {} };
  }
  const client = await pool.connect();
  const release = client.release.bind(client);
  return { client, release };
}
