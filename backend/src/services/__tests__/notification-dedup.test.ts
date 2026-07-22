import { describe, it, expect, beforeEach } from 'vitest';
import { demoDb } from '../../database';
import {
  createNotification,
  buildDedupKey,
  findActiveNotificationByDedupKey,
  deactivateNotificationsByDedupKey,
  cleanupExpiredNotifications,
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  CATEGORIES,
  PRIORITIES,
} from '../notification.service';
import { eventBus, Events } from '../event.service';
import { setupNotificationDispatcher } from '../notification-dispatcher';

// =============================================================
// NOTIFICATION DEDUP TESTS
// =============================================================
// Tests the deduplication logic for low-stock/stock-out/stock-critical
// notifications and the STOCK_RECOVERED event that deactivates them.
//
// All tests run against the in-memory demoDb to avoid PostgreSQL dependency.
// NOTE: In demo mode, `n.read` is shared globally (not per-user).
//       Per-user read state via `notification_reads` requires PostgreSQL.
// =============================================================

describe('Notification Dedup (Demo Mode)', () => {
  const TENANT_ID = 1;
  const USER_ID = 1; // Ahmed (admin)

  // Clean notifications before each test
  beforeEach(() => {
    (demoDb as any).notifications = [];

    // IMPORTANT: Remove the `notification:created` event handler registered
    // at module level in notification.service.ts. This handler creates
    // per-user copies of every notification and DELETES the original from
    // demoDb.notifications, which breaks dedup and read-state tests.
    // The dedup logic (findActiveNotificationByDedupKey, createNotification)
    // should be tested directly, independent of the distribution layer.
    eventBus.removeAllListeners('notification:created');
  });

  // ────────────────────────────────────────────
  // buildDedupKey
  // ────────────────────────────────────────────

  describe('buildDedupKey', () => {
    it('should generate consistent dedup keys', () => {
      const key1 = buildDedupKey('stock_low', 1, 'ingredient', 42, '2');
      const key2 = buildDedupKey('stock_low', 1, 'ingredient', 42, '2');
      expect(key1).toBe(key2);
    });

    it('should generate different keys for different entities', () => {
      const key1 = buildDedupKey('stock_low', 1, 'ingredient', 42, '2');
      const key2 = buildDedupKey('stock_low', 1, 'ingredient', 99, '2');
      const key3 = buildDedupKey('stock_low', 1, 'ingredient', 42, '3');
      const key4 = buildDedupKey('stock_critical', 1, 'ingredient', 42, '2');

      expect(key1).not.toBe(key2); // Different ingredient
      expect(key1).not.toBe(key3); // Different department
      expect(key1).not.toBe(key4); // Different event type
    });

    it('should generate different keys for different tenants', () => {
      const key1 = buildDedupKey('stock_low', 1, 'ingredient', 42);
      const key2 = buildDedupKey('stock_low', 2, 'ingredient', 42);
      expect(key1).not.toBe(key2);
    });

    it('should work without extra params', () => {
      const key = buildDedupKey('stock_low', 1);
      expect(key).toBe('stock_low:1');
    });

    it('should handle null entityId', () => {
      const key = buildDedupKey('agent_disconnected', 1, 'agent', null);
      expect(key).toBe('agent_disconnected:1:agent');
    });
  });

  // ────────────────────────────────────────────
  // findActiveNotificationByDedupKey
  // ────────────────────────────────────────────

  describe('findActiveNotificationByDedupKey', () => {
    it('should return null when no notification exists with that dedup key', async () => {
      const found = await findActiveNotificationByDedupKey(TENANT_ID, 'nonexistent:1');
      expect(found).toBeNull();
    });

    it('should find an active notification by dedup key', async () => {
      const dedupKey = 'stock_low:1:ingredient:5';
      await createNotification({
        tenantId: TENANT_ID,
        type: 'warning',
        category: CATEGORIES.inventory,
        priority: PRIORITIES.high,
        title: 'Stock bas',
        message: 'Test low stock',
        entityType: 'ingredient',
        entityId: 5,
        dedupKey,
      });

      const found = await findActiveNotificationByDedupKey(TENANT_ID, dedupKey);
      expect(found).not.toBeNull();
      expect(found.title).toBe('Stock bas');
      expect(found.dedup_key).toBe(dedupKey);
      expect(found.archived).toBe(false);
    });

    it('should return null if the notification is archived', async () => {
      const dedupKey = 'stock_low:1:ingredient:5';
      const notif = await createNotification({
        tenantId: TENANT_ID,
        type: 'warning',
        category: CATEGORIES.inventory,
        priority: PRIORITIES.high,
        title: 'Stock bas',
        message: 'Test low stock',
        entityType: 'ingredient',
        entityId: 5,
        dedupKey,
      });

      // Archive it manually
      notif.archived = true;

      const found = await findActiveNotificationByDedupKey(TENANT_ID, dedupKey);
      expect(found).toBeNull();
    });
  });

  // ────────────────────────────────────────────
  // createNotification with dedup
  // ────────────────────────────────────────────

  describe('createNotification with dedupKey', () => {
    it('should create a notification normally on first call', async () => {
      const dedupKey = 'stock_low:1:ingredient:5';
      const notif = await createNotification({
        tenantId: TENANT_ID,
        type: 'warning',
        category: CATEGORIES.inventory,
        priority: PRIORITIES.high,
        title: 'Stock bas',
        message: 'Le stock est bas',
        entityType: 'ingredient',
        entityId: 5,
        dedupKey,
      });

      expect(notif).not.toBeNull();
      expect(notif.id).toBeDefined();
      expect(notif.dedup_key).toBe(dedupKey);
      expect(notif.archived).toBe(false);
    });

    it('should return existing notification on second call with same dedup key (no duplicate)', async () => {
      const dedupKey = 'stock_low:1:ingredient:5';

      const first = await createNotification({
        tenantId: TENANT_ID,
        type: 'warning',
        category: CATEGORIES.inventory,
        priority: PRIORITIES.high,
        title: 'Stock bas',
        message: 'Le stock est bas',
        entityType: 'ingredient',
        entityId: 5,
        dedupKey,
      });

      const second = await createNotification({
        tenantId: TENANT_ID,
        type: 'warning',
        category: CATEGORIES.inventory,
        priority: PRIORITIES.high,
        title: 'Stock bas (updated message)',
        message: 'Ceci ne devrait pas apparaître',
        entityType: 'ingredient',
        entityId: 5,
        dedupKey,
      });

      // Second call should return the EXISTING notification (same id)
      expect(second.id).toBe(first.id);
      expect(second.title).toBe(first.title); // Original title preserved
      expect(second.message).toBe(first.message); // Original message preserved

      // Only one notification should exist in the store
      const notifs = (demoDb as any).notifications;
      const matching = notifs.filter((n: any) => n.dedup_key === dedupKey);
      expect(matching.length).toBe(1);
    });

    it('should create a new notification if the existing one is archived (recovery cycle)', async () => {
      const dedupKey = 'stock_low:1:ingredient:5';

      // Create first notification
      const first = await createNotification({
        tenantId: TENANT_ID,
        type: 'warning',
        category: CATEGORIES.inventory,
        priority: PRIORITIES.high,
        title: 'Stock bas',
        message: 'Le stock est bas',
        entityType: 'ingredient',
        entityId: 5,
        dedupKey,
      });

      // Deactivate existing notifications by dedup key prefix
      await deactivateNotificationsByDedupKey(TENANT_ID, 'stock_low:1:ingredient:5');

      // Now create again — should be a NEW notification
      const second = await createNotification({
        tenantId: TENANT_ID,
        type: 'warning',
        category: CATEGORIES.inventory,
        priority: PRIORITIES.high,
        title: 'Stock bas (renewed)',
        message: 'Stock still low after recovery attempt',
        entityType: 'ingredient',
        entityId: 5,
        dedupKey,
      });

      expect(second.id).not.toBe(first.id);
      expect(second.title).toBe('Stock bas (renewed)');
      expect(second.archived).toBe(false);
    });

    it('should not dedup notifications without dedupKey', async () => {
      const notif1 = await createNotification({
        tenantId: TENANT_ID,
        type: 'warning',
        category: CATEGORIES.inventory,
        priority: PRIORITIES.high,
        title: 'Stock bas',
        message: 'Premier avertissement',
        entityType: 'ingredient',
        entityId: 5,
      });

      const notif2 = await createNotification({
        tenantId: TENANT_ID,
        type: 'warning',
        category: CATEGORIES.inventory,
        priority: PRIORITIES.high,
        title: 'Stock bas',
        message: 'Second avertissement',
        entityType: 'ingredient',
        entityId: 5,
      });

      // Without dedupKey, both should be created separately
      expect(notif2.id).not.toBe(notif1.id);
      expect((demoDb as any).notifications.length).toBe(2);
    });
  });

  // ────────────────────────────────────────────
  // deactivateNotificationsByDedupKey
  // ────────────────────────────────────────────

  describe('deactivateNotificationsByDedupKey', () => {
    it('should deactivate notifications matching a prefix', async () => {
      await createNotification({
        tenantId: TENANT_ID,
        type: 'warning',
        category: CATEGORIES.inventory,
        priority: PRIORITIES.high,
        title: 'Stock bas',
        message: 'Farine basse',
        entityType: 'ingredient',
        entityId: 1,
        dedupKey: 'stock_low:1:ingredient:1:dept2',
      });

      await createNotification({
        tenantId: TENANT_ID,
        type: 'critical',
        category: CATEGORIES.inventory,
        priority: PRIORITIES.critical,
        title: 'Stock critique',
        message: 'Farine critique',
        entityType: 'ingredient',
        entityId: 1,
        dedupKey: 'stock_critical:1:ingredient:1:dept2',
      });

      // Deactivate all stock notifications for ingredient 1
      const count = await deactivateNotificationsByDedupKey(TENANT_ID, 'stock_low:1:ingredient:1');

      expect(count).toBeGreaterThanOrEqual(1);

      // The stock_low notification should be archived
      const stockLowActive = await findActiveNotificationByDedupKey(TENANT_ID, 'stock_low:1:ingredient:1:dept2');
      expect(stockLowActive).toBeNull();

      // The stock_critical notification should NOT be affected (different prefix)
      const stockCriticalActive = await findActiveNotificationByDedupKey(TENANT_ID, 'stock_critical:1:ingredient:1:dept2');
      expect(stockCriticalActive).not.toBeNull();
    });

    it('should return 0 when no notifications match', async () => {
      const count = await deactivateNotificationsByDedupKey(TENANT_ID, 'nonexistent:1');
      expect(count).toBe(0);
    });

    it('should be idempotent — second call returns 0', async () => {
      await createNotification({
        tenantId: TENANT_ID,
        type: 'warning',
        category: CATEGORIES.inventory,
        priority: PRIORITIES.high,
        title: 'Stock bas',
        message: 'Test',
        entityType: 'ingredient',
        entityId: 5,
        dedupKey: 'stock_low:1:ingredient:5:dept2',
      });

      const firstCall = await deactivateNotificationsByDedupKey(TENANT_ID, 'stock_low:1:ingredient:5');
      expect(firstCall).toBe(1);

      // Second call — already archived, nothing to deactivate
      const secondCall = await deactivateNotificationsByDedupKey(TENANT_ID, 'stock_low:1:ingredient:5');
      expect(secondCall).toBe(0);
    });
  });

  // ────────────────────────────────────────────
  // STOCK_RECOVERED event integration
  // ────────────────────────────────────────────

  describe('STOCK_RECOVERED event flow', () => {
    beforeEach(() => {
      // Clean up handlers before re-registering to prevent duplication
      eventBus.removeAllListeners(Events.STOCK_RECOVERED);
      eventBus.removeAllListeners(Events.STOCK_LOW);
      eventBus.removeAllListeners(Events.STOCK_OUT);
      eventBus.removeAllListeners(Events.STOCK_CRITICAL);
      setupNotificationDispatcher();
    });

    it('should deactivate stock_low notification on STOCK_RECOVERED event', async () => {
      const dedupKey = 'stock_low:1:ingredient:10:dept2';

      // Create a low stock notification as would normally happen
      await createNotification({
        tenantId: TENANT_ID,
        type: 'warning',
        category: CATEGORIES.inventory,
        priority: PRIORITIES.high,
        title: 'Stock bas',
        message: 'Test stock bas',
        entityType: 'ingredient',
        entityId: 10,
        dedupKey,
      });

      // Verify it exists
      let found = await findActiveNotificationByDedupKey(TENANT_ID, dedupKey);
      expect(found).not.toBeNull();

      // Emit STOCK_RECOVERED event (as getStockWarning does when stock returns above threshold)
      eventBus.emit(Events.STOCK_RECOVERED, {
        tenantId: TENANT_ID,
        ingredientId: 10,
        ingredientName: 'Test Ingredient',
        remainingQty: '50',
        unit: 'kg',
        departmentName: 'Cuisine',
        departmentId: 2,
      });

      // Wait for async handlers
      await new Promise(resolve => setTimeout(resolve, 10));

      // The low stock notification should now be deactivated
      found = await findActiveNotificationByDedupKey(TENANT_ID, dedupKey);
      expect(found).toBeNull();
    });

    it('should deactivate all stock alert types for the same ingredient on recovery', async () => {
      const lowKey = 'stock_low:1:ingredient:15:dept2';
      const criticalKey = 'stock_critical:1:ingredient:15:dept2';
      const outKey = 'stock_out:1:ingredient:15:dept2';

      // Create all three stock alert types
      await createNotification({
        tenantId: TENANT_ID, type: 'warning', category: CATEGORIES.inventory,
        priority: PRIORITIES.high, title: 'Stock bas', message: 'Low',
        entityType: 'ingredient', entityId: 15, dedupKey: lowKey,
      });
      await createNotification({
        tenantId: TENANT_ID, type: 'critical', category: CATEGORIES.inventory,
        priority: PRIORITIES.critical, title: 'Stock critique', message: 'Critical',
        entityType: 'ingredient', entityId: 15, dedupKey: criticalKey,
      });
      await createNotification({
        tenantId: TENANT_ID, type: 'error', category: CATEGORIES.inventory,
        priority: PRIORITIES.critical, title: 'Rupture de stock', message: 'Out',
        entityType: 'ingredient', entityId: 15, dedupKey: outKey,
      });

      // Emit STOCK_RECOVERED
      eventBus.emit(Events.STOCK_RECOVERED, {
        tenantId: TENANT_ID, ingredientId: 15,
        ingredientName: 'Test', remainingQty: '100', unit: 'kg',
        departmentName: 'Cuisine', departmentId: 2,
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      // All three should be deactivated
      expect(await findActiveNotificationByDedupKey(TENANT_ID, lowKey)).toBeNull();
      expect(await findActiveNotificationByDedupKey(TENANT_ID, criticalKey)).toBeNull();
      expect(await findActiveNotificationByDedupKey(TENANT_ID, outKey)).toBeNull();
    });

    it('should not deactivate notifications for other ingredients on recovery', async () => {
      const keyIngredient5 = 'stock_low:1:ingredient:5:dept2';
      const keyIngredient10 = 'stock_low:1:ingredient:10:dept2';

      await createNotification({
        tenantId: TENANT_ID, type: 'warning', category: CATEGORIES.inventory,
        priority: PRIORITIES.high, title: 'Stock bas', message: 'Ingrédient 5 bas',
        entityType: 'ingredient', entityId: 5, dedupKey: keyIngredient5,
      });
      await createNotification({
        tenantId: TENANT_ID, type: 'warning', category: CATEGORIES.inventory,
        priority: PRIORITIES.high, title: 'Stock bas', message: 'Ingrédient 10 bas',
        entityType: 'ingredient', entityId: 10, dedupKey: keyIngredient10,
      });

      // Recover ingredient 5 ONLY
      eventBus.emit(Events.STOCK_RECOVERED, {
        tenantId: TENANT_ID, ingredientId: 5,
        ingredientName: 'Ingrédient 5', remainingQty: '100', unit: 'kg',
        departmentName: 'Cuisine', departmentId: 2,
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      // Ingredient 5 should be deactivated
      expect(await findActiveNotificationByDedupKey(TENANT_ID, keyIngredient5)).toBeNull();
      // Ingredient 10 should still be active
      expect(await findActiveNotificationByDedupKey(TENANT_ID, keyIngredient10)).not.toBeNull();
    });
  });

  // ────────────────────────────────────────────
  // cleanupExpiredNotifications
  // ────────────────────────────────────────────

  describe('cleanupExpiredNotifications', () => {
    it('should archive expired notifications', async () => {
      // Create a notification that expired in the past
      await createNotification({
        tenantId: TENANT_ID,
        type: 'warning',
        category: CATEGORIES.inventory,
        priority: PRIORITIES.high,
        title: 'Expired alert',
        message: 'This should be cleaned up',
        entityType: 'ingredient',
        entityId: 5,
        expiresAt: '2020-01-01T00:00:00.000Z', // Definitely expired
      });

      // Create a non-expired notification (no expires_at)
      await createNotification({
        tenantId: TENANT_ID,
        type: 'warning',
        category: CATEGORIES.inventory,
        priority: PRIORITIES.high,
        title: 'Active alert',
        message: 'This should remain',
        entityType: 'ingredient',
        entityId: 10,
      });

      const cleanupCount = await cleanupExpiredNotifications();
      expect(cleanupCount).toBe(1);

      // Expired notification should now be archived in demoDb
      const expiredNotif = (demoDb as any).notifications.find(
        (n: any) => n.title === 'Expired alert'
      );
      expect(expiredNotif.archived).toBe(true);

      // Active notification should still be unarchived
      const activeNotif = (demoDb as any).notifications.find(
        (n: any) => n.title === 'Active alert'
      );
      expect(activeNotif.archived).toBe(false);
    });

    it('should not touch notifications without expires_at', async () => {
      await createNotification({
        tenantId: TENANT_ID,
        type: 'information',
        category: CATEGORIES.general,
        priority: PRIORITIES.low,
        title: 'No expiry',
        message: 'This never expires',
      });

      const cleanupCount = await cleanupExpiredNotifications();
      expect(cleanupCount).toBe(0);

      const notif = (demoDb as any).notifications.find(
        (n: any) => n.title === 'No expiry'
      );
      expect(notif.archived).toBe(false);
    });

    it('should not archive notifications with future expires_at', async () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      await createNotification({
        tenantId: TENANT_ID,
        type: 'information',
        category: CATEGORIES.general,
        priority: PRIORITIES.low,
        title: 'Future expiry',
        message: 'This is still valid',
        expiresAt: futureDate.toISOString(),
      });

      const cleanupCount = await cleanupExpiredNotifications();
      expect(cleanupCount).toBe(0);

      const notif = (demoDb as any).notifications.find(
        (n: any) => n.title === 'Future expiry'
      );
      expect(notif.archived).toBe(false);
    });

    it('should be idempotent — second call returns 0', async () => {
      await createNotification({
        tenantId: TENANT_ID,
        type: 'warning',
        category: CATEGORIES.inventory,
        priority: PRIORITIES.high,
        title: 'Expired',
        message: 'Test',
        expiresAt: '2020-01-01T00:00:00.000Z',
      });

      const firstCall = await cleanupExpiredNotifications();
      expect(firstCall).toBe(1);

      const secondCall = await cleanupExpiredNotifications();
      expect(secondCall).toBe(0); // Already archived
    });
  });

  // ────────────────────────────────────────────
  // Read state (demo mode uses shared n.read)
  // NOTE: In demo mode, read state is SHARED across all users.
  // Per-user read state via `notification_reads` table only works in PostgreSQL mode.
  // ────────────────────────────────────────────

  describe('read state (demo mode)', () => {
    it('should return unread count > 0 for new notifications', async () => {
      await createNotification({
        tenantId: TENANT_ID,
        type: 'warning',
        category: CATEGORIES.inventory,
        priority: PRIORITIES.high,
        title: 'New alert',
        message: 'Unread test',
      });

      const count = await getUnreadCount(TENANT_ID, USER_ID);
      expect(count).toBeGreaterThanOrEqual(1);
    });

    it('should return 0 unread after marking as read', async () => {
      const notif = await createNotification({
        tenantId: TENANT_ID,
        type: 'warning',
        category: CATEGORIES.inventory,
        priority: PRIORITIES.high,
        title: 'Read alert',
        message: 'Mark as read test',
      });

      const marked = await markAsRead(notif.id, TENANT_ID, USER_ID);
      expect(marked).not.toBeNull();

      const count = await getUnreadCount(TENANT_ID, USER_ID);
      expect(count).toBe(0);
    });

    it('should set read globally in demo mode (shared n.read)', async () => {
      const notif = await createNotification({
        tenantId: TENANT_ID,
        type: 'warning',
        category: CATEGORIES.inventory,
        priority: PRIORITIES.high,
        title: 'Shared alert',
        message: 'Global read test',
      });

      // User 1 marks as read — sets n.read = true globally in demo mode
      await markAsRead(notif.id, TENANT_ID, USER_ID);
      expect(await getUnreadCount(TENANT_ID, USER_ID)).toBe(0);

      // In demo mode, user 2 also sees it as read (shared state)
      expect(await getUnreadCount(TENANT_ID, 2)).toBe(0);
    });

    it('should mark all notifications as read', async () => {
      await createNotification({
        tenantId: TENANT_ID, type: 'warning', category: CATEGORIES.inventory,
        priority: PRIORITIES.high, title: 'Alert 1', message: 'Test 1',
      });
      await createNotification({
        tenantId: TENANT_ID, type: 'information', category: CATEGORIES.general,
        priority: PRIORITIES.low, title: 'Alert 2', message: 'Test 2',
      });

      // Mark all as read
      const markedCount = await markAllAsRead(TENANT_ID, USER_ID);
      expect(markedCount).toBe(2);

      // All users see 0 unread in demo mode (shared state)
      expect(await getUnreadCount(TENANT_ID, USER_ID)).toBe(0);
      expect(await getUnreadCount(TENANT_ID, 2)).toBe(0);
    });
  });

  // ────────────────────────────────────────────
  // Full flow integration: low stock → recover → re-low
  // ────────────────────────────────────────────

  describe('full lifecycle: low → recovered → low again', () => {
    beforeEach(() => {
      eventBus.removeAllListeners(Events.STOCK_RECOVERED);
      eventBus.removeAllListeners(Events.STOCK_LOW);
      eventBus.removeAllListeners(Events.STOCK_OUT);
      eventBus.removeAllListeners(Events.STOCK_CRITICAL);
      setupNotificationDispatcher();
    });

    it('should create, recover, and re-create notifications across a stock lifecycle', async () => {
      const dedupKey = 'stock_low:1:ingredient:20:dept2';

      // Step 1: Stock goes low — notification created
      await createNotification({
        tenantId: TENANT_ID, type: 'warning', category: CATEGORIES.inventory,
        priority: PRIORITIES.high, title: 'Stock bas', message: 'First low',
        entityType: 'ingredient', entityId: 20, dedupKey,
      });
      expect(await findActiveNotificationByDedupKey(TENANT_ID, dedupKey)).not.toBeNull();
      expect((demoDb as any).notifications.length).toBe(1);

      // Step 2: Stock recovers — notification deactivated
      eventBus.emit(Events.STOCK_RECOVERED, {
        tenantId: TENANT_ID, ingredientId: 20,
        ingredientName: 'Test', remainingQty: '100', unit: 'kg',
        departmentName: 'Cuisine', departmentId: 2,
      });
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(await findActiveNotificationByDedupKey(TENANT_ID, dedupKey)).toBeNull();

      // Still 1 notification in total (just archived)
      expect((demoDb as any).notifications.length).toBe(1);

      // Step 3: Stock goes low again — NEW notification created
      await createNotification({
        tenantId: TENANT_ID, type: 'warning', category: CATEGORIES.inventory,
        priority: PRIORITIES.high, title: 'Stock bas (again)', message: 'Second low',
        entityType: 'ingredient', entityId: 20, dedupKey,
      });
      expect(await findActiveNotificationByDedupKey(TENANT_ID, dedupKey)).not.toBeNull();
      expect((demoDb as any).notifications.length).toBe(2);

      // The new notification has the updated title
      const found = await findActiveNotificationByDedupKey(TENANT_ID, dedupKey);
      expect(found.title).toBe('Stock bas (again)');
    });
  });
});
