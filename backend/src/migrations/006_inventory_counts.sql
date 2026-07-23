-- ============================================================
-- mePOS STOCK — Physical Inventory Counts
-- Migration 006
-- ============================================================

BEGIN;

-- Inventory Count Status
DO $$ BEGIN
    CREATE TYPE inventory_count_status AS ENUM (
        'draft',
        'in_progress',
        'completed',
        'approved',
        'cancelled'
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Inventory Count Sessions
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

-- Inventory Count Items
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

-- Adjustments generated from count approval
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_inventory_counts_tenant ON inventory_counts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_counts_warehouse ON inventory_counts(tenant_id, warehouse_id);
CREATE INDEX IF NOT EXISTS idx_inventory_counts_status ON inventory_counts(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_inventory_counts_date ON inventory_counts(tenant_id, count_date DESC);

CREATE INDEX IF NOT EXISTS idx_count_items_count ON inventory_count_items(count_session_id);
CREATE INDEX IF NOT EXISTS idx_count_items_ingredient ON inventory_count_items(tenant_id, ingredient_id);

CREATE INDEX IF NOT EXISTS idx_adjustments_count ON inventory_adjustments(count_session_id);
CREATE INDEX IF NOT EXISTS idx_adjustments_tenant ON inventory_adjustments(tenant_id);

-- RLS
ALTER TABLE inventory_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_count_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON inventory_counts
    FOR ALL USING (tenant_id = current_setting('app.current_tenant', true)::int);
CREATE POLICY tenant_isolation_policy ON inventory_count_items
    FOR ALL USING (tenant_id = current_setting('app.current_tenant', true)::int);
CREATE POLICY tenant_isolation_policy ON inventory_adjustments
    FOR ALL USING (tenant_id = current_setting('app.current_tenant', true)::int);

COMMIT;
