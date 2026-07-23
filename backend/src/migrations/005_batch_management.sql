-- ============================================================
-- mePOS STOCK — Batch & Expiration Management
-- Migration 005
-- ============================================================

BEGIN;

-- Batch Status
DO $$ BEGIN
    CREATE TYPE batch_status AS ENUM (
        'active',
        'partially_consumed',
        'consumed',
        'expired',
        'discarded',
        'transferred',
        'adjusted'
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Inventory Batches
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

-- Batch Movements (individual consumption/transfer/adjustment records)
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

-- Tenant setting for consumption strategy
-- 'fefo' = First Expired First Out (default)
-- 'fifo' = First In First Out
-- stored in tenant_settings: category='inventory', key='consumption_strategy'

-- Indexes
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

-- RLS
ALTER TABLE inventory_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON inventory_batches
    FOR ALL USING (tenant_id = current_setting('app.current_tenant', true)::int);
CREATE POLICY tenant_isolation_policy ON batch_movements
    FOR ALL USING (tenant_id = current_setting('app.current_tenant', true)::int);

COMMIT;
