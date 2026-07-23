-- ============================================================
-- mePOS STOCK — Purchase Returns
-- Migration 008
-- ============================================================

BEGIN;

-- Purchase Returns
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

-- Purchase Return Items
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_purchase_returns_tenant ON purchase_returns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_purchase_returns_supplier ON purchase_returns(tenant_id, supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_returns_po ON purchase_returns(purchase_order_id);

CREATE INDEX IF NOT EXISTS idx_return_items_return ON purchase_return_items(purchase_return_id);
CREATE INDEX IF NOT EXISTS idx_return_items_batch ON purchase_return_items(batch_id);

-- RLS
ALTER TABLE purchase_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_return_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON purchase_returns
    FOR ALL USING (tenant_id = current_setting('app.current_tenant', true)::int);
CREATE POLICY tenant_isolation_policy ON purchase_return_items
    FOR ALL USING (tenant_id = current_setting('app.current_tenant', true)::int);

COMMIT;
