-- =====================================================
-- mePOS STOCK — Notification Read State & Dedup Migration
-- =====================================================
-- This migration adds:
-- 1. dedup_key and expires_at columns to notifications table
-- 2. notification_reads table for per-user read tracking
-- 3. Indexes for performance
--
-- Run: psql -U mepos_user -d mepos_stock -f 002_notification_reads.sql
-- Rollback: See 002_notification_reads_rollback.sql
-- =====================================================

BEGIN;

-- =====================================================
-- Step 1: Add columns to notifications table
-- =====================================================

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS dedup_key VARCHAR(255),
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;

-- Unique index on dedup_key per tenant (soft dedup)
CREATE INDEX IF NOT EXISTS idx_notifications_dedup
  ON notifications(tenant_id, dedup_key) WHERE dedup_key IS NOT NULL;

-- Index for expiration cleanup
CREATE INDEX IF NOT EXISTS idx_notifications_expires
  ON notifications(expires_at) WHERE expires_at IS NOT NULL;

-- =====================================================
-- Step 2: Create notification_reads table
-- =====================================================

CREATE TABLE IF NOT EXISTS notification_reads (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notification_id INT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    read_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, user_id, notification_id)
);

-- Indexes for notification_reads
CREATE INDEX IF NOT EXISTS idx_notification_reads_user
  ON notification_reads(tenant_id, user_id);

CREATE INDEX IF NOT EXISTS idx_notification_reads_notif
  ON notification_reads(notification_id);

-- =====================================================
-- Step 3: Backfill notification_reads from existing data
-- (Mark the notification as read by the first user found
--  with matching tenant_id for each read notification)
-- =====================================================

-- This is best-effort: for notifications with assigned_to,
-- create a read record if read=true
INSERT INTO notification_reads (tenant_id, user_id, notification_id, read_at)
SELECT n.tenant_id, n.assigned_to, n.id, n.read_at
FROM notifications n
WHERE n.read = TRUE
  AND n.assigned_to IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM notification_reads nr
    WHERE nr.notification_id = n.id
      AND nr.user_id = n.assigned_to
  );

COMMIT;
