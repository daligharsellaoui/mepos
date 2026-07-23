import { Pool } from 'pg';
import dotenv from 'dotenv';
import { seedData } from './seed';

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
  notifications: any[];
  notification_preferences: any[];
  suppliers: any[];
  purchases: any[];
  product_mappings: any[];
  activity_journal: any[];
  purchase_orders: any[];
  purchase_order_items: any[];
  goods_receptions: any[];
  goods_reception_items: any[];
  supplier_invoices: any[];
  inventory_batches: any[];
  batch_movements: any[];
  inventory_counts: any[];
  inventory_count_items: any[];
  inventory_adjustments: any[];
  ingredient_price_history: any[];
  supplier_ingredients: any[];
  purchase_returns: any[];
  purchase_return_items: any[];
} = {
  tenants: seedData.tenants,
  users: seedData.users,
  departments: seedData.departments,
  ingredients: seedData.ingredients,
  inventory_stocks: seedData.inventory_stocks,
  recipes: seedData.recipes,
  recipe_ingredients: seedData.recipe_ingredients,
  sales_tickets: seedData.sales_tickets,
  sales_ticket_items: seedData.sales_ticket_items,
  stock_movements: seedData.stock_movements,
  ingredient_losses: seedData.ingredient_losses,
  transfer_requests: seedData.transfer_requests,
  agents: seedData.agents,
  agent_heartbeats: seedData.agent_heartbeats,
  tenant_settings: seedData.tenant_settings,
  notifications: [],
  notification_preferences: [],
  suppliers: seedData.suppliers,
  purchases: seedData.purchases,
  product_mappings: [],
  activity_journal: [],
  purchase_orders: [],
  purchase_order_items: [],
  goods_receptions: [],
  goods_reception_items: [],
  supplier_invoices: [],
  inventory_batches: [],
  batch_movements: [],
  inventory_counts: [],
  inventory_count_items: [],
  inventory_adjustments: [],
  ingredient_price_history: [],
  supplier_ingredients: [],
  purchase_returns: [],
  purchase_return_items: [],
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
