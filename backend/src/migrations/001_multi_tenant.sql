-- =====================================================
-- mePOS STOCK — Multi-Tenant Migration (Phase 2)
-- =====================================================
-- This migration adds tenant isolation to all business tables.
-- It is ADDITIVE-ONLY: no data is deleted, no columns are dropped.
-- All existing data is assigned to a default tenant (id=1).
--
-- Run: psql -U mepos_user -d mepos_stock -f 001_multi_tenant.sql
-- Rollback: See 001_multi_tenant_rollback.sql
-- =====================================================

BEGIN;

-- =====================================================
-- PHASE 2a: Create new tables
-- =====================================================

-- 1. Tenants
CREATE TABLE IF NOT EXISTS tenants (
  id SERIAL PRIMARY KEY,
  uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  logo_url TEXT,
  email VARCHAR(255),
  phone VARCHAR(50),
  address TEXT,
  country VARCHAR(100),
  timezone VARCHAR(50) DEFAULT 'UTC',
  language VARCHAR(10) DEFAULT 'fr',
  currency VARCHAR(10) DEFAULT 'TND',
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'trial', 'cancelled')),
  subscription_plan VARCHAR(50) DEFAULT 'starter'
    CHECK (subscription_plan IN ('starter', 'professional', 'enterprise')),
  trial_ends_at TIMESTAMP WITH TIME ZONE,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Platform Users (Super Admin, Support, Billing)
DO $$ BEGIN
    CREATE TYPE platform_role AS ENUM ('super_admin', 'support', 'billing');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS platform_users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  role platform_role NOT NULL DEFAULT 'support',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP WITH TIME ZONE
);

-- 3. Agents (POS Sync Agents)
CREATE TABLE IF NOT EXISTS agents (
  id SERIAL PRIMARY KEY,
  uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_secret_hash VARCHAR(255) NOT NULL,
  name VARCHAR(100) NOT NULL,
  machine_name VARCHAR(255),
  machine_id VARCHAR(255),
  operating_system VARCHAR(100),
  version VARCHAR(50),
  connector_type VARCHAR(50) NOT NULL DEFAULT 'database'
    CHECK (connector_type IN ('database', 'api', 'csv', 'webhook')),
  status VARCHAR(20) DEFAULT 'inactive'
    CHECK (status IN ('active', 'inactive', 'disabled', 'error')),
  last_seen TIMESTAMP WITH TIME ZONE,
  last_sync TIMESTAMP WITH TIME ZONE,
  health VARCHAR(20) DEFAULT 'unknown'
    CHECK (health IN ('healthy', 'degraded', 'unhealthy', 'unknown')),
  config JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, name)
);

-- 4. Agent Heartbeats (with retention policy)
CREATE TABLE IF NOT EXISTS agent_heartbeats (
  id SERIAL PRIMARY KEY,
  agent_id INT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  version VARCHAR(50),
  status VARCHAR(20),
  health VARCHAR(20),
  last_sync TIMESTAMP WITH TIME ZONE,
  connector_status VARCHAR(20),
  errors JSONB DEFAULT '[]',
  warnings JSONB DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Agent Heartbeat Daily Aggregates (for retention)
CREATE TABLE IF NOT EXISTS agent_heartbeat_daily (
  id SERIAL PRIMARY KEY,
  agent_id INT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  avg_latency_ms FLOAT,
  max_latency_ms FLOAT,
  total_heartbeats INT DEFAULT 0,
  failed_heartbeats INT DEFAULT 0,
  avg_tickets_synced FLOAT,
  avg_sync_duration_ms FLOAT,
  UNIQUE(agent_id, date)
);

-- 6. Tenant Settings
CREATE TABLE IF NOT EXISTS tenant_settings (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category VARCHAR(50) NOT NULL
    CHECK (category IN ('branding', 'notifications', 'sync', 'inventory', 'general')),
  key VARCHAR(100) NOT NULL,
  value JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, category, key)
);

-- 7. Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INT REFERENCES tenants(id) ON DELETE SET NULL,
  user_id INT,
  platform_user_id INT,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id INT,
  old_value JSONB,
  new_value JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- PHASE 2b: Add tenant_id columns (nullable initially)
-- =====================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id INT REFERENCES tenants(id);
ALTER TABLE departments ADD COLUMN IF NOT EXISTS tenant_id INT REFERENCES tenants(id);
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS tenant_id INT REFERENCES tenants(id);
ALTER TABLE inventory_stocks ADD COLUMN IF NOT EXISTS tenant_id INT REFERENCES tenants(id);
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS tenant_id INT REFERENCES tenants(id);
ALTER TABLE recipe_ingredients ADD COLUMN IF NOT EXISTS tenant_id INT REFERENCES tenants(id);
ALTER TABLE sales_tickets ADD COLUMN IF NOT EXISTS tenant_id INT REFERENCES tenants(id);
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS tenant_id INT REFERENCES tenants(id);
ALTER TABLE ingredient_losses ADD COLUMN IF NOT EXISTS tenant_id INT REFERENCES tenants(id);
ALTER TABLE transfer_requests ADD COLUMN IF NOT EXISTS tenant_id INT REFERENCES tenants(id);
-- NOTE: sales_ticket_items does NOT get tenant_id (inherits via parent join)

-- =====================================================
-- PHASE 2c: Create default tenant + migrate existing data
-- =====================================================

-- Create default tenant (if not exists)
INSERT INTO tenants (id, name, slug, status, subscription_plan)
VALUES (1, 'Default Restaurant', 'default', 'active', 'enterprise')
ON CONFLICT (id) DO NOTHING;

-- Set sequence for tenants
SELECT setval('tenants_id_seq', (SELECT COALESCE(MAX(id), 1) FROM tenants));

-- Migrate all existing data to default tenant (tenant_id = 1)
UPDATE users SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE departments SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE ingredients SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE inventory_stocks SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE recipes SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE recipe_ingredients SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE sales_tickets SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE stock_movements SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE ingredient_losses SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE transfer_requests SET tenant_id = 1 WHERE tenant_id IS NULL;

-- =====================================================
-- PHASE 2d: Set NOT NULL on tenant_id columns
-- =====================================================

ALTER TABLE users ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE departments ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE ingredients ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE inventory_stocks ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE recipes ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE recipe_ingredients ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE sales_tickets ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE stock_movements ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE ingredient_losses ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE transfer_requests ALTER COLUMN tenant_id SET NOT NULL;

-- =====================================================
-- PHASE 2e: Drop old global unique constraints,
--           create tenant-scoped unique indexes
-- =====================================================

-- Drop old global unique constraints
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_key;
ALTER TABLE departments DROP CONSTRAINT IF EXISTS departments_name_key;
ALTER TABLE ingredients DROP CONSTRAINT IF EXISTS ingredients_name_key;
ALTER TABLE recipes DROP CONSTRAINT IF EXISTS recipes_name_key;
ALTER TABLE inventory_stocks DROP CONSTRAINT IF EXISTS inventory_stocks_department_id_ingredient_id_key;
ALTER TABLE recipe_ingredients DROP CONSTRAINT IF EXISTS recipe_ingredients_recipe_id_ingredient_id_key;
ALTER TABLE sales_tickets DROP CONSTRAINT IF EXISTS sales_tickets_department_id_external_ticket_id_key;

-- Create tenant-scoped unique indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_tenant_username
  ON users(tenant_id, username);

CREATE UNIQUE INDEX IF NOT EXISTS idx_departments_tenant_name
  ON departments(tenant_id, name);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ingredients_tenant_name
  ON ingredients(tenant_id, name);

CREATE UNIQUE INDEX IF NOT EXISTS idx_recipes_tenant_name
  ON recipes(tenant_id, name);

CREATE UNIQUE INDEX IF NOT EXISTS idx_stocks_tenant_lookup
  ON inventory_stocks(tenant_id, department_id, ingredient_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_recipe_ings_tenant_lookup
  ON recipe_ingredients(tenant_id, recipe_id, ingredient_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_tickets_tenant_ext
  ON sales_tickets(tenant_id, department_id, external_ticket_id);

-- Add performance indexes for tenant-scoped queries
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_departments_tenant ON departments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ingredients_tenant ON ingredients(tenant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_stocks_tenant ON inventory_stocks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_recipes_tenant ON recipes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_tenant ON recipe_ingredients(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sales_tickets_tenant ON sales_tickets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_tenant ON stock_movements(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ingredient_losses_tenant ON ingredient_losses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_transfer_requests_tenant ON transfer_requests(tenant_id);

-- Indexes for new tables
CREATE INDEX IF NOT EXISTS idx_agents_tenant ON agents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_agent_heartbeats_agent ON agent_heartbeats(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_heartbeats_created ON agent_heartbeats(created_at);
CREATE INDEX IF NOT EXISTS idx_tenant_settings_tenant ON tenant_settings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);

-- =====================================================
-- PHASE 2f: Row-Level Security (RLS) policies
-- =====================================================

-- Enable RLS on all business tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_stocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_ticket_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredient_losses ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfer_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (using session variable set by middleware)
-- These policies check the app.current_tenant session variable

-- Users
CREATE POLICY tenant_isolation_policy ON users
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant', true)::int);

-- Departments
CREATE POLICY tenant_isolation_policy ON departments
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant', true)::int);

-- Ingredients
CREATE POLICY tenant_isolation_policy ON ingredients
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant', true)::int);

-- Inventory Stocks
CREATE POLICY tenant_isolation_policy ON inventory_stocks
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant', true)::int);

-- Recipes
CREATE POLICY tenant_isolation_policy ON recipes
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant', true)::int);

-- Recipe Ingredients
CREATE POLICY tenant_isolation_policy ON recipe_ingredients
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant', true)::int);

-- Sales Tickets
CREATE POLICY tenant_isolation_policy ON sales_tickets
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant', true)::int);

-- Sales Ticket Items (via parent join)
CREATE POLICY tenant_isolation_policy ON sales_ticket_items
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM sales_tickets st
      WHERE st.id = sales_ticket_items.sales_ticket_id
      AND st.tenant_id = current_setting('app.current_tenant', true)::int
    )
  );

-- Stock Movements
CREATE POLICY tenant_isolation_policy ON stock_movements
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant', true)::int);

-- Ingredient Losses
CREATE POLICY tenant_isolation_policy ON ingredient_losses
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant', true)::int);

-- Transfer Requests
CREATE POLICY tenant_isolation_policy ON transfer_requests
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant', true)::int);

-- Agents
CREATE POLICY tenant_isolation_policy ON agents
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant', true)::int);

-- Tenant Settings
CREATE POLICY tenant_isolation_policy ON tenant_settings
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant', true)::int);

-- Audit Logs
CREATE POLICY tenant_isolation_policy ON audit_logs
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant', true)::int);

COMMIT;
