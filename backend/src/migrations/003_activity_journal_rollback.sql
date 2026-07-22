-- ============================================================
-- mePOS STOCK — Activity Journal Rollback (Migration 003)
-- ============================================================

DROP TABLE IF EXISTS activity_journal;
DROP TYPE IF EXISTS journal_source;
DROP TYPE IF EXISTS journal_severity;
