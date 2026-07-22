-- =====================================================
-- mePOS STOCK — Multi-Tenant Migration Rollback
-- =====================================================
-- WARNING: This rollback will DROP all new tables and
-- remove tenant_id columns. Use with caution.
-- =====================================================

BEGIN;

-- =====================================================
-- Drop RLS policies
-- =====================================================
DROP POLICY IF EXISTS tenant_isolation_policy ON users;
DROP POLICY IF EXISTS tenant_isolation_policy ON departments;
DROP POLICY IF EXISTS tenant_isolation_policy ON ingredients;
DROP POLICY IF EXISTS tenant_isolation_policy ON inventory_stocks;
DROP POLICY IF EXISTS tenant_isolation_policy ON recipes;
DROP POLICY IF EXISTS tenant_isolation_policy ON recipe_ingredients;
DROP POLICY IF EXISTS tenant_isolation_policy ON sales_tickets;
DROP POLICY IF EXISTS tenant_isolation_policy ON sales_ticket_items;
DROP POLICY IF EXISTS tenant_isolation_policy ON stock_movements;
DROP POLICY IF EXISTS tenant_isolation_policy ON ingredient_losses;
DROP POLICY IF EXISTS tenant_isolation_policy ON transfer_requests;
DROP POLICY IF EXISTS tenant_isolation_policy ON agents;
DROP POLICY IF EXISTS tenant_isolation_policy ON tenant_settings;
DROP POLICY IF EXISTS tenant_isolation_policy ON audit_logs;

-- Disable RLS
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE departments DISABLE ROW LEVEL SECURITY;
ALTER TABLE ingredients DISABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_stocks DISABLE ROW LEVEL SECURITY;
ALTER TABLE recipes DISABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_ingredients DISABLE ROW LEVEL SECURITY;
ALTER TABLE sales_tickets DISABLE ROW LEVEL SECURITY;
ALTER TABLE sales_ticket_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements DISABLE ROW LEVEL SECURITY;
ALTER TABLE ingredient_losses DISABLE ROW LEVEL SECURITY;
ALTER TABLE transfer_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE agents DISABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs DISABLE ROW LEVEL SECURITY;

-- =====================================================
-- Drop tenant-scoped indexes
-- =====================================================
DROP INDEX IF EXISTS idx_users_tenant_username;
DROP INDEX IF EXISTS idx_departments_tenant_name;
DROP INDEX IF EXISTS idx_ingredients_tenant_name;
DROP INDEX IF EXISTS idx_recipes_tenant_name;
DROP INDEX IF EXISTS idx_stocks_tenant_lookup;
DROP INDEX IF EXISTS idx_recipe_ings_tenant_lookup;
DROP INDEX IF EXISTS idx_sales_tickets_tenant_ext;
DROP INDEX IF EXISTS idx_users_tenant;
DROP INDEX IF EXISTS idx_departments_tenant;
DROP INDEX IF EXISTS idx_ingredients_tenant;
DROP INDEX IF EXISTS idx_inventory_stocks_tenant;
DROP INDEX IF EXISTS idx_recipes_tenant;
DROP INDEX IF EXISTS idx_recipe_ingredients_tenant;
DROP INDEX IF EXISTS idx_sales_tickets_tenant;
DROP INDEX IF EXISTS idx_stock_movements_tenant;
DROP INDEX IF EXISTS idx_ingredient_losses_tenant;
DROP INDEX IF EXISTS idx_transfer_requests_tenant;
DROP INDEX IF EXISTS idx_agents_tenant;
DROP INDEX IF EXISTS idx_agent_heartbeats_agent;
DROP INDEX IF EXISTS idx_agent_heartbeats_created;
DROP INDEX IF EXISTS idx_tenant_settings_tenant;
DROP INDEX IF EXISTS idx_audit_logs_tenant;
DROP INDEX IF EXISTS idx_audit_logs_created;

-- =====================================================
-- Restore original global unique constraints
-- =====================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE UNIQUE INDEX IF NOT EXISTS idx_departments_name ON departments(name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ingredients_name ON ingredients(name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_recipes_name ON recipes(name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_stocks_lookup ON inventory_stocks(department_id, ingredient_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_recipe_ings_lookup ON recipe_ingredients(recipe_id, ingredient_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_tickets_ext ON sales_tickets(department_id, external_ticket_id);

-- =====================================================
-- Remove tenant_id columns
-- =====================================================
ALTER TABLE transfer_requests DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE ingredient_losses DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE stock_movements DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE sales_tickets DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE recipe_ingredients DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE recipes DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE inventory_stocks DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE ingredients DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE departments DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE users DROP COLUMN IF EXISTS tenant_id;

-- =====================================================
-- Drop new tables
-- =====================================================
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS tenant_settings CASCADE;
DROP TABLE IF EXISTS agent_heartbeat_daily CASCADE;
DROP TABLE IF EXISTS agent_heartbeats CASCADE;
DROP TABLE IF EXISTS agents CASCADE;
DROP TABLE IF EXISTS platform_users CASCADE;
DROP TYPE IF EXISTS platform_role CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;

COMMIT;
