-- =====================================================
-- mePOS STOCK — Notification Read State Rollback
-- =====================================================
-- WARNING: This will DROP the notification_reads table
-- and remove dedup_key/expires_at columns.
-- =====================================================

BEGIN;

-- Drop notification_reads table
DROP TABLE IF EXISTS notification_reads CASCADE;

-- Drop indexes
DROP INDEX IF EXISTS idx_notifications_dedup;
DROP INDEX IF EXISTS idx_notifications_expires;
DROP INDEX IF EXISTS idx_notification_reads_user;
DROP INDEX IF EXISTS idx_notification_reads_notif;

-- Remove columns from notifications table
ALTER TABLE notifications DROP COLUMN IF EXISTS dedup_key;
ALTER TABLE notifications DROP COLUMN IF EXISTS expires_at;

COMMIT;
