import { query } from './database';

export const DDL_SCHEMA = `
-- Enum Types if they don't exist
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('admin', 'manager', 'cook');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE stock_movement_type AS ENUM ('purchase', 'transfer_in', 'transfer_out', 'sale_deduction', 'loss', 'reconciliation');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 1. Users
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL,
    first_name VARCHAR(50),
    last_name VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Departments
CREATE TABLE IF NOT EXISTS departments (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    stock_type VARCHAR(20) NOT NULL CHECK (stock_type IN ('isolated', 'inherited')),
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Ingredients
CREATE TABLE IF NOT EXISTS ingredients (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    unit VARCHAR(10) NOT NULL,
    purchase_price_per_unit DECIMAL(10, 4) NOT NULL,
    alert_threshold DECIMAL(12, 4) NOT NULL DEFAULT 0.0000,
    purchase_unit VARCHAR(50) DEFAULT 'paquet',
    purchase_unit_price DECIMAL(10, 2) DEFAULT 0.00,
    conversion_factor DECIMAL(12, 4) DEFAULT 1.0000,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Inventory Stocks
CREATE TABLE IF NOT EXISTS inventory_stocks (
    id SERIAL PRIMARY KEY,
    department_id INT REFERENCES departments(id) ON DELETE CASCADE,
    ingredient_id INT REFERENCES ingredients(id) ON DELETE CASCADE,
    quantity DECIMAL(12, 4) NOT NULL DEFAULT 0.0000,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(department_id, ingredient_id)
);

-- 5. Recipes
CREATE TABLE IF NOT EXISTS recipes (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) UNIQUE NOT NULL,
    sale_price DECIMAL(10, 2) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Recipe Ingredients
CREATE TABLE IF NOT EXISTS recipe_ingredients (
    id SERIAL PRIMARY KEY,
    recipe_id INT REFERENCES recipes(id) ON DELETE CASCADE,
    ingredient_id INT REFERENCES ingredients(id) ON DELETE CASCADE,
    quantity_needed DECIMAL(12, 4) NOT NULL,
    UNIQUE(recipe_id, ingredient_id)
);

-- 7. Sales Tickets
CREATE TABLE IF NOT EXISTS sales_tickets (
    id SERIAL PRIMARY KEY,
    external_ticket_id VARCHAR(100) NOT NULL,
    department_id INT REFERENCES departments(id),
    ticket_date TIMESTAMP WITH TIME ZONE NOT NULL,
    total_amount DECIMAL(10, 2) NOT NULL,
    sync_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(department_id, external_ticket_id)
);

-- 8. Sales Ticket Items
CREATE TABLE IF NOT EXISTS sales_ticket_items (
    id SERIAL PRIMARY KEY,
    sales_ticket_id INT REFERENCES sales_tickets(id) ON DELETE CASCADE,
    recipe_id INT REFERENCES recipes(id),
    quantity DECIMAL(10, 2) NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL
);

-- 9. Stock Movements
CREATE TABLE IF NOT EXISTS stock_movements (
    id SERIAL PRIMARY KEY,
    department_id INT REFERENCES departments(id),
    ingredient_id INT REFERENCES ingredients(id),
    quantity DECIMAL(12, 4) NOT NULL,
    type stock_movement_type NOT NULL,
    reference_id VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 10. Ingredient Losses
CREATE TABLE IF NOT EXISTS ingredient_losses (
    id SERIAL PRIMARY KEY,
    department_id INT REFERENCES departments(id),
    ingredient_id INT REFERENCES ingredients(id),
    quantity DECIMAL(12, 4) NOT NULL,
    loss_reason VARCHAR(100),
    cost_loss DECIMAL(10, 2) NOT NULL,
    opportunity_loss DECIMAL(10, 2) NOT NULL,
    reported_by INT REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 11. Transfer Requests (Two-Step Recharge Workflow)
CREATE TABLE IF NOT EXISTS transfer_requests (
    id SERIAL PRIMARY KEY,
    source_department_id INT REFERENCES departments(id) ON DELETE CASCADE,
    destination_department_id INT REFERENCES departments(id) ON DELETE CASCADE,
    ingredient_id INT REFERENCES ingredients(id) ON DELETE CASCADE,
    quantity DECIMAL(12, 4) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
    requested_by INT REFERENCES users(id) ON DELETE SET NULL,
    validated_by INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sales_tickets_ext ON sales_tickets(department_id, external_ticket_id);
CREATE INDEX IF NOT EXISTS idx_inventory_stocks_lookup ON inventory_stocks(department_id, ingredient_id);
`;

export async function initializeDatabase() {
  console.log('Initializing database schema...');
  try {
    await query(DDL_SCHEMA);
    console.log('Database tables verified/created successfully.');

    // Seed data if database is empty
    const checkUsers = await query('SELECT count(*) FROM users');
    if (parseInt(checkUsers.rows[0].count, 10) === 0) {
      console.log('Seeding database with mock data...');

      // 1. Seed Users
      await query(`
        INSERT INTO users (username, password_hash, role, first_name, last_name) VALUES
        ('admin', 'admin123', 'admin', 'Med', 'Mair'),
        ('gerant', 'gerant123', 'manager', 'Ahmed', 'Ben Ali'),
        ('cuisinier', 'cuisinier123', 'cook', 'Youssef', 'Tunisi')
      `);

      // 2. Seed Departments
      await query(`
        INSERT INTO departments (id, name, stock_type, description) VALUES
        (1, 'Dépôt Central', 'isolated', 'Stockage principal des matières premières'),
        (2, 'Cuisine', 'isolated', 'Zone de préparation de la cuisine'),
        (3, 'Comptoir', 'isolated', 'Vente comptoir et service clients')
      `);
      await query("SELECT setval('departments_id_seq', (SELECT MAX(id) FROM departments))");

      // 3. Seed Ingredients
      await query(`
        INSERT INTO ingredients (id, name, unit, purchase_price_per_unit, alert_threshold, purchase_unit, purchase_unit_price, conversion_factor) VALUES
        (1, 'Farine de Blé', 'kg', 1.80, 15.0000, 'sac', 36.00, 20.0000),
        (2, 'Mozzarella Râpée', 'kg', 18.00, 8.0000, 'carton', 180.00, 10.0000),
        (3, 'Sauce Tomate', 'kg', 4.50, 6.0000, 'bidon', 22.50, 5.0000),
        (4, 'Steak de Bœuf', 'pcs', 3.50, 40.0000, 'carton', 175.00, 50.0000),
        (5, 'Pain Burger', 'pcs', 0.80, 45.0000, 'paquet', 19.20, 24.0000),
        (6, 'Fromage Cheddar', 'kg', 24.00, 4.0000, 'bloc', 120.00, 5.0000),
        (7, 'Poulet Émincé', 'kg', 14.00, 8.0000, 'sac', 70.00, 5.0000),
        (8, 'Nutella', 'g', 0.0250, 1000.0000, 'pot', 25.00, 1000.0000),
        (9, 'Frites Surgelées', 'kg', 6.00, 20.0000, 'carton', 60.00, 10.0000),
        (10, 'Huile de Friture', 'L', 5.50, 12.0000, 'bidon', 110.00, 20.0000),
        (11, 'Soda Cannette', 'pcs', 1.20, 50.0000, 'plateau', 28.80, 24.0000),
        (12, 'Eau Minérale 0.5L', 'pcs', 0.60, 6.0000, 'fardeau', 7.20, 12.0000),
        (13, 'Pepperoni Bœuf', 'kg', 28.00, 3.0000, 'barquette', 56.00, 2.0000)
      `);
      await query("SELECT setval('ingredients_id_seq', (SELECT MAX(id) FROM ingredients))");

      // 4. Seed Inventory Stocks
      await query(`
        INSERT INTO inventory_stocks (department_id, ingredient_id, quantity) VALUES
        -- Dépôt Central starting stock
        (1, 1, 300.0000),  -- Farine
        (1, 2, 80.0000),   -- Mozzarella
        (1, 3, 60.0000),   -- Sauce Tomate
        (1, 4, 200.0000),  -- Steaks
        (1, 5, 150.0000),  -- Pains
        (1, 6, 30.0000),   -- Cheddar
        (1, 7, 50.0000),   -- Poulet
        (1, 8, 15000.0000),// Nutella
        (1, 9, 120.0000),  -- Frites
        (1, 10, 80.0000),  -- Huile
        (1, 11, 240.0000), -- Soda
        (1, 12, 200.0000), -- Eau
        (1, 13, 20.0000),  -- Pepperoni

        -- Cuisine stocks (Merged Cuisine Centrale & Cuisine Pizzas)
        (2, 4, 30.0000),   -- Steaks
        (2, 5, 30.0000),   -- Pains
        (2, 6, 5.0000),    -- Cheddar
        (2, 9, 10.0000),   -- Frites
        (2, 10, 10.0000),  -- Huile
        (2, 1, 40.0000),   -- Farine
        (2, 2, 10.0000),   -- Mozzarella
        (2, 3, 10.0000),   -- Sauce Tomate
        (2, 13, 3.0000),   -- Pepperoni

        -- Comptoir stocks
        (3, 1, 10.0000),   -- Farine
        (3, 8, 3000.0000)  -- Nutella
      `);

      // 5. Seed Recipes
      await query(`
        INSERT INTO recipes (id, name, sale_price) VALUES
        (1, 'Pizza Margherita', 12.50),
        (2, 'Pizza Pepperoni', 16.50),
        (3, 'Burger Classic', 13.50),
        (4, 'Burger Double Cheddar', 18.50),
        (5, 'Pizza BBQ Poulet', 17.50),
        (6, 'Crêpe Nutella', 8.50),
        (7, 'Portion Frites', 4.50),
        (8, 'Soda Cola Frais', 2.50),
        (9, 'Eau Minérale', 1.50)
      `);
      await query("SELECT setval('recipes_id_seq', (SELECT MAX(id) FROM recipes))");

      // 6. Seed Recipe Ingredients (Fiches Techniques)
      await query(`
        INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity_needed) VALUES
        -- Pizza Margherita (1)
        (1, 1, 0.2000), -- Farine
        (1, 2, 0.1500), -- Mozzarella
        (1, 3, 0.1000), -- Sauce Tomate

        -- Pizza Pepperoni (2)
        (2, 1, 0.2000), -- Farine
        (2, 2, 0.1500), -- Mozzarella
        (2, 3, 0.1000), -- Sauce Tomate
        (2, 13, 0.0800),-- Pepperoni

        -- Burger Classic (3)
        (3, 5, 1.0000), -- Pain Burger
        (3, 4, 1.0000), -- Steak
        (3, 6, 0.0300), -- Cheddar

        -- Burger Double Cheddar (4)
        (4, 5, 1.0000), -- Pain Burger
        (4, 4, 2.0000), -- Steak x2
        (4, 6, 0.0600), -- Cheddar x2

        -- Pizza BBQ Poulet (5)
        (5, 1, 0.2000), -- Farine
        (5, 2, 0.1500), -- Mozzarella
        (5, 3, 0.1000), -- Sauce Tomate
        (5, 7, 0.1000), -- Poulet

        -- Crêpe Nutella (6)
        (6, 1, 0.0800), -- Farine
        (6, 8, 50.0000),// Nutella

        -- Portion Frites (7)
        (7, 9, 0.2500), -- Frites
        (7, 10, 0.0500),// Huile

        -- Soda Cola Frais (8)
        (8, 11, 1.0000),// Soda can

        -- Eau Minérale (9)
        (9, 12, 1.0000) // Eau
      `);

      console.log('Database seeded successfully.');
    }
  } catch (error) {
    console.error('Error during database initialization:', error);
  }
}
