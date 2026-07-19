"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.demoDb = exports.isDemoMode = exports.pool = void 0;
exports.checkConnection = checkConnection;
exports.query = query;
exports.getClient = getClient;
const pg_1 = require("pg");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const connectionString = process.env.DATABASE_URL;
exports.pool = new pg_1.Pool({
    connectionString,
    connectionTimeoutMillis: 2000 // fail fast if not running
});
exports.isDemoMode = false;
// Store in-memory state for Demo Mode fallback
exports.demoDb = {
    users: [
        { id: 1, username: 'admin', password_hash: 'admin123', role: 'admin', first_name: 'Med', last_name: 'Mair' },
        { id: 2, username: 'gerant', password_hash: 'gerant123', role: 'manager', first_name: 'Ahmed', last_name: 'Ben Ali' },
        { id: 3, username: 'cuisinier', password_hash: 'cuisinier123', role: 'cook', first_name: 'Youssef', last_name: 'Tunisi' }
    ],
    departments: [
        { id: 1, name: 'Dépôt Central', stock_type: 'isolated', description: 'Stockage principal des matières premières' },
        { id: 2, name: 'Cuisine', stock_type: 'isolated', description: 'Zone de préparation de la cuisine' },
        { id: 3, name: 'Comptoir', stock_type: 'isolated', description: 'Vente comptoir et service clients' }
    ],
    ingredients: [
        { id: 1, name: 'Farine de Blé', unit: 'kg', purchase_price_per_unit: 1.80, alert_threshold: 15.0000, purchase_unit: 'sac', purchase_unit_price: 36.00, conversion_factor: 20.0000 },
        { id: 2, name: 'Mozzarella Râpée', unit: 'kg', purchase_price_per_unit: 18.00, alert_threshold: 8.0000, purchase_unit: 'carton', purchase_unit_price: 180.00, conversion_factor: 10.0000 },
        { id: 3, name: 'Sauce Tomate', unit: 'kg', purchase_price_per_unit: 4.50, alert_threshold: 6.0000, purchase_unit: 'bidon', purchase_unit_price: 22.50, conversion_factor: 5.0000 },
        { id: 4, name: 'Steak de Bœuf', unit: 'pcs', purchase_price_per_unit: 3.50, alert_threshold: 40.0000, purchase_unit: 'carton', purchase_unit_price: 175.00, conversion_factor: 50.0000 },
        { id: 5, name: 'Pain Burger', unit: 'pcs', purchase_price_per_unit: 0.80, alert_threshold: 45.0000, purchase_unit: 'paquet', purchase_unit_price: 19.20, conversion_factor: 24.0000 },
        { id: 6, name: 'Fromage Cheddar', unit: 'kg', purchase_price_per_unit: 24.00, alert_threshold: 4.0000, purchase_unit: 'bloc', purchase_unit_price: 120.00, conversion_factor: 5.0000 },
        { id: 7, name: 'Poulet Émincé', unit: 'kg', purchase_price_per_unit: 14.00, alert_threshold: 8.0000, purchase_unit: 'sac', purchase_unit_price: 70.00, conversion_factor: 5.0000 },
        { id: 8, name: 'Nutella', unit: 'g', purchase_price_per_unit: 0.0250, alert_threshold: 1000.0000, purchase_unit: 'pot', purchase_unit_price: 25.00, conversion_factor: 1000.0000 },
        { id: 9, name: 'Frites Surgelées', unit: 'kg', purchase_price_per_unit: 6.00, alert_threshold: 20.0000, purchase_unit: 'carton', purchase_unit_price: 60.00, conversion_factor: 10.0000 },
        { id: 10, name: 'Huile de Friture', unit: 'L', purchase_price_per_unit: 5.50, alert_threshold: 12.0000, purchase_unit: 'bidon', purchase_unit_price: 110.00, conversion_factor: 20.0000 },
        { id: 11, name: 'Soda Cannette', unit: 'pcs', purchase_price_per_unit: 1.20, alert_threshold: 50.0000, purchase_unit: 'plateau', purchase_unit_price: 28.80, conversion_factor: 24.0000 },
        { id: 12, name: 'Eau Minérale 0.5L', unit: 'pcs', purchase_price_per_unit: 0.60, alert_threshold: 60.0000, purchase_unit: 'fardeau', purchase_unit_price: 7.20, conversion_factor: 12.0000 },
        { id: 13, name: 'Pepperoni Bœuf', unit: 'kg', purchase_price_per_unit: 28.00, alert_threshold: 3.0000, purchase_unit: 'barquette', purchase_unit_price: 56.00, conversion_factor: 2.0000 }
    ],
    inventory_stocks: [
        // Dépôt Central starting stock
        { id: 1, department_id: 1, ingredient_id: 1, quantity: 300.0000 }, // Farine
        { id: 2, department_id: 1, ingredient_id: 2, quantity: 80.0000 }, // Mozzarella
        { id: 3, department_id: 1, ingredient_id: 3, quantity: 60.0000 }, // Sauce Tomate
        { id: 4, department_id: 1, ingredient_id: 4, quantity: 200.0000 }, // Steaks
        { id: 5, department_id: 1, ingredient_id: 5, quantity: 150.0000 }, // Pains
        { id: 6, department_id: 1, ingredient_id: 6, quantity: 30.0000 }, // Cheddar
        { id: 7, department_id: 1, ingredient_id: 7, quantity: 50.0000 }, // Poulet
        { id: 8, department_id: 1, ingredient_id: 8, quantity: 15000.0000 }, // Nutella (15kg)
        { id: 9, department_id: 1, ingredient_id: 9, quantity: 120.0000 }, // Frites
        { id: 10, department_id: 1, ingredient_id: 10, quantity: 80.0000 }, // Huile
        { id: 11, department_id: 1, ingredient_id: 11, quantity: 240.0000 }, // Soda
        { id: 12, department_id: 1, ingredient_id: 12, quantity: 200.0000 }, // Eau
        { id: 13, department_id: 1, ingredient_id: 13, quantity: 20.0000 }, // Pepperoni
        // Cuisine stocks (Merged Cuisine Centrale & Cuisine Pizzas)
        { id: 14, department_id: 2, ingredient_id: 4, quantity: 30.0000 }, // Steaks
        { id: 15, department_id: 2, ingredient_id: 5, quantity: 30.0000 }, // Pains
        { id: 16, department_id: 2, ingredient_id: 6, quantity: 5.0000 }, // Cheddar
        { id: 17, department_id: 2, ingredient_id: 9, quantity: 10.0000 }, // Frites
        { id: 18, department_id: 2, ingredient_id: 10, quantity: 10.0000 }, // Huile
        { id: 19, department_id: 2, ingredient_id: 1, quantity: 40.0000 }, // Farine
        { id: 20, department_id: 2, ingredient_id: 2, quantity: 10.0000 }, // Mozzarella
        { id: 21, department_id: 2, ingredient_id: 3, quantity: 10.0000 }, // Sauce Tomate
        { id: 22, department_id: 2, ingredient_id: 13, quantity: 3.0000 }, // Pepperoni
        // Comptoir stocks (Comptoir Desserts)
        { id: 23, department_id: 3, ingredient_id: 1, quantity: 10.0000 }, // Farine
        { id: 24, department_id: 3, ingredient_id: 8, quantity: 3000.0000 } // Nutella (3kg)
    ],
    recipes: [
        { id: 1, name: 'Pizza Margherita', sale_price: 12.50, is_active: true },
        { id: 2, name: 'Pizza Pepperoni', sale_price: 16.50, is_active: true },
        { id: 3, name: 'Burger Classic', sale_price: 13.50, is_active: true },
        { id: 4, name: 'Burger Double Cheddar', sale_price: 18.50, is_active: true },
        { id: 5, name: 'Pizza BBQ Poulet', sale_price: 17.50, is_active: true },
        { id: 6, name: 'Crêpe Nutella', sale_price: 8.50, is_active: true },
        { id: 7, name: 'Portion Frites', sale_price: 4.50, is_active: true },
        { id: 8, name: 'Soda Cola Frais', sale_price: 2.50, is_active: true },
        { id: 9, name: 'Eau Minérale', sale_price: 1.50, is_active: true }
    ],
    recipe_ingredients: [
        // Pizza Margherita (1)
        { id: 1, recipe_id: 1, ingredient_id: 1, quantity_needed: 0.2000 }, // Farine
        { id: 2, recipe_id: 1, ingredient_id: 2, quantity_needed: 0.1500 }, // Mozzarella
        { id: 3, recipe_id: 1, ingredient_id: 3, quantity_needed: 0.1000 }, // Sauce Tomate
        // Pizza Pepperoni (2)
        { id: 4, recipe_id: 2, ingredient_id: 1, quantity_needed: 0.2000 }, // Farine
        { id: 5, recipe_id: 2, ingredient_id: 2, quantity_needed: 0.1500 }, // Mozzarella
        { id: 6, recipe_id: 2, ingredient_id: 3, quantity_needed: 0.1000 }, // Sauce Tomate
        { id: 7, recipe_id: 2, ingredient_id: 13, quantity_needed: 0.0800 }, // Pepperoni
        // Burger Classic (3)
        { id: 8, recipe_id: 3, ingredient_id: 5, quantity_needed: 1.0000 }, // Pain Burger
        { id: 9, recipe_id: 3, ingredient_id: 4, quantity_needed: 1.0000 }, // Steak
        { id: 10, recipe_id: 3, ingredient_id: 6, quantity_needed: 0.0300 }, // Cheddar
        // Burger Double Cheddar (4)
        { id: 11, recipe_id: 4, ingredient_id: 5, quantity_needed: 1.0000 }, // Pain Burger
        { id: 12, recipe_id: 4, ingredient_id: 4, quantity_needed: 2.0000 }, // Steak x2
        { id: 13, recipe_id: 4, ingredient_id: 6, quantity_needed: 0.0600 }, // Cheddar x2
        // Pizza BBQ Poulet (5)
        { id: 14, recipe_id: 5, ingredient_id: 1, quantity_needed: 0.2000 }, // Farine
        { id: 15, recipe_id: 5, ingredient_id: 2, quantity_needed: 0.1500 }, // Mozzarella
        { id: 16, recipe_id: 5, ingredient_id: 3, quantity_needed: 0.1000 }, // Sauce Tomate
        { id: 17, recipe_id: 5, ingredient_id: 7, quantity_needed: 0.1000 }, // Poulet
        // Crêpe Nutella (6)
        { id: 18, recipe_id: 6, ingredient_id: 1, quantity_needed: 0.0800 }, // Farine
        { id: 19, recipe_id: 6, ingredient_id: 8, quantity_needed: 50.0000 }, // Nutella 50g
        // Portion Frites (7)
        { id: 20, recipe_id: 7, ingredient_id: 9, quantity_needed: 0.2500 }, // Frites
        { id: 21, recipe_id: 7, ingredient_id: 10, quantity_needed: 0.0500 }, // Huile
        // Soda Cola Frais (8)
        { id: 22, recipe_id: 8, ingredient_id: 11, quantity_needed: 1.0000 }, // Soda can
        // Eau Minérale (9)
        { id: 23, recipe_id: 9, ingredient_id: 12, quantity_needed: 1.0000 } // Eau
    ],
    sales_tickets: [],
    sales_ticket_items: [],
    stock_movements: [],
    ingredient_losses: [],
    transfer_requests: [
        {
            id: 1,
            source_department_id: 1,
            destination_department_id: 2,
            ingredient_id: 6, // Cheddar
            quantity: 5.0000,
            status: 'pending',
            requested_by: 3, // Youssef (Cuisinier)
            validated_by: null,
            created_at: new Date(Date.now() - 3600 * 1000).toISOString(),
            updated_at: new Date(Date.now() - 3600 * 1000).toISOString()
        }
    ]
};
// Check DB Connection
async function checkConnection() {
    try {
        const client = await exports.pool.connect();
        console.log('Successfully connected to PostgreSQL.');
        client.release();
        exports.isDemoMode = false;
    }
    catch (err) {
        console.warn('\n========================================================================');
        console.warn('WARNING: Could not connect to PostgreSQL database.');
        console.warn('mePOS STOCK API will run in DEMO MODE (In-Memory database state).');
        console.warn('No modifications will be persisted, but the API remains fully functional.');
        console.warn('========================================================================\n');
        exports.isDemoMode = true;
    }
}
// Helper for executing queries
async function query(text, params) {
    if (exports.isDemoMode) {
        // Return empty results or throw, but checkConnection handles init.
        // For queries, we handle them route by route or throw an error.
        return { rows: [], rowCount: 0 };
    }
    const start = Date.now();
    const res = await exports.pool.query(text, params);
    const duration = Date.now() - start;
    return res;
}
// Helper for transaction execution
async function getClient() {
    if (exports.isDemoMode) {
        // Return a mock client that resolves successfully
        const mockClient = {
            query: async (text, params) => {
                return { rows: [], rowCount: 0 };
            }
        };
        return { client: mockClient, release: () => { } };
    }
    const client = await exports.pool.connect();
    const release = client.release.bind(client);
    return { client, release };
}
