-- ============================================================
-- mePOS STOCK — Price History & Supplier Pricing
-- Migration 007
-- ============================================================

BEGIN;

-- Ingredient Price History (append-only)
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

-- Supplier-Ingredient junction (specific pricing per supplier)
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_price_history_tenant ON ingredient_price_history(tenant_id);
CREATE INDEX IF NOT EXISTS idx_price_history_ingredient ON ingredient_price_history(tenant_id, ingredient_id);
CREATE INDEX IF NOT EXISTS idx_price_history_supplier ON ingredient_price_history(tenant_id, supplier_id);
CREATE INDEX IF NOT EXISTS idx_price_history_date ON ingredient_price_history(tenant_id, ingredient_id, price_date DESC);
CREATE INDEX IF NOT EXISTS idx_price_history_po ON ingredient_price_history(purchase_order_id);

CREATE INDEX IF NOT EXISTS idx_supplier_ings_tenant ON supplier_ingredients(tenant_id);
CREATE INDEX IF NOT EXISTS idx_supplier_ings_supplier ON supplier_ingredients(tenant_id, supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_ings_ingredient ON supplier_ingredients(tenant_id, ingredient_id);

-- RLS
ALTER TABLE ingredient_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_ingredients ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON ingredient_price_history
    FOR ALL USING (tenant_id = current_setting('app.current_tenant', true)::int);
CREATE POLICY tenant_isolation_policy ON supplier_ingredients
    FOR ALL USING (tenant_id = current_setting('app.current_tenant', true)::int);

COMMIT;
