-- ============================================================
-- mePOS STOCK — Procurement Module (Purchase Orders & Reception)
-- Migration 004
-- ============================================================

BEGIN;

-- Purchase Order Status
DO $$ BEGIN
    CREATE TYPE purchase_order_status AS ENUM (
        'draft',
        'pending_approval',
        'approved',
        'ordered',
        'partially_received',
        'received',
        'cancelled',
        'closed'
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Purchase Orders
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

-- Purchase Order Items
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
    line_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Goods Receptions
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

-- Goods Reception Items
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

-- Supplier Invoices
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

-- Indexes
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

-- RLS
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE goods_receptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE goods_reception_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON purchase_orders
    FOR ALL USING (tenant_id = current_setting('app.current_tenant', true)::int);
CREATE POLICY tenant_isolation_policy ON purchase_order_items
    FOR ALL USING (tenant_id = current_setting('app.current_tenant', true)::int);
CREATE POLICY tenant_isolation_policy ON goods_receptions
    FOR ALL USING (tenant_id = current_setting('app.current_tenant', true)::int);
CREATE POLICY tenant_isolation_policy ON goods_reception_items
    FOR ALL USING (tenant_id = current_setting('app.current_tenant', true)::int);
CREATE POLICY tenant_isolation_policy ON supplier_invoices
    FOR ALL USING (tenant_id = current_setting('app.current_tenant', true)::int);

COMMIT;
