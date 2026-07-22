-- ============================================================
-- mePOS STOCK — Activity Journal / Audit Trail (Phase 3)
-- Migration 003
-- ============================================================

-- Event Source enum
DO $$ BEGIN
    CREATE TYPE journal_source AS ENUM (
        'web_application',
        'legacy_pos_agent',
        'api',
        'synchronization_service',
        'system',
        'scheduler',
        'forecast_engine'
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Severity enum
DO $$ BEGIN
    CREATE TYPE journal_severity AS ENUM (
        'info',
        'notice',
        'warning',
        'error',
        'critical'
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Activity Journal table (centralized business event store)
CREATE TABLE IF NOT EXISTS activity_journal (
    id BIGSERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Event identification
    event_id UUID NOT NULL DEFAULT gen_random_uuid(),
    event_type VARCHAR(100) NOT NULL,
    correlation_id VARCHAR(100),

    -- Entity context
    entity_type VARCHAR(50),
    entity_id VARCHAR(100),

    -- Who performed the action
    performed_by_user_id INT REFERENCES users(id) ON DELETE SET NULL,
    performed_by_role VARCHAR(20),
    performed_by_source journal_source NOT NULL DEFAULT 'web_application',

    -- When
    occurred_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Importance
    severity journal_severity NOT NULL DEFAULT 'info',

    -- Human-readable
    title VARCHAR(255) NOT NULL,
    description TEXT,

    -- Rich metadata (event-specific details)
    metadata JSONB NOT NULL DEFAULT '{}',

    -- Request context
    ip_address INET,
    user_agent TEXT,
    session_id VARCHAR(100),

    -- Connector/agent context (for sync events)
    connector_id INT REFERENCES agents(id) ON DELETE SET NULL,
    external_reference VARCHAR(255),

    -- Audit-specific
    previous_values JSONB,
    new_values JSONB,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- INDEXES (Performance Critical)
-- ============================================================

-- Tenant isolation (always filter by tenant_id)
CREATE INDEX IF NOT EXISTS idx_activity_journal_tenant ON activity_journal(tenant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_journal_tenant_id ON activity_journal(tenant_id, id DESC);

-- Filtering by event type
CREATE INDEX IF NOT EXISTS idx_activity_journal_event_type ON activity_journal(tenant_id, event_type, occurred_at DESC);

-- Filtering by entity
CREATE INDEX IF NOT EXISTS idx_activity_journal_entity ON activity_journal(tenant_id, entity_type, entity_id, occurred_at DESC);

-- Filtering by user
CREATE INDEX IF NOT EXISTS idx_activity_journal_user ON activity_journal(tenant_id, performed_by_user_id, occurred_at DESC);

-- Filtering by source
CREATE INDEX IF NOT EXISTS idx_activity_journal_source ON activity_journal(tenant_id, performed_by_source, occurred_at DESC);

-- Filtering by severity
CREATE INDEX IF NOT EXISTS idx_activity_journal_severity ON activity_journal(tenant_id, severity, occurred_at DESC);

-- Correlation (for event chain navigation)
CREATE INDEX IF NOT EXISTS idx_activity_journal_correlation ON activity_journal(tenant_id, correlation_id);

-- Connector/agent
CREATE INDEX IF NOT EXISTS idx_activity_journal_connector ON activity_journal(tenant_id, connector_id, occurred_at DESC);

-- Date range queries
CREATE INDEX IF NOT EXISTS idx_activity_journal_date ON activity_journal(tenant_id, occurred_at);

-- Full text search (for search queries)
CREATE INDEX IF NOT EXISTS idx_activity_journal_search ON activity_journal USING gin(
    to_tsvector('french', COALESCE(title, '') || ' ' || COALESCE(description, ''))
);

-- Metadata querying (JSONB)
CREATE INDEX IF NOT EXISTS idx_activity_journal_metadata ON activity_journal USING gin(metadata);

-- ============================================================
-- ROLLBACK
-- ============================================================
-- DROP TABLE IF EXISTS activity_journal;
-- DROP TYPE IF EXISTS journal_source;
-- DROP TYPE IF EXISTS journal_severity;
