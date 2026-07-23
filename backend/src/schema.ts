import { query, getClient } from './database';
import { hashPassword } from './services/auth.service';
import { seedData } from './seed';

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

DO $$ BEGIN
    CREATE TYPE supplier_status AS ENUM ('active', 'archived');
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

-- 1a. Audit Logs (Track important actions, created after users for FK)
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

-- 3. Suppliers (Tenant-scoped)
CREATE TABLE IF NOT EXISTS suppliers (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    company_name VARCHAR(255),
    reference VARCHAR(100),
    tax_number VARCHAR(100),
    registration_number VARCHAR(100),
    contact_person VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(50),
    mobile VARCHAR(50),
    website TEXT,
    address TEXT,
    city VARCHAR(100),
    postal_code VARCHAR(20),
    country VARCHAR(100),
    payment_terms VARCHAR(100),
    payment_method VARCHAR(100),
    currency VARCHAR(3) DEFAULT 'TND',
    delivery_delay INT DEFAULT 0,
    minimum_order_amount DECIMAL(12, 3) DEFAULT 0,
    notes TEXT,
    status supplier_status NOT NULL DEFAULT 'active',
    preferred BOOLEAN NOT NULL DEFAULT FALSE,
    rating INT DEFAULT 0 CHECK (rating >= 0 AND rating <= 5),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    archived_at TIMESTAMP WITH TIME ZONE
);

-- 4. Ingredients (Tenant-scoped)
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
    preferred_supplier_id INT REFERENCES suppliers(id) ON DELETE SET NULL,
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
-- MIGRATION: Add tenant_id to existing tables (if upgrading from single-tenant schema)
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id INT REFERENCES tenants(id);
ALTER TABLE departments ADD COLUMN IF NOT EXISTS tenant_id INT REFERENCES tenants(id);
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS tenant_id INT REFERENCES tenants(id);
ALTER TABLE inventory_stocks ADD COLUMN IF NOT EXISTS tenant_id INT REFERENCES tenants(id);
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS tenant_id INT REFERENCES tenants(id);
ALTER TABLE recipe_ingredients ADD COLUMN IF NOT EXISTS tenant_id INT REFERENCES tenants(id);
ALTER TABLE sales_tickets ADD COLUMN IF NOT EXISTS tenant_id INT REFERENCES tenants(id);
ALTER TABLE sales_ticket_items ADD COLUMN IF NOT EXISTS tenant_id INT REFERENCES tenants(id);
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS tenant_id INT REFERENCES tenants(id);
ALTER TABLE ingredient_losses ADD COLUMN IF NOT EXISTS tenant_id INT REFERENCES tenants(id);
ALTER TABLE transfer_requests ADD COLUMN IF NOT EXISTS tenant_id INT REFERENCES tenants(id);

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

-- ============================================================
-- NOTIFICATIONS TABLE
-- ============================================================

DO $$ BEGIN
    CREATE TYPE notification_type AS ENUM (
        'information', 'success', 'warning', 'error', 'critical',
        'system', 'synchronization', 'inventory', 'transfer',
        'purchase', 'recipe', 'loss', 'security', 'user', 'settings'
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE notification_priority AS ENUM ('low', 'medium', 'high', 'critical');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    type notification_type NOT NULL DEFAULT 'information',
    category VARCHAR(50) NOT NULL DEFAULT 'general',
    priority notification_priority NOT NULL DEFAULT 'medium',
    title VARCHAR(255) NOT NULL,
    message TEXT,
    icon VARCHAR(50),
    color VARCHAR(20),
    entity_type VARCHAR(50),
    entity_id INT,
    created_by INT REFERENCES users(id) ON DELETE SET NULL,
    assigned_to INT REFERENCES users(id) ON DELETE SET NULL,
    read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMP WITH TIME ZONE,
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    action_url TEXT,
    metadata JSONB DEFAULT '{}',
    dedup_key VARCHAR(255),
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notification_preferences (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category VARCHAR(50) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    muted BOOLEAN NOT NULL DEFAULT FALSE,
    critical_only BOOLEAN NOT NULL DEFAULT FALSE,
    desktop BOOLEAN NOT NULL DEFAULT TRUE,
    sound BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, user_id, category)
);

CREATE INDEX IF NOT EXISTS idx_notifications_tenant ON notifications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_assigned ON notifications(tenant_id, assigned_to);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(tenant_id, assigned_to, read);
CREATE INDEX IF NOT EXISTS idx_notifications_archived ON notifications(tenant_id, assigned_to, archived);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(tenant_id, type);
CREATE INDEX IF NOT EXISTS idx_notifications_category ON notifications(tenant_id, category);
CREATE INDEX IF NOT EXISTS idx_notifications_priority ON notifications(tenant_id, priority, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_entity ON notifications(tenant_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_notifications_dedup ON notifications(tenant_id, dedup_key) WHERE dedup_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_expires ON notifications(expires_at) WHERE expires_at IS NOT NULL;

-- ============================================================
-- NOTIFICATION READS TABLE (Per-User Read Tracking)
-- ============================================================

CREATE TABLE IF NOT EXISTS notification_reads (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notification_id INT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    read_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, user_id, notification_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_reads_user ON notification_reads(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_notification_reads_notif ON notification_reads(notification_id);

-- Supplier indexes
CREATE INDEX IF NOT EXISTS idx_suppliers_tenant_id ON suppliers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_status ON suppliers(status);
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);
CREATE INDEX IF NOT EXISTS idx_suppliers_email ON suppliers(email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_tenant_name ON suppliers(tenant_id, LOWER(name));
CREATE INDEX IF NOT EXISTS idx_ingredients_preferred_supplier ON ingredients(preferred_supplier_id);
CREATE INDEX IF NOT EXISTS idx_notification_prefs_user ON notification_preferences(tenant_id, user_id);

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(tenant_id, user_id);

-- ============================================================
-- PRODUCT MAPPINGS TABLE (POS Product Mapping)
-- ============================================================

CREATE TABLE IF NOT EXISTS product_mappings (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    connector_type VARCHAR(50) NOT NULL,
    external_product_id VARCHAR(100) NOT NULL,
    external_product_code VARCHAR(100),
    external_product_name VARCHAR(255),
    mepos_product_id INT REFERENCES recipes(id) ON DELETE SET NULL,
    mapping_status VARCHAR(20) DEFAULT 'unmapped',
    confidence DECIMAL(5,2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, connector_type, external_product_id)
);

CREATE INDEX IF NOT EXISTS idx_product_mappings_tenant ON product_mappings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_product_mappings_connector ON product_mappings(tenant_id, connector_type);
CREATE INDEX IF NOT EXISTS idx_product_mappings_status ON product_mappings(tenant_id, mapping_status);
CREATE INDEX IF NOT EXISTS idx_product_mappings_external ON product_mappings(tenant_id, external_product_id);
CREATE INDEX IF NOT EXISTS idx_product_mappings_recipe ON product_mappings(mepos_product_id);

-- ============================================================
-- PROCUREMENT MODULE (Phase 4)
-- ============================================================

DO $$ BEGIN
    CREATE TYPE purchase_order_status AS ENUM (
        'draft', 'pending_approval', 'approved', 'ordered',
        'partially_received', 'received', 'cancelled', 'closed'
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS purchase_orders (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    supplier_id INT REFERENCES suppliers(id) ON DELETE SET NULL,
    warehouse_id INT REFERENCES departments(id) ON DELETE SET NULL,
    reference_number VARCHAR(100),
    status purchase_order_status NOT NULL DEFAULT 'draft',
    order_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expected_delivery TIMESTAMP WITH TIME ZONE,
    currency VARCHAR(10) DEFAULT 'TND',
    notes TEXT,
    subtotal DECIMAL(14, 4) DEFAULT 0,
    discount_total DECIMAL(14, 4) DEFAULT 0,
    tax_total DECIMAL(14, 4) DEFAULT 0,
    total DECIMAL(14, 4) DEFAULT 0,
    created_by INT REFERENCES users(id) ON DELETE SET NULL,
    approved_by INT REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    purchase_order_id INT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    ingredient_id INT REFERENCES ingredients(id) ON DELETE SET NULL,
    line_number INT NOT NULL DEFAULT 1,
    ordered_quantity DECIMAL(12, 4) NOT NULL DEFAULT 0,
    received_quantity DECIMAL(12, 4) NOT NULL DEFAULT 0,
    rejected_quantity DECIMAL(12, 4) NOT NULL DEFAULT 0,
    damaged_quantity DECIMAL(12, 4) NOT NULL DEFAULT 0,
    purchase_unit VARCHAR(50),
    inventory_unit VARCHAR(10),
    conversion_ratio DECIMAL(12, 4) DEFAULT 1.0000,
    unit_price DECIMAL(12, 4) NOT NULL DEFAULT 0,
    discount_percent DECIMAL(5, 2) DEFAULT 0,
    discount_amount DECIMAL(12, 4) DEFAULT 0,
    tax_rate DECIMAL(5, 2) DEFAULT 0,
    tax_amount DECIMAL(12, 4) DEFAULT 0,
    line_total DECIMAL(14, 4) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS goods_receptions (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    purchase_order_id INT REFERENCES purchase_orders(id) ON DELETE SET NULL,
    warehouse_id INT REFERENCES departments(id) ON DELETE SET NULL,
    reception_number VARCHAR(100),
    reception_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    received_by INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS goods_reception_items (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    goods_reception_id INT NOT NULL REFERENCES goods_receptions(id) ON DELETE CASCADE,
    purchase_order_item_id INT REFERENCES purchase_order_items(id) ON DELETE SET NULL,
    ingredient_id INT REFERENCES ingredients(id) ON DELETE SET NULL,
    received_quantity DECIMAL(12, 4) NOT NULL DEFAULT 0,
    rejected_quantity DECIMAL(12, 4) NOT NULL DEFAULT 0,
    damaged_quantity DECIMAL(12, 4) NOT NULL DEFAULT 0,
    unit_price DECIMAL(12, 4),
    batch_number VARCHAR(100),
    expiration_date DATE,
    storage_location VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS supplier_invoices (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    supplier_id INT REFERENCES suppliers(id) ON DELETE SET NULL,
    purchase_order_id INT REFERENCES purchase_orders(id) ON DELETE SET NULL,
    goods_reception_id INT REFERENCES goods_receptions(id) ON DELETE SET NULL,
    invoice_number VARCHAR(100) NOT NULL,
    invoice_date DATE,
    due_date DATE,
    amount DECIMAL(14, 4) NOT NULL DEFAULT 0,
    tax_amount DECIMAL(14, 4) DEFAULT 0,
    total_amount DECIMAL(14, 4) NOT NULL DEFAULT 0,
    currency VARCHAR(10) DEFAULT 'TND',
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue', 'cancelled')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_tenant ON purchase_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders(tenant_id, supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_date ON purchase_orders(tenant_id, order_date DESC);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_reference ON purchase_orders(tenant_id, reference_number);
CREATE INDEX IF NOT EXISTS idx_po_items_po ON purchase_order_items(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_po_items_ingredient ON purchase_order_items(tenant_id, ingredient_id);
CREATE INDEX IF NOT EXISTS idx_goods_receptions_tenant ON goods_receptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_goods_receptions_po ON goods_receptions(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_goods_receptions_date ON goods_receptions(tenant_id, reception_date DESC);
CREATE INDEX IF NOT EXISTS idx_gr_items_reception ON goods_reception_items(goods_reception_id);
CREATE INDEX IF NOT EXISTS idx_gr_items_po_item ON goods_reception_items(purchase_order_item_id);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_tenant ON supplier_invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_supplier ON supplier_invoices(tenant_id, supplier_id);

-- ============================================================
-- BATCH MANAGEMENT (Phase 4)
-- ============================================================

DO $$ BEGIN
    CREATE TYPE batch_status AS ENUM (
        'active', 'partially_consumed', 'consumed',
        'expired', 'discarded', 'transferred', 'adjusted'
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS inventory_batches (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    batch_number VARCHAR(100) NOT NULL,
    ingredient_id INT NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    supplier_id INT REFERENCES suppliers(id) ON DELETE SET NULL,
    purchase_order_id INT REFERENCES purchase_orders(id) ON DELETE SET NULL,
    goods_reception_id INT REFERENCES goods_receptions(id) ON DELETE SET NULL,
    warehouse_id INT REFERENCES departments(id) ON DELETE SET NULL,
    initial_quantity DECIMAL(12, 4) NOT NULL DEFAULT 0,
    remaining_quantity DECIMAL(12, 4) NOT NULL DEFAULT 0,
    unit VARCHAR(10),
    unit_price DECIMAL(12, 4) NOT NULL DEFAULT 0,
    total_cost DECIMAL(14, 4) NOT NULL DEFAULT 0,
    manufacturing_date DATE,
    expiration_date DATE,
    storage_location VARCHAR(100),
    status batch_status NOT NULL DEFAULT 'active',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS batch_movements (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    batch_id INT NOT NULL REFERENCES inventory_batches(id) ON DELETE CASCADE,
    ingredient_id INT NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    quantity DECIMAL(12, 4) NOT NULL,
    movement_type VARCHAR(50) NOT NULL CHECK (movement_type IN (
        'reception', 'consumption', 'transfer_out', 'transfer_in',
        'split_out', 'split_in', 'adjustment', 'discard', 'expired'
    )),
    reference_type VARCHAR(50),
    reference_id INT,
    unit_price DECIMAL(12, 4),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_batches_tenant_number ON inventory_batches(tenant_id, batch_number);
CREATE INDEX IF NOT EXISTS idx_batches_tenant ON inventory_batches(tenant_id);
CREATE INDEX IF NOT EXISTS idx_batches_ingredient ON inventory_batches(tenant_id, ingredient_id);
CREATE INDEX IF NOT EXISTS idx_batches_warehouse ON inventory_batches(tenant_id, warehouse_id);
CREATE INDEX IF NOT EXISTS idx_batches_status ON inventory_batches(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_batches_expiry ON inventory_batches(expiration_date) WHERE expiration_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_batches_supplier ON inventory_batches(tenant_id, supplier_id);
CREATE INDEX IF NOT EXISTS idx_batch_movements_batch ON batch_movements(batch_id);
CREATE INDEX IF NOT EXISTS idx_batch_movements_ingredient ON batch_movements(tenant_id, ingredient_id);
CREATE INDEX IF NOT EXISTS idx_batch_movements_type ON batch_movements(tenant_id, movement_type);
CREATE INDEX IF NOT EXISTS idx_batch_movements_created ON batch_movements(tenant_id, created_at DESC);

-- ============================================================
-- INVENTORY COUNTS (Phase 4)
-- ============================================================

DO $$ BEGIN
    CREATE TYPE inventory_count_status AS ENUM (
        'draft', 'in_progress', 'completed', 'approved', 'cancelled'
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS inventory_counts (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    warehouse_id INT NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    count_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status inventory_count_status NOT NULL DEFAULT 'draft',
    created_by INT REFERENCES users(id) ON DELETE SET NULL,
    counted_by INT REFERENCES users(id) ON DELETE SET NULL,
    approved_by INT REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inventory_count_items (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    count_session_id INT NOT NULL REFERENCES inventory_counts(id) ON DELETE CASCADE,
    ingredient_id INT NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    expected_quantity DECIMAL(12, 4) NOT NULL DEFAULT 0,
    actual_quantity DECIMAL(12, 4) NOT NULL DEFAULT 0,
    difference DECIMAL(12, 4) GENERATED ALWAYS AS (actual_quantity - expected_quantity) STORED,
    reason VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inventory_adjustments (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    count_session_id INT NOT NULL REFERENCES inventory_counts(id) ON DELETE CASCADE,
    count_item_id INT REFERENCES inventory_count_items(id) ON DELETE SET NULL,
    ingredient_id INT NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    department_id INT REFERENCES departments(id) ON DELETE SET NULL,
    previous_quantity DECIMAL(12, 4) NOT NULL DEFAULT 0,
    new_quantity DECIMAL(12, 4) NOT NULL DEFAULT 0,
    difference DECIMAL(12, 4) NOT NULL DEFAULT 0,
    reference VARCHAR(100),
    reason VARCHAR(100),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'skipped')),
    applied_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_inventory_counts_tenant ON inventory_counts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_counts_warehouse ON inventory_counts(tenant_id, warehouse_id);
CREATE INDEX IF NOT EXISTS idx_inventory_counts_status ON inventory_counts(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_inventory_counts_date ON inventory_counts(tenant_id, count_date DESC);
CREATE INDEX IF NOT EXISTS idx_count_items_count ON inventory_count_items(inventory_count_id);
CREATE INDEX IF NOT EXISTS idx_count_items_ingredient ON inventory_count_items(tenant_id, ingredient_id);
CREATE INDEX IF NOT EXISTS idx_adjustments_count ON inventory_adjustments(inventory_count_id);
CREATE INDEX IF NOT EXISTS idx_adjustments_tenant ON inventory_adjustments(tenant_id);

-- ============================================================
-- PRICE HISTORY (Phase 4)
-- ============================================================

CREATE TABLE IF NOT EXISTS ingredient_price_history (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    ingredient_id INT NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    supplier_id INT REFERENCES suppliers(id) ON DELETE SET NULL,
    purchase_order_id INT REFERENCES purchase_orders(id) ON DELETE SET NULL,
    unit_price DECIMAL(12, 4) NOT NULL,
    purchase_unit VARCHAR(50),
    conversion_factor DECIMAL(12, 4) DEFAULT 1.0000,
    price_per_unit DECIMAL(12, 4) NOT NULL,
    quantity DECIMAL(12, 4) DEFAULT 0,
    currency VARCHAR(10) DEFAULT 'TND',
    price_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    source VARCHAR(50) DEFAULT 'manual' CHECK (source IN ('manual', 'purchase', 'import', 'adjustment')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS supplier_ingredients (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    supplier_id INT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    ingredient_id INT NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    supplier_sku VARCHAR(100),
    unit_price DECIMAL(12, 4),
    purchase_unit VARCHAR(50),
    conversion_factor DECIMAL(12, 4) DEFAULT 1.0000,
    minimum_order_quantity DECIMAL(12, 4) DEFAULT 0,
    lead_time_days INT DEFAULT 0,
    is_preferred BOOLEAN DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, supplier_id, ingredient_id)
);

CREATE INDEX IF NOT EXISTS idx_price_history_tenant ON ingredient_price_history(tenant_id);
CREATE INDEX IF NOT EXISTS idx_price_history_ingredient ON ingredient_price_history(tenant_id, ingredient_id);
CREATE INDEX IF NOT EXISTS idx_price_history_supplier ON ingredient_price_history(tenant_id, supplier_id);
CREATE INDEX IF NOT EXISTS idx_price_history_date ON ingredient_price_history(tenant_id, ingredient_id, price_date DESC);
CREATE INDEX IF NOT EXISTS idx_price_history_po ON ingredient_price_history(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_supplier_ings_tenant ON supplier_ingredients(tenant_id);
CREATE INDEX IF NOT EXISTS idx_supplier_ings_supplier ON supplier_ingredients(tenant_id, supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_ings_ingredient ON supplier_ingredients(tenant_id, ingredient_id);

-- ============================================================
-- PURCHASE RETURNS (Phase 4)
-- ============================================================

CREATE TABLE IF NOT EXISTS purchase_returns (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    supplier_id INT REFERENCES suppliers(id) ON DELETE SET NULL,
    purchase_order_id INT REFERENCES purchase_orders(id) ON DELETE SET NULL,
    goods_reception_id INT REFERENCES goods_receptions(id) ON DELETE SET NULL,
    return_number VARCHAR(100),
    return_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    reason VARCHAR(255),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
    notes TEXT,
    created_by INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS purchase_return_items (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    purchase_return_id INT NOT NULL REFERENCES purchase_returns(id) ON DELETE CASCADE,
    purchase_order_item_id INT REFERENCES purchase_order_items(id) ON DELETE SET NULL,
    batch_id INT REFERENCES inventory_batches(id) ON DELETE SET NULL,
    ingredient_id INT REFERENCES ingredients(id) ON DELETE SET NULL,
    quantity DECIMAL(12, 4) NOT NULL DEFAULT 0,
    unit_price DECIMAL(12, 4) DEFAULT 0,
    total_amount DECIMAL(14, 4) DEFAULT 0,
    reason VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_purchase_returns_tenant ON purchase_returns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_purchase_returns_supplier ON purchase_returns(tenant_id, supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_returns_po ON purchase_returns(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_return_items_return ON purchase_return_items(purchase_return_id);
CREATE INDEX IF NOT EXISTS idx_return_items_batch ON purchase_return_items(batch_id);
`;

export async function initializeDatabase() {
  console.log('Initializing database schema...');
  try {
    await query(DDL_SCHEMA);
    console.log('Database tables verified/created successfully.');

    // Defensive migration: ensure suppliers table exists (handles partial DDL failures)
    try {
      await query(`
        DO $$ BEGIN
          CREATE TYPE supplier_status AS ENUM ('active', 'archived');
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
      `);
      await query(`
        CREATE TABLE IF NOT EXISTS suppliers (
          id SERIAL PRIMARY KEY,
          tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          company_name VARCHAR(255),
          reference VARCHAR(100),
          tax_number VARCHAR(100),
          registration_number VARCHAR(100),
          contact_person VARCHAR(255),
          email VARCHAR(255),
          phone VARCHAR(50),
          mobile VARCHAR(50),
          website TEXT,
          address TEXT,
          city VARCHAR(100),
          postal_code VARCHAR(20),
          country VARCHAR(100),
          payment_terms VARCHAR(100),
          payment_method VARCHAR(100),
          currency VARCHAR(3) DEFAULT 'TND',
          delivery_delay INT DEFAULT 0,
          minimum_order_amount DECIMAL(12, 3) DEFAULT 0,
          notes TEXT,
          status supplier_status NOT NULL DEFAULT 'active',
          preferred BOOLEAN NOT NULL DEFAULT FALSE,
          rating INT DEFAULT 0 CHECK (rating >= 0 AND rating <= 5),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          archived_at TIMESTAMP WITH TIME ZONE
        );
      `);
      await query(`CREATE INDEX IF NOT EXISTS idx_suppliers_tenant_id ON suppliers(tenant_id)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_suppliers_status ON suppliers(status)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_suppliers_email ON suppliers(email)`);
      await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_tenant_name ON suppliers(tenant_id, LOWER(name))`);
      await query(`ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS preferred_supplier_id INT REFERENCES suppliers(id) ON DELETE SET NULL`);
      await query(`CREATE INDEX IF NOT EXISTS idx_ingredients_preferred_supplier ON ingredients(preferred_supplier_id)`);
      console.log('Supplier schema verified/created.');
    } catch (migrationErr: any) {
      console.warn('Supplier migration warning:', migrationErr.message);
    }

    // ============================================================
    // Notification System Migration (Phase 1 — v3.2.0)
    // ============================================================
    try {
      // Add dedup_key and expires_at columns (if not present)
      await query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS dedup_key VARCHAR(255)`);
      await query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE`);
      await query(`CREATE INDEX IF NOT EXISTS idx_notifications_dedup ON notifications(tenant_id, dedup_key) WHERE dedup_key IS NOT NULL`);
      await query(`CREATE INDEX IF NOT EXISTS idx_notifications_expires ON notifications(expires_at) WHERE expires_at IS NOT NULL`);

      // Create notification_reads table for per-user read tracking
      await query(`
        CREATE TABLE IF NOT EXISTS notification_reads (
            id SERIAL PRIMARY KEY,
            tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            notification_id INT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
            read_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(tenant_id, user_id, notification_id)
        )
      `);
      await query(`CREATE INDEX IF NOT EXISTS idx_notification_reads_user ON notification_reads(tenant_id, user_id)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_notification_reads_notif ON notification_reads(notification_id)`);

      console.log('Notification migration (Phase 1) completed: dedup_key, expires_at, notification_reads.');
    } catch (notifErr: any) {
      console.warn('Notification migration warning:', notifErr.message);
    }

    // ============================================================
    // Activity Journal Migration (Phase 3 — v3.6.0)
    // ============================================================
    try {
      await query(`
        DO $$ BEGIN
          CREATE TYPE journal_source AS ENUM (
            'web_application', 'legacy_pos_agent', 'api',
            'synchronization_service', 'system', 'scheduler', 'forecast_engine'
          );
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
      `);
      await query(`
        DO $$ BEGIN
          CREATE TYPE journal_severity AS ENUM ('info', 'notice', 'warning', 'error', 'critical');
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
      `);
      await query(`
        CREATE TABLE IF NOT EXISTS activity_journal (
            id BIGSERIAL PRIMARY KEY,
            tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            event_id UUID NOT NULL DEFAULT gen_random_uuid(),
            event_type VARCHAR(100) NOT NULL,
            correlation_id VARCHAR(100),
            entity_type VARCHAR(50),
            entity_id VARCHAR(100),
            performed_by_user_id INT REFERENCES users(id) ON DELETE SET NULL,
            performed_by_role VARCHAR(20),
            performed_by_source journal_source NOT NULL DEFAULT 'web_application',
            occurred_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
            severity journal_severity NOT NULL DEFAULT 'info',
            title VARCHAR(255) NOT NULL,
            description TEXT,
            metadata JSONB NOT NULL DEFAULT '{}',
            ip_address INET,
            user_agent TEXT,
            session_id VARCHAR(100),
            connector_id INT REFERENCES agents(id) ON DELETE SET NULL,
            external_reference VARCHAR(255),
            previous_values JSONB,
            new_values JSONB,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Activity journal indexes
      await query(`CREATE INDEX IF NOT EXISTS idx_activity_journal_tenant ON activity_journal(tenant_id, occurred_at DESC)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_activity_journal_event_type ON activity_journal(tenant_id, event_type, occurred_at DESC)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_activity_journal_entity ON activity_journal(tenant_id, entity_type, entity_id, occurred_at DESC)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_activity_journal_user ON activity_journal(tenant_id, performed_by_user_id, occurred_at DESC)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_activity_journal_source ON activity_journal(tenant_id, performed_by_source, occurred_at DESC)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_activity_journal_severity ON activity_journal(tenant_id, severity, occurred_at DESC)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_activity_journal_correlation ON activity_journal(tenant_id, correlation_id)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_activity_journal_date ON activity_journal(tenant_id, occurred_at)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_activity_journal_metadata ON activity_journal USING gin(metadata)`);

      console.log('Activity Journal migration completed.');
    } catch (journalErr: any) {
      console.warn('Activity Journal migration warning:', journalErr.message);
    }

    // Detect and fix tables that were just upgraded from single-tenant (missing tenant_id data)
    const checkNullTenant = await query(`
      SELECT count(*) FROM users WHERE tenant_id IS NULL
    `);
    const nullTenantCount = parseInt(checkNullTenant.rows[0].count, 10);
    
    if (nullTenantCount > 0) {
      console.log(`Found ${nullTenantCount} rows with NULL tenant_id. Running data migration...`);
      
      // Ensure default tenant exists
      await query(`
        INSERT INTO tenants (id, name, slug, status, subscription_plan)
        VALUES (1, 'Default Restaurant', 'default', 'active', 'enterprise')
        ON CONFLICT (id) DO NOTHING
      `);
      
      // Assign existing rows to default tenant
      await query(`UPDATE users SET tenant_id = 1 WHERE tenant_id IS NULL`);
      await query(`UPDATE departments SET tenant_id = 1 WHERE tenant_id IS NULL`);
      await query(`UPDATE ingredients SET tenant_id = 1 WHERE tenant_id IS NULL`);
      await query(`UPDATE inventory_stocks SET tenant_id = 1 WHERE tenant_id IS NULL`);
      await query(`UPDATE recipes SET tenant_id = 1 WHERE tenant_id IS NULL`);
      await query(`UPDATE recipe_ingredients SET tenant_id = 1 WHERE tenant_id IS NULL`);
      await query(`UPDATE sales_tickets SET tenant_id = 1 WHERE tenant_id IS NULL`);
      await query(`UPDATE sales_ticket_items SET tenant_id = 1 WHERE tenant_id IS NULL`);
      await query(`UPDATE stock_movements SET tenant_id = 1 WHERE tenant_id IS NULL`);
      await query(`UPDATE ingredient_losses SET tenant_id = 1 WHERE tenant_id IS NULL`);
      await query(`UPDATE transfer_requests SET tenant_id = 1 WHERE tenant_id IS NULL`);
      
      // Set NOT NULL on tenant_id columns
      await query(`ALTER TABLE users ALTER COLUMN tenant_id SET NOT NULL`);
      await query(`ALTER TABLE departments ALTER COLUMN tenant_id SET NOT NULL`);
      await query(`ALTER TABLE ingredients ALTER COLUMN tenant_id SET NOT NULL`);
      await query(`ALTER TABLE inventory_stocks ALTER COLUMN tenant_id SET NOT NULL`);
      await query(`ALTER TABLE recipes ALTER COLUMN tenant_id SET NOT NULL`);
      await query(`ALTER TABLE recipe_ingredients ALTER COLUMN tenant_id SET NOT NULL`);
      await query(`ALTER TABLE sales_tickets ALTER COLUMN tenant_id SET NOT NULL`);
      await query(`ALTER TABLE sales_ticket_items ALTER COLUMN tenant_id SET NOT NULL`);
      await query(`ALTER TABLE stock_movements ALTER COLUMN tenant_id SET NOT NULL`);
      await query(`ALTER TABLE ingredient_losses ALTER COLUMN tenant_id SET NOT NULL`);
      await query(`ALTER TABLE transfer_requests ALTER COLUMN tenant_id SET NOT NULL`);
      
      console.log('Data migration complete: existing rows assigned to default tenant.');
    }

    // ============================================================
    // v4.0.0 Migration — Rename columns in existing procurement/inventory tables
    // ============================================================
    try {
      await query(`ALTER TABLE purchase_orders RENAME COLUMN grand_total TO total`);
    } catch { /* column may already be renamed */ }
    try {
      await query(`ALTER TABLE inventory_counts ADD COLUMN IF NOT EXISTS created_by INT REFERENCES users(id) ON DELETE SET NULL`);
    } catch { /* ignore */ }
    try {
      await query(`ALTER TABLE inventory_count_items RENAME COLUMN inventory_count_id TO count_session_id`);
    } catch { /* ignore */ }
    try {
      await query(`ALTER TABLE inventory_adjustments RENAME COLUMN inventory_count_id TO count_session_id`);
    } catch { /* ignore */ }
    try {
      await query(`ALTER TABLE inventory_adjustments RENAME COLUMN warehouse_id TO department_id`);
    } catch { /* ignore */ }
    try {
      await query(`ALTER TABLE inventory_adjustments ADD COLUMN IF NOT EXISTS count_item_id INT REFERENCES inventory_count_items(id) ON DELETE SET NULL`);
    } catch { /* ignore */ }
    try {
      await query(`ALTER TABLE inventory_adjustments ADD COLUMN IF NOT EXISTS reference VARCHAR(100)`);
    } catch { /* ignore */ }
    // Replace generated `difference` column with regular column
    try {
      await query(`ALTER TABLE inventory_adjustments DROP COLUMN IF EXISTS difference`);
      await query(`ALTER TABLE inventory_adjustments ADD COLUMN difference DECIMAL(12, 4) NOT NULL DEFAULT 0`);
    } catch { /* ignore */ }

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
      console.log('Seeding database with comprehensive demo data...');

      const { client, release } = await getClient();
      try {
        await client.query('BEGIN');

        // Seed tenants
        for (const t of seedData.tenants) {
          await client.query(
            `INSERT INTO tenants (id, uuid, name, slug, email, phone, address, country, timezone, language, currency, status, subscription_plan, max_users, max_agents, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
             ON CONFLICT (id) DO NOTHING`,
            [t.id, t.uuid, t.name, t.slug, t.email, t.phone, t.address, t.country, t.timezone, t.language, t.currency, t.status, t.subscription_plan, t.max_users, t.max_agents, t.created_at]
          );
        }

        // Seed platform admin
        const platformHash = await hashPassword('platform123');
        await client.query(
          `INSERT INTO platform_users (username, password_hash, email, first_name, last_name, is_super_admin)
           VALUES ('superadmin', $1, 'superadmin@mepos.com', 'Platform', 'Admin', TRUE)
           ON CONFLICT (username) DO NOTHING`,
          [platformHash]
        );

        // Seed users (with hashed passwords)
        for (const u of seedData.users) {
          const hashed = await hashPassword(u.password_hash);
          await client.query(
            `INSERT INTO users (id, tenant_id, username, password_hash, role, first_name, last_name, is_active, last_login_at, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             ON CONFLICT (id) DO NOTHING`,
            [u.id, u.tenant_id, u.username, hashed, u.role, u.first_name, u.last_name, true, u.last_login_at || new Date(), u.created_at || new Date()]
          );
        }

        // Seed departments
        for (const d of seedData.departments) {
          await client.query(
            `INSERT INTO departments (id, tenant_id, name, stock_type, description, created_at)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (id) DO NOTHING`,
            [d.id, d.tenant_id, d.name, d.stock_type, d.description || '', d.created_at || new Date()]
          );
        }

        // Seed suppliers (before ingredients due to FK)
        for (const s of seedData.suppliers) {
          await client.query(
            `INSERT INTO suppliers (id, tenant_id, name, company_name, reference, tax_number, registration_number,
             contact_person, email, phone, mobile, website, address, city, postal_code, country,
             payment_terms, payment_method, currency, delivery_delay, minimum_order_amount, notes,
             status, preferred, rating, created_at, updated_at, archived_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)
             ON CONFLICT (id) DO NOTHING`,
            [s.id, s.tenant_id, s.name, s.company_name, s.reference, s.tax_number, s.registration_number,
             s.contact_person, s.email, s.phone, s.mobile, s.website, s.address, s.city, s.postal_code, s.country,
             s.payment_terms, s.payment_method, s.currency, s.delivery_delay, s.minimum_order_amount, s.notes,
             s.status, s.preferred, s.rating, s.created_at || new Date(), s.updated_at || new Date(), s.archived_at]
          );
        }

        // Seed ingredients
        for (const i of seedData.ingredients) {
          await client.query(
            `INSERT INTO ingredients (id, tenant_id, name, unit, purchase_price_per_unit, alert_threshold, purchase_unit, purchase_unit_price, conversion_factor, preferred_supplier_id, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             ON CONFLICT (id) DO NOTHING`,
            [i.id, i.tenant_id, i.name, i.unit, i.purchase_price_per_unit, i.alert_threshold, i.purchase_unit, i.purchase_unit_price, i.conversion_factor, i.preferred_supplier_id || null, i.created_at || new Date()]
          );
        }

        // Seed inventory stocks
        for (const s of seedData.inventory_stocks) {
          await client.query(
            `INSERT INTO inventory_stocks (id, tenant_id, department_id, ingredient_id, quantity, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (id) DO NOTHING`,
            [s.id, s.tenant_id, s.department_id, s.ingredient_id, s.quantity, s.updated_at || new Date()]
          );
        }

        // Seed recipes
        for (const r of seedData.recipes) {
          await client.query(
            `INSERT INTO recipes (id, tenant_id, name, sale_price, is_active, created_at)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (id) DO NOTHING`,
            [r.id, r.tenant_id, r.name, r.sale_price, true, r.created_at || new Date()]
          );
        }

        // Seed recipe ingredients
        for (const ri of seedData.recipe_ingredients) {
          await client.query(
            `INSERT INTO recipe_ingredients (id, tenant_id, recipe_id, ingredient_id, quantity_needed)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (id) DO NOTHING`,
            [ri.id, ri.tenant_id, ri.recipe_id, ri.ingredient_id, ri.quantity_needed]
          );
        }

        // Seed sales tickets (in batches to avoid huge transactions)
        const BATCH_SIZE = 500;
        for (let i = 0; i < seedData.sales_tickets.length; i += BATCH_SIZE) {
          const batch = seedData.sales_tickets.slice(i, i + BATCH_SIZE);
          for (const ticket of batch) {
            await client.query(
              `INSERT INTO sales_tickets (id, tenant_id, external_ticket_id, department_id, ticket_date, total_amount, sync_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7)
               ON CONFLICT (id) DO NOTHING`,
              [ticket.id, ticket.tenant_id, ticket.external_ticket_id, ticket.department_id, ticket.ticket_date, ticket.total_amount, ticket.sync_at || new Date()]
            );
          }
        }

        // Seed sales ticket items
        for (let i = 0; i < seedData.sales_ticket_items.length; i += BATCH_SIZE) {
          const batch = seedData.sales_ticket_items.slice(i, i + BATCH_SIZE);
          for (const item of batch) {
            await client.query(
              `INSERT INTO sales_ticket_items (id, tenant_id, sales_ticket_id, recipe_id, quantity, unit_price)
               VALUES ($1, $2, $3, $4, $5, $6)
               ON CONFLICT (id) DO NOTHING`,
              [item.id, item.tenant_id, item.sales_ticket_id, item.recipe_id, item.quantity, item.unit_price]
            );
          }
        }

        // Seed stock movements
        for (const m of seedData.stock_movements) {
          await client.query(
            `INSERT INTO stock_movements (id, tenant_id, department_id, ingredient_id, quantity, type, reference_id, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (id) DO NOTHING`,
            [m.id, m.tenant_id, m.department_id, m.ingredient_id, m.quantity, m.type, m.reference_id || '', m.created_at || new Date()]
          );
        }

        // Seed ingredient losses
        for (const l of seedData.ingredient_losses) {
          await client.query(
            `INSERT INTO ingredient_losses (id, tenant_id, department_id, ingredient_id, quantity, loss_reason, cost_loss, opportunity_loss, reported_by, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             ON CONFLICT (id) DO NOTHING`,
            [l.id, l.tenant_id, l.department_id, l.ingredient_id, l.quantity, l.loss_reason, l.cost_loss, l.opportunity_loss, l.reported_by, l.created_at || new Date()]
          );
        }

        // Seed transfer requests
        for (const tr of seedData.transfer_requests) {
          await client.query(
            `INSERT INTO transfer_requests (id, tenant_id, source_department_id, destination_department_id, ingredient_id, quantity, status, requested_by, validated_by, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             ON CONFLICT (id) DO NOTHING`,
            [tr.id, tr.tenant_id, tr.source_department_id, tr.destination_department_id, tr.ingredient_id, tr.quantity, tr.status, tr.requested_by, tr.validated_by, tr.created_at || new Date(), tr.updated_at || new Date()]
          );
        }

        // Seed agents
        for (const a of seedData.agents) {
          await client.query(
            `INSERT INTO agents (id, uuid, tenant_id, name, machine_name, machine_id, operating_system, version, connector_type, status, agent_secret_hash, config, last_seen_at, last_sync_at, last_heartbeat_at, health_status, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
             ON CONFLICT (id) DO NOTHING`,
            [a.id, a.uuid, a.tenant_id, a.name, a.machine_name, a.machine_id, a.operating_system, a.version, a.connector_type, a.status, a.agent_secret_hash, JSON.stringify(a.config), a.last_seen_at, a.last_sync_at, a.last_heartbeat_at, a.health_status, a.created_at]
          );
        }

        // Seed agent heartbeats
        for (const hb of seedData.agent_heartbeats) {
          await client.query(
            `INSERT INTO agent_heartbeats (id, agent_id, tenant_id, version, status, health_status, last_sync_at, connector_status, sync_duration_ms, tickets_imported, errors_count, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
             ON CONFLICT (id) DO NOTHING`,
            [hb.id, hb.agent_id, hb.tenant_id, hb.version, hb.status || 'active', hb.health_status, hb.last_sync_at, hb.connector_status, hb.sync_duration_ms, hb.tickets_imported, hb.errors_count, hb.created_at]
          );
        }

        // Seed tenant settings
        for (const ts of seedData.tenant_settings) {
          await client.query(
            `INSERT INTO tenant_settings (id, tenant_id, category, key, value, encrypted, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (id) DO NOTHING`,
            [ts.id, ts.tenant_id, ts.category, ts.key, ts.value, ts.encrypted || false, ts.created_at || new Date()]
          );
        }

        // Seed audit logs
        for (const al of seedData.audit_logs) {
          await client.query(
            `INSERT INTO audit_logs (id, tenant_id, user_id, action, entity_type, entity_id, ip_address, user_agent, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (id) DO NOTHING`,
            [al.id, al.tenant_id, al.user_id, al.action, al.entity_type, al.entity_id, al.ip_address, al.user_agent, al.created_at]
          );
        }

        // Seed product mappings
        for (const pm of seedData.product_mappings) {
          await client.query(
            `INSERT INTO product_mappings (id, tenant_id, connector_type, external_product_id, external_product_code, external_product_name, mepos_product_id, mapping_status, confidence, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             ON CONFLICT (id) DO NOTHING`,
            [pm.id, pm.tenant_id, pm.connector_type, pm.external_product_id, pm.external_product_code, pm.external_product_name, pm.mepos_product_id, pm.mapping_status, pm.confidence, pm.created_at || new Date(), pm.updated_at || new Date()]
          );
        }

        // Reset all sequences
        const tables = ['users', 'departments', 'suppliers', 'ingredients', 'recipes', 'sales_tickets', 'sales_ticket_items', 'stock_movements', 'ingredient_losses', 'transfer_requests', 'agents', 'agent_heartbeats', 'tenant_settings', 'audit_logs', 'tenants', 'platform_users', 'product_mappings', 'purchase_orders', 'purchase_order_items', 'goods_receptions', 'goods_reception_items', 'supplier_invoices', 'inventory_batches', 'batch_movements', 'inventory_counts', 'inventory_count_items', 'inventory_adjustments', 'ingredient_price_history', 'supplier_ingredients', 'purchase_returns', 'purchase_return_items'];
        for (const table of tables) {
          await client.query(`SELECT setval('${table}_id_seq', (SELECT COALESCE(MAX(id), 1) FROM ${table}))`);
        }

        await client.query('COMMIT');
        console.log(`Database seeded with ${seedData.sales_tickets.length} sales tickets, ${seedData.stock_movements.length} stock movements, and more.`);
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
