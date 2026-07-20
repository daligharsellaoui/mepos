import { query, getClient } from './database';
import { hashPassword } from './services/auth.service';

export const DDL_SCHEMA = `
-- ============================================================
-- mePOS STOCK — Multi-Tenant Schema (Phase 2)
-- ============================================================

-- Enum Types if they don't exist
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('admin', 'manager', 'cook', 'platform_admin');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE stock_movement_type AS ENUM ('purchase', 'transfer_in', 'transfer_out', 'sale_deduction', 'loss', 'reconciliation');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE tenant_status AS ENUM ('active', 'suspended', 'trial', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE agent_status AS ENUM ('online', 'offline', 'error', 'disabled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================================
-- NEW TABLES: Multi-Tenant Infrastructure
-- ============================================================

-- 0. Tenants (Root entity for multi-tenancy)
CREATE TABLE IF NOT EXISTS tenants (
    id SERIAL PRIMARY KEY,
    uuid UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    logo TEXT,
    email VARCHAR(255),
    phone VARCHAR(50),
    address TEXT,
    country VARCHAR(100),
    timezone VARCHAR(50) DEFAULT 'UTC',
    language VARCHAR(10) DEFAULT 'fr',
    currency VARCHAR(3) DEFAULT 'EUR',
    status tenant_status NOT NULL DEFAULT 'active',
    subscription_plan VARCHAR(50) DEFAULT 'starter',
    trial_ends_at TIMESTAMP WITH TIME ZONE,
    max_users INT DEFAULT 10,
    max_agents INT DEFAULT 5,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 0a. Platform Users (Super Admins - not tied to any tenant)
CREATE TABLE IF NOT EXISTS platform_users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    first_name VARCHAR(50),
    last_name VARCHAR(50),
    is_super_admin BOOLEAN DEFAULT TRUE,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 0b. Tenant Settings (Key-value store per tenant)
CREATE TABLE IF NOT EXISTS tenant_settings (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category VARCHAR(50) NOT NULL, -- 'restaurant', 'sync', 'notification', 'inventory', 'general'
    key VARCHAR(100) NOT NULL,
    value JSONB NOT NULL DEFAULT '{}',
    encrypted BOOLEAN DEFAULT FALSE, -- For sensitive values like API keys
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, category, key)
);

-- 0c. Agents (Sync agent instances per tenant)
CREATE TABLE IF NOT EXISTS agents (
    id SERIAL PRIMARY KEY,
    uuid UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    machine_name VARCHAR(255),
    machine_id VARCHAR(255),
    operating_system VARCHAR(50),
    version VARCHAR(20),
    connector_type VARCHAR(50) NOT NULL DEFAULT 'database', -- 'database', 'api'
    status agent_status NOT NULL DEFAULT 'offline',
    agent_secret_hash VARCHAR(255) NOT NULL, -- For agent authentication
    config JSONB NOT NULL DEFAULT '{}', -- Sync config (encryption handled at application layer)
    last_seen_at TIMESTAMP WITH TIME ZONE,
    last_sync_at TIMESTAMP WITH TIME ZONE,
    last_heartbeat_at TIMESTAMP WITH TIME ZONE,
    health_status VARCHAR(20) DEFAULT 'healthy', -- 'healthy', 'degraded', 'unhealthy'
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 0d. Agent Heartbeats (History of agent health reports)
CREATE TABLE IF NOT EXISTS agent_heartbeats (
    id SERIAL PRIMARY KEY,
    agent_id INT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    version VARCHAR(20),
    status VARCHAR(20) NOT NULL,
    health_status VARCHAR(20) DEFAULT 'healthy',
    last_sync_at TIMESTAMP WITH TIME ZONE,
    connector_status VARCHAR(20), -- 'connected', 'disconnected', 'error'
    sync_duration_ms INT,
    tickets_imported INT DEFAULT 0,
    errors_count INT DEFAULT 0,
    warnings TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 0e. Audit Logs (Track important actions)
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id INT,
    old_value JSONB,
    new_value JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- MODIFIED TABLES: Add tenant_id to all business tables
-- ============================================================

-- 1. Users (Now tenant-scoped)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    username VARCHAR(50) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL,
    first_name VARCHAR(50),
    last_name VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, username) -- Username unique per tenant
);

-- 2. Departments (Tenant-scoped)
CREATE TABLE IF NOT EXISTS departments (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    stock_type VARCHAR(20) NOT NULL CHECK (stock_type IN ('isolated', 'inherited')),
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, name) -- Name unique per tenant
);

-- 3. Ingredients (Tenant-scoped)
CREATE TABLE IF NOT EXISTS ingredients (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    unit VARCHAR(10) NOT NULL,
    purchase_price_per_unit DECIMAL(10, 4) NOT NULL,
    alert_threshold DECIMAL(12, 4) NOT NULL DEFAULT 0.0000,
    purchase_unit VARCHAR(50) DEFAULT 'paquet',
    purchase_unit_price DECIMAL(10, 2) DEFAULT 0.00,
    conversion_factor DECIMAL(12, 4) DEFAULT 1.0000,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, name) -- Name unique per tenant
);

-- 4. Inventory Stocks (Tenant-scoped via department/ingredient)
CREATE TABLE IF NOT EXISTS inventory_stocks (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    department_id INT REFERENCES departments(id) ON DELETE CASCADE,
    ingredient_id INT REFERENCES ingredients(id) ON DELETE CASCADE,
    quantity DECIMAL(12, 4) NOT NULL DEFAULT 0.0000,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, department_id, ingredient_id)
);

-- 5. Recipes (Tenant-scoped)
CREATE TABLE IF NOT EXISTS recipes (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    sale_price DECIMAL(10, 2) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, name) -- Name unique per tenant
);

-- 6. Recipe Ingredients (Tenant-scoped via recipe)
CREATE TABLE IF NOT EXISTS recipe_ingredients (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    recipe_id INT REFERENCES recipes(id) ON DELETE CASCADE,
    ingredient_id INT REFERENCES ingredients(id) ON DELETE CASCADE,
    quantity_needed DECIMAL(12, 4) NOT NULL,
    UNIQUE(tenant_id, recipe_id, ingredient_id)
);

-- 7. Sales Tickets (Tenant-scoped)
CREATE TABLE IF NOT EXISTS sales_tickets (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    external_ticket_id VARCHAR(100) NOT NULL,
    department_id INT REFERENCES departments(id) ON DELETE SET NULL,
    ticket_date TIMESTAMP WITH TIME ZONE NOT NULL,
    total_amount DECIMAL(10, 2) NOT NULL,
    sync_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    UNIQUE(tenant_id, department_id, external_ticket_id)
);

-- 8. Sales Ticket Items (Tenant-scoped via parent ticket)
CREATE TABLE IF NOT EXISTS sales_ticket_items (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    sales_ticket_id INT REFERENCES sales_tickets(id) ON DELETE CASCADE,
    recipe_id INT REFERENCES recipes(id),
    quantity DECIMAL(10, 2) NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL
);

-- 9. Stock Movements (Tenant-scoped)
CREATE TABLE IF NOT EXISTS stock_movements (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    department_id INT REFERENCES departments(id) ON DELETE SET NULL,
    ingredient_id INT REFERENCES ingredients(id) ON DELETE SET NULL,
    quantity DECIMAL(12, 4) NOT NULL,
    type stock_movement_type NOT NULL,
    reference_id VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 10. Ingredient Losses (Tenant-scoped)
CREATE TABLE IF NOT EXISTS ingredient_losses (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    department_id INT REFERENCES departments(id) ON DELETE SET NULL,
    ingredient_id INT REFERENCES ingredients(id) ON DELETE SET NULL,
    quantity DECIMAL(12, 4) NOT NULL,
    loss_reason VARCHAR(100),
    cost_loss DECIMAL(10, 2) NOT NULL,
    opportunity_loss DECIMAL(10, 2) NOT NULL,
    reported_by INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 11. Transfer Requests (Two-Step Recharge Workflow, Tenant-scoped)
CREATE TABLE IF NOT EXISTS transfer_requests (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    source_department_id INT REFERENCES departments(id) ON DELETE SET NULL,
    destination_department_id INT REFERENCES departments(id) ON DELETE SET NULL,
    ingredient_id INT REFERENCES ingredients(id) ON DELETE SET NULL,
    quantity DECIMAL(12, 4) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
    requested_by INT REFERENCES users(id) ON DELETE SET NULL,
    validated_by INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- Indexes (Query Performance - Tenant-Scoped)
-- ============================================================

-- Tenant isolation indexes (critical for RLS and query performance)
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_departments_tenant ON departments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ingredients_tenant ON ingredients(tenant_id);
CREATE INDEX IF NOT EXISTS idx_recipes_tenant ON recipes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_stocks_tenant ON inventory_stocks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_tenant ON recipe_ingredients(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sales_tickets_tenant ON sales_tickets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sales_ticket_items_tenant ON sales_ticket_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_tenant ON stock_movements(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ingredient_losses_tenant ON ingredient_losses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_transfer_requests_tenant ON transfer_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_agents_tenant ON agents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_agent_heartbeats_tenant ON agent_heartbeats(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_settings_tenant ON tenant_settings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs(tenant_id);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_sales_tickets_ext ON sales_tickets(tenant_id, department_id, external_ticket_id);
CREATE INDEX IF NOT EXISTS idx_inventory_stocks_lookup ON inventory_stocks(tenant_id, department_id, ingredient_id);
CREATE INDEX IF NOT EXISTS idx_sales_tickets_date ON sales_tickets(tenant_id, ticket_date);
CREATE INDEX IF NOT EXISTS idx_stock_movements_lookup ON stock_movements(tenant_id, department_id, ingredient_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_type_date ON stock_movements(tenant_id, department_id, type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ingredient_losses_date ON ingredient_losses(tenant_id, department_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transfer_requests_status ON transfer_requests(tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_ticket_items_ticket ON sales_ticket_items(tenant_id, sales_ticket_id);
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_agent_heartbeats_agent ON agent_heartbeats(tenant_id, agent_id, created_at DESC);

-- Tenant settings lookup
CREATE INDEX IF NOT EXISTS idx_tenant_settings_lookup ON tenant_settings(tenant_id, category, key);

-- Audit logs for compliance
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(tenant_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(tenant_id, entity_type, entity_id);
`;

export async function initializeDatabase() {
  console.log('Initializing database schema...');
  try {
    await query(DDL_SCHEMA);
    console.log('Database tables verified/created successfully.');

    // Detect fresh install vs existing database
    const checkTenants = await query('SELECT count(*) FROM tenants');
    const tenantCount = parseInt(checkTenants.rows[0].count, 10);
    
    if (tenantCount === 0) {
      console.log('Fresh install detected. Creating default tenant...');
      
      // Create default tenant for single-tenant backward compatibility
      await query(`
        INSERT INTO tenants (id, name, slug, email, country, timezone, language, currency, status, subscription_plan)
        VALUES (1, 'Restaurant Demo', 'restaurant-demo', 'admin@restaurant-demo.com', 'Tunisia', 'Africa/Tunis', 'fr', 'TND', 'active', 'starter')
      `);
      
      // Create platform admin user (not tenant-scoped)
      const platformAdminHash = await hashPassword('platform123');
      await query(`
        INSERT INTO platform_users (username, password_hash, email, first_name, last_name, is_super_admin)
        VALUES ('superadmin', $1, 'superadmin@mepos.com', 'Platform', 'Admin', TRUE)
      `, [platformAdminHash]);
      
      console.log('Default tenant and platform admin created.');
    }

    // Seed data if database is empty (or if users table has no data)
    const checkUsers = await query('SELECT count(*) FROM users');
    if (parseInt(checkUsers.rows[0].count, 10) === 0) {
      console.log('Seeding database with mock data for tenant_id=1...');

      // Use transaction for atomic seed operation
      const { client, release } = await getClient();
      try {
        await client.query('BEGIN');

        // 1. Seed Users (hash passwords) - All assigned to tenant_id=1
        const adminHash = await hashPassword('admin123');
        const gerantHash = await hashPassword('gerant123');
        const cuisinierHash = await hashPassword('cuisinier123');

        await client.query(`
          INSERT INTO users (tenant_id, username, password_hash, role, first_name, last_name) VALUES
          (1, 'admin', $1, 'admin', 'Med', 'Mair'),
          (1, 'gerant', $2, 'manager', 'Ahmed', 'Ben Ali'),
          (1, 'cuisinier', $3, 'cook', 'Youssef', 'Tunisi')
        `, [adminHash, gerantHash, cuisinierHash]);

        // 2. Seed Departments
        await client.query(`
          INSERT INTO departments (id, tenant_id, name, stock_type, description) VALUES
          (1, 1, 'Dépôt Central', 'isolated', 'Stockage principal des matières premières'),
          (2, 1, 'Cuisine', 'isolated', 'Zone de préparation de la cuisine'),
          (3, 1, 'Comptoir', 'isolated', 'Vente comptoir et service clients')
        `);
        await client.query("SELECT setval('departments_id_seq', (SELECT MAX(id) FROM departments))");

        // 3. Seed Ingredients
        await client.query(`
          INSERT INTO ingredients (id, tenant_id, name, unit, purchase_price_per_unit, alert_threshold, purchase_unit, purchase_unit_price, conversion_factor) VALUES
          (1, 1, 'Farine de Blé', 'kg', 1.80, 15.0000, 'sac', 36.00, 20.0000),
          (2, 1, 'Mozzarella Râpée', 'kg', 18.00, 8.0000, 'carton', 180.00, 10.0000),
          (3, 1, 'Sauce Tomate', 'kg', 4.50, 6.0000, 'bidon', 22.50, 5.0000),
          (4, 1, 'Steak de Bœuf', 'pcs', 3.50, 40.0000, 'carton', 175.00, 50.0000),
          (5, 1, 'Pain Burger', 'pcs', 0.80, 45.0000, 'paquet', 19.20, 24.0000),
          (6, 1, 'Fromage Cheddar', 'kg', 24.00, 4.0000, 'bloc', 120.00, 5.0000),
          (7, 1, 'Poulet Émincé', 'kg', 14.00, 8.0000, 'sac', 70.00, 5.0000),
          (8, 1, 'Nutella', 'g', 0.0250, 1000.0000, 'pot', 25.00, 1000.0000),
          (9, 1, 'Frites Surgelées', 'kg', 6.00, 20.0000, 'carton', 60.00, 10.0000),
          (10, 1, 'Huile de Friture', 'L', 5.50, 12.0000, 'bidon', 110.00, 20.0000),
          (11, 1, 'Soda Cannette', 'pcs', 1.20, 50.0000, 'plateau', 28.80, 24.0000),
          (12, 1, 'Eau Minérale 0.5L', 'pcs', 0.60, 6.0000, 'fardeau', 7.20, 12.0000),
          (13, 1, 'Pepperoni Bœuf', 'kg', 28.00, 3.0000, 'barquette', 56.00, 2.0000)
        `);
        await client.query("SELECT setval('ingredients_id_seq', (SELECT MAX(id) FROM ingredients))");

        // 4. Seed Inventory Stocks
        await client.query(`
          INSERT INTO inventory_stocks (tenant_id, department_id, ingredient_id, quantity) VALUES
          -- Dépôt Central starting stock
          (1, 1, 1, 300.0000),  -- Farine
          (1, 1, 2, 80.0000),   -- Mozzarella
          (1, 1, 3, 60.0000),   -- Sauce Tomate
          (1, 1, 4, 200.0000),  -- Steaks
          (1, 1, 5, 150.0000),  -- Pains
          (1, 1, 6, 30.0000),   -- Cheddar
          (1, 1, 7, 50.0000),   -- Poulet
          (1, 1, 8, 15000.0000),-- Nutella
          (1, 1, 9, 120.0000),  -- Frites
          (1, 1, 10, 80.0000),  -- Huile
          (1, 1, 11, 240.0000), -- Soda
          (1, 1, 12, 200.0000), -- Eau
          (1, 1, 13, 20.0000),  -- Pepperoni

          -- Cuisine stocks
          (1, 2, 4, 30.0000),   -- Steaks
          (1, 2, 5, 30.0000),   -- Pains
          (1, 2, 6, 5.0000),    -- Cheddar
          (1, 2, 9, 10.0000),   -- Frites
          (1, 2, 10, 10.0000),  -- Huile
          (1, 2, 1, 40.0000),   -- Farine
          (1, 2, 2, 10.0000),   -- Mozzarella
          (1, 2, 3, 10.0000),   -- Sauce Tomate
          (1, 2, 13, 3.0000),   -- Pepperoni

          -- Comptoir stocks
          (1, 3, 1, 10.0000),   -- Farine
          (1, 3, 8, 3000.0000)  -- Nutella
        `);

        // 5. Seed Recipes
        await client.query(`
          INSERT INTO recipes (id, tenant_id, name, sale_price) VALUES
          (1, 1, 'Pizza Margherita', 12.50),
          (2, 1, 'Pizza Pepperoni', 16.50),
          (3, 1, 'Burger Classic', 13.50),
          (4, 1, 'Burger Double Cheddar', 18.50),
          (5, 1, 'Pizza BBQ Poulet', 17.50),
          (6, 1, 'Crêpe Nutella', 8.50),
          (7, 1, 'Portion Frites', 4.50),
          (8, 1, 'Soda Cola Frais', 2.50),
          (9, 1, 'Eau Minérale', 1.50)
        `);
        await client.query("SELECT setval('recipes_id_seq', (SELECT MAX(id) FROM recipes))");

        // 6. Seed Recipe Ingredients (Fiches Techniques)
        await client.query(`
          INSERT INTO recipe_ingredients (tenant_id, recipe_id, ingredient_id, quantity_needed) VALUES
          -- Pizza Margherita (1)
          (1, 1, 1, 0.2000), -- Farine
          (1, 1, 2, 0.1500), -- Mozzarella
          (1, 1, 3, 0.1000), -- Sauce Tomate

          -- Pizza Pepperoni (2)
          (1, 2, 1, 0.2000), -- Farine
          (1, 2, 2, 0.1500), -- Mozzarella
          (1, 2, 3, 0.1000), -- Sauce Tomate
          (1, 2, 13, 0.0800),-- Pepperoni

          -- Burger Classic (3)
          (1, 3, 5, 1.0000), -- Pain Burger
          (1, 3, 4, 1.0000), -- Steak
          (1, 3, 6, 0.0300), -- Cheddar

          -- Burger Double Cheddar (4)
          (1, 4, 5, 1.0000), -- Pain Burger
          (1, 4, 4, 2.0000), -- Steak x2
          (1, 4, 6, 0.0600), -- Cheddar x2

          -- Pizza BBQ Poulet (5)
          (1, 5, 1, 0.2000), -- Farine
          (1, 5, 2, 0.1500), -- Mozzarella
          (1, 5, 3, 0.1000), -- Sauce Tomate
          (1, 5, 7, 0.1000), -- Poulet

          -- Crêpe Nutella (6)
          (1, 6, 1, 0.0800), -- Farine
          (1, 6, 8, 50.0000),-- Nutella

          -- Portion Frites (7)
          (1, 7, 9, 0.2500), -- Frites
          (1, 7, 10, 0.0500),-- Huile

          -- Soda Cola Frais (8)
          (1, 8, 11, 1.0000),-- Soda can

          -- Eau Minérale (9)
          (1, 9, 12, 1.0000) -- Eau
        `);

        // 7. Seed Tenant Settings
        await client.query(`
          INSERT INTO tenant_settings (tenant_id, category, key, value) VALUES
          (1, 'restaurant', 'name', '"Restaurant Demo"'),
          (1, 'restaurant', 'currency', '"TND"'),
          (1, 'restaurant', 'timezone', '"Africa/Tunis"'),
          (1, 'general', 'language', '"fr"'),
          (1, 'sync', 'polling_interval', '12000'),
          (1, 'inventory', 'enable_losses', 'true'),
          (1, 'inventory', 'enable_transfers', 'true')
        `);

        await client.query('COMMIT');
        // Reset sequences to prevent ID conflicts on future inserts
        await client.query("SELECT setval('users_id_seq', (SELECT COALESCE(MAX(id), 1) FROM users))");
        await client.query("SELECT setval('tenants_id_seq', (SELECT COALESCE(MAX(id), 1) FROM tenants))");
        await client.query("SELECT setval('platform_users_id_seq', (SELECT COALESCE(MAX(id), 1) FROM platform_users))");
        await client.query("SELECT setval('tenant_settings_id_seq', (SELECT COALESCE(MAX(id), 1) FROM tenant_settings))");

        await client.query('COMMIT');
        console.log('Database seeded successfully for tenant_id=1.');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        release();
      }
    }
  } catch (error) {
    console.error('Error during database initialization:', error);
  }
}
