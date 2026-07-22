import { query, isDemoMode, demoDb } from '../database';
import { eventBus, Events } from './event.service';

export const CATEGORIES = {
  inventory: 'inventory',
  synchronization: 'synchronization',
  agent: 'agent',
  warehouse: 'warehouse',
  purchase: 'purchase',
  transfer: 'transfer',
  recipe: 'recipe',
  authentication: 'authentication',
  administration: 'administration',
  reports: 'reports',
  security: 'security',
  general: 'general',
} as const;

export const PRIORITIES = {
  low: 'low',
  medium: 'medium',
  high: 'high',
  critical: 'critical',
} as const;

export const NOTIFICATION_TYPES = {
  information: 'information',
  success: 'success',
  warning: 'warning',
  error: 'error',
  critical: 'critical',
  system: 'system',
  synchronization: 'synchronization',
  inventory: 'inventory',
  transfer: 'transfer',
  purchase: 'purchase',
  recipe: 'recipe',
  loss: 'loss',
  security: 'security',
  user: 'user',
  settings: 'settings',
} as const;

const ROLE_HIERARCHY: Record<string, number> = {
  platform_admin: 4,
  admin: 3,
  manager: 2,
  cook: 1,
};

function roleHasAccess(userRole: string, minRole: string): boolean {
  return (ROLE_HIERARCHY[userRole] || 0) >= (ROLE_HIERARCHY[minRole] || 0);
}

/**
 * FIXED: Now queries database for PostgreSQL mode instead of returning empty array.
 * Returns users with role >= minRole within a tenant.
 */
export async function getUsersForRole(tenantId: number, minRole: string): Promise<any[]> {
  if (isDemoMode) {
    return (demoDb.users || []).filter((u: any) =>
      u.tenant_id === tenantId && roleHasAccess(u.role, minRole)
    );
  }

  const matchedRoles = rolesAtOrAbove(minRole);
  if (matchedRoles.length === 0) return [];

  const result = await query(
    `SELECT id, role FROM users WHERE tenant_id = $1 AND role = ANY($2::text[]) AND is_active = TRUE`,
    [tenantId, matchedRoles]
  );
  return result.rows;
}

// ──────────────────────────────────────────────
// GENERATE DEDUP KEY
// ──────────────────────────────────────────────

/**
 * Build a deterministic dedup key for notification deduplication.
 * Format: "{event_type}:{tenant_id}:{entity_type}:{entity_id}"
 * Example: "stock_low:1:ingredient:42:department:2"
 */
export function buildDedupKey(
  eventType: string,
  tenantId: number,
  entityType?: string,
  entityId?: number | null,
  extra?: string
): string {
  let key = `${eventType}:${tenantId}`;
  if (entityType) key += `:${entityType}`;
  if (entityId != null) key += `:${entityId}`;
  if (extra) key += `:${extra}`;
  return key;
}

/**
 * Check if an active (non-archived, non-expired) notification exists with the given dedup_key.
 */
export async function findActiveNotificationByDedupKey(
  tenantId: number,
  dedupKey: string
): Promise<any | null> {
  if (isDemoMode) {
    return ((demoDb as any).notifications || []).find(
      (n: any) =>
        n.tenant_id === tenantId &&
        n.dedup_key === dedupKey &&
        !n.archived
    ) || null;
  }

  const result = await query(
    `SELECT * FROM notifications
     WHERE tenant_id = $1 AND dedup_key = $2 AND archived = FALSE
       AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
     LIMIT 1`,
    [tenantId, dedupKey]
  );
  return result.rows[0] || null;
}

/**
 * Deactivate (mark archived) notifications matching a dedup_key pattern.
 * Used for recovery events (e.g., stock replenished → deactivate stock_low notifications).
 * Returns count of deactivated notifications.
 */
export async function deactivateNotificationsByDedupKey(
  tenantId: number,
  dedupKeyPrefix: string
): Promise<number> {
  if (isDemoMode) {
    const matched = ((demoDb as any).notifications || []).filter(
      (n: any) =>
        n.tenant_id === tenantId &&
        n.dedup_key &&
        n.dedup_key.startsWith(dedupKeyPrefix) &&
        !n.archived
    );
    matched.forEach((n: any) => { n.archived = true; n.updated_at = new Date().toISOString(); });
    return matched.length;
  }

  const result = await query(
    `UPDATE notifications SET archived = TRUE, updated_at = CURRENT_TIMESTAMP
     WHERE tenant_id = $1 AND dedup_key LIKE $2 AND archived = FALSE
       AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`,
    [tenantId, `${dedupKeyPrefix}%`]
  );
  return result.rowCount || 0;
}

// ──────────────────────────────────────────────
// CREATE NOTIFICATION (with dedup)
// ──────────────────────────────────────────────

export async function createNotification(params: {
  tenantId: number;
  type: string;
  category: string;
  priority: string;
  title: string;
  message?: string;
  icon?: string;
  color?: string;
  entityType?: string;
  entityId?: number;
  createdBy?: number | null;
  assignedTo?: number | null;
  actionUrl?: string;
  metadata?: Record<string, any>;
  minRole?: string;
  dedupKey?: string;
  expiresAt?: string;
}): Promise<any | null> {
  const {
    tenantId, type, category, priority, title, message,
    icon, color, entityType, entityId, createdBy, assignedTo,
    actionUrl, metadata, minRole, dedupKey, expiresAt,
  } = params;

  // ── DEDUP CHECK ──
  if (dedupKey) {
    const existing = await findActiveNotificationByDedupKey(tenantId, dedupKey);
    if (existing) {
      return existing;
    }
  }

  const typeColors: Record<string, string> = {
    information: '#3b82f6',
    success: '#10b981',
    warning: '#f59e0b',
    error: '#ef4444',
    critical: '#dc2626',
    system: '#6366f1',
    synchronization: '#8b5cf6',
    inventory: '#06b6d4',
    transfer: '#f97316',
    purchase: '#22c55e',
    recipe: '#a855f7',
    loss: '#ef4444',
    security: '#e11d48',
    user: '#6366f1',
    settings: '#64748b',
  };

  const typeIcons: Record<string, string> = {
    information: 'info',
    success: 'check-circle',
    warning: 'alert-triangle',
    error: 'x-circle',
    critical: 'alert-octagon',
    system: 'settings',
    synchronization: 'refresh-cw',
    inventory: 'package',
    transfer: 'arrow-left-right',
    purchase: 'shopping-cart',
    recipe: 'book-open',
    loss: 'trash-2',
    security: 'shield',
    user: 'user',
    settings: 'sliders',
  };

  const resolvedColor = color || typeColors[type] || '#64748b';
  const resolvedIcon = icon || typeIcons[type] || 'bell';

  const notification = {
    tenant_id: tenantId,
    type,
    category,
    priority,
    title,
    message: message || '',
    icon: resolvedIcon,
    color: resolvedColor,
    entity_type: entityType || null,
    entity_id: entityId || null,
    created_by: createdBy || null,
    assigned_to: assignedTo || null,
    read: false,
    read_at: null,
    archived: false,
    action_url: actionUrl || null,
    metadata: metadata || {},
    dedup_key: dedupKey || null,
    expires_at: expiresAt || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (isDemoMode) {
    if (!demoDb.notifications) {
      (demoDb as any).notifications = [];
    }
    const notif = {
      id: (demoDb as any).notifications.length + 1,
      ...notification,
    };
    (demoDb as any).notifications.push(notif);

    eventBus.emit('notification:created', { notification: notif, minRole });
    return notif;
  }

  const result = await query(
    `INSERT INTO notifications (tenant_id, type, category, priority, title, message, icon, color,
      entity_type, entity_id, created_by, assigned_to, action_url, metadata, dedup_key, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     RETURNING *`,
    [
      tenantId, type, category, priority, title, message || '',
      resolvedIcon, resolvedColor, entityType || null, entityId || null,
      createdBy || null, assignedTo || null, actionUrl || null,
      JSON.stringify(metadata || {}), dedupKey || null, expiresAt || null,
    ]
  );

  const notif = result.rows[0];
  eventBus.emit('notification:created', { notification: notif, minRole });

  return notif;
}

// ──────────────────────────────────────────────
// GET NOTIFICATIONS (with per-user read state)
// ──────────────────────────────────────────────

export async function getNotifications(
  tenantId: number,
  userId: number,
  options: {
    types?: string[];
    categories?: string[];
    priorities?: string[];
    read?: boolean;
    archived?: boolean;
    search?: string;
    limit?: number;
    offset?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  } = {}
): Promise<{ data: any[]; total: number }> {
  const {
    types, categories, priorities, read, archived, search,
    limit = 50, offset = 0, sortBy = 'created_at', sortOrder = 'desc',
  } = options;

  if (isDemoMode) {
    const notifs = ((demoDb as any).notifications || [])
      .filter((n: any) => n.tenant_id === tenantId)
      .filter((n: any) => {
        if (read !== undefined && n.read !== read) return false;
        if (archived !== undefined && n.archived !== archived) return false;
        if (types && types.length > 0 && !types.includes(n.type)) return false;
        if (categories && categories.length > 0 && !categories.includes(n.category)) return false;
        if (priorities && priorities.length > 0 && !priorities.includes(n.priority)) return false;
        if (search) {
          const q = search.toLowerCase();
          if (!n.title.toLowerCase().includes(q) && !(n.message || '').toLowerCase().includes(q)) return false;
        }
        if (n.assigned_to && n.assigned_to !== userId) return false;
        if (!n.assigned_to) return true;
        return true;
      })
      .sort((a: any, b: any) => {
        const aVal = a[sortBy] || '';
        const bVal = b[sortBy] || '';
        const cmp = typeof aVal === 'string' ? aVal.localeCompare(bVal) : aVal - bVal;
        return sortOrder === 'desc' ? -cmp : cmp;
      });

    const total = notifs.length;
    const data = notifs.slice(offset, offset + limit);
    return { data, total };
  }

  // PG mode: LEFT JOIN with notification_reads for per-user read state
  let paramIdx = 1;
  const params: any[] = [tenantId, userId];
  paramIdx = 3;

  const conditions: string[] = [
    `(n.assigned_to IS NULL OR n.assigned_to = $2)`
  ];

  if (archived !== undefined) {
    conditions.push(`n.archived = $${paramIdx++}`);
    params.push(archived);
  } else {
    conditions.push('n.archived = FALSE');
  }

  if (read !== undefined) {
    // Per-user read status via LEFT JOIN (notification_reads is single source of truth)
    if (read === true) {
      conditions.push(`nr.id IS NOT NULL`);
    } else {
      conditions.push(`nr.id IS NULL`);
    }
  }

  if (types && types.length > 0) {
    conditions.push(`n.type = ANY($${paramIdx++})`);
    params.push(types);
  }
  if (categories && categories.length > 0) {
    conditions.push(`n.category = ANY($${paramIdx++})`);
    params.push(categories);
  }
  if (priorities && priorities.length > 0) {
    conditions.push(`n.priority = ANY($${paramIdx++})`);
    params.push(priorities);
  }
  if (search) {
    conditions.push(`(n.title ILIKE $${paramIdx} OR n.message ILIKE $${paramIdx})`);
    params.push(`%${search}%`);
    paramIdx++;
  }

  const whereClause = conditions.length > 0 ? ' AND ' + conditions.join(' AND ') : '';

  const allowedSorts = ['created_at', 'priority', 'type', 'title'];
  const safeSort = allowedSorts.includes(sortBy) ? sortBy : 'created_at';
  const safeOrder = sortOrder === 'asc' ? 'ASC' : 'DESC';

  const filterParamCount = params.length;

  const sql = `
    SELECT n.*,
           CASE WHEN nr.id IS NOT NULL THEN TRUE ELSE FALSE END as user_read,
           nr.read_at as user_read_at
    FROM notifications n
    LEFT JOIN notification_reads nr
      ON nr.notification_id = n.id AND nr.user_id = $2
    WHERE n.tenant_id = $1${whereClause}
    ORDER BY
      CASE n.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END,
      n.${safeSort} ${safeOrder}
    LIMIT $${paramIdx++} OFFSET $${paramIdx++}
  `;
  params.push(limit, offset);

  const result = await query(sql, params);

  const countResult = await query(
    `SELECT COUNT(*) FROM notifications n
     LEFT JOIN notification_reads nr
       ON nr.notification_id = n.id AND nr.user_id = $2
     WHERE n.tenant_id = $1${whereClause}`,
    params.slice(0, filterParamCount)
  );

  return { data: result.rows, total: parseInt(countResult.rows[0]?.count || '0', 10) };
}

// ──────────────────────────────────────────────
// GET UNREAD COUNT (per-user via notification_reads)
// ──────────────────────────────────────────────

export async function getUnreadCount(tenantId: number, userId: number): Promise<number> {
  if (isDemoMode) {
    return ((demoDb as any).notifications || []).filter(
      (n: any) => n.tenant_id === tenantId && !n.read && (!n.assigned_to || n.assigned_to === userId)
    ).length;
  }

  const result = await query(
    `SELECT COUNT(*) FROM notifications n
     LEFT JOIN notification_reads nr
       ON nr.notification_id = n.id AND nr.user_id = $2
     WHERE n.tenant_id = $1
       AND n.archived = FALSE
       AND (n.assigned_to IS NULL OR n.assigned_to = $2)
       AND (n.expires_at IS NULL OR n.expires_at > CURRENT_TIMESTAMP)
       AND nr.id IS NULL`,
    [tenantId, userId]
  );
  return parseInt(result.rows[0]?.count || '0', 10);
}

// ──────────────────────────────────────────────
// MARK AS READ (per-user via notification_reads)
// ──────────────────────────────────────────────

export async function markAsRead(notifId: number, tenantId: number, userId: number): Promise<any | null> {
  if (isDemoMode) {
    const notif = ((demoDb as any).notifications || []).find(
      (n: any) => n.id === notifId && n.tenant_id === tenantId
    );
    if (!notif) return null;
    notif.read = true;
    notif.read_at = new Date().toISOString();
    return notif;
  }

  // Verify notification exists
  const notifResult = await query(
    'SELECT id, read FROM notifications WHERE id = $1 AND tenant_id = $2',
    [notifId, tenantId]
  );
  if (notifResult.rows.length === 0) return null;

  // Insert into notification_reads (per-user read tracking — single source of truth)
  await query(
    `INSERT INTO notification_reads (tenant_id, user_id, notification_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (tenant_id, user_id, notification_id) DO NOTHING`,
    [tenantId, userId, notifId]
  );

  return notifResult.rows[0];
}

// ──────────────────────────────────────────────
// MARK ALL AS READ (per-user via notification_reads)
// ──────────────────────────────────────────────

export async function markAllAsRead(tenantId: number, userId: number): Promise<number> {
  if (isDemoMode) {
    const notifs = ((demoDb as any).notifications || []).filter(
      (n: any) => n.tenant_id === tenantId && !n.read && (!n.assigned_to || n.assigned_to === userId)
    );
    notifs.forEach((n: any) => { n.read = true; n.read_at = new Date().toISOString(); });
    return notifs.length;
  }

  // Find all unseen notifications for this user
  const result = await query(
    `SELECT n.id FROM notifications n
     LEFT JOIN notification_reads nr
       ON nr.notification_id = n.id AND nr.user_id = $2
     WHERE n.tenant_id = $1
       AND n.archived = FALSE
       AND (n.assigned_to IS NULL OR n.assigned_to = $2)
       AND nr.id IS NULL`,
    [tenantId, userId]
  );

  if (result.rows.length === 0) return 0;

  const ids = result.rows.map((r: any) => r.id);

  // Batch insert into notification_reads using unnest for parameterized query
  await query(
    `INSERT INTO notification_reads (tenant_id, user_id, notification_id)
     SELECT $1::int, $2::int, unnest($3::int[])
     ON CONFLICT (tenant_id, user_id, notification_id) DO NOTHING`,
    [tenantId, userId, ids]
  );

  return ids.length;
}

// ──────────────────────────────────────────────
// ARCHIVE / DELETE
// ──────────────────────────────────────────────

export async function archiveNotification(notifId: number, tenantId: number): Promise<any | null> {
  if (isDemoMode) {
    const notif = ((demoDb as any).notifications || []).find(
      (n: any) => n.id === notifId && n.tenant_id === tenantId
    );
    if (!notif) return null;
    notif.archived = true;
    return notif;
  }

  const result = await query(
    `UPDATE notifications SET archived = TRUE, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND tenant_id = $2 RETURNING *`,
    [notifId, tenantId]
  );
  return result.rows[0] || null;
}

export async function deleteNotification(notifId: number, tenantId: number): Promise<boolean> {
  if (isDemoMode) {
    const idx = ((demoDb as any).notifications || []).findIndex(
      (n: any) => n.id === notifId && n.tenant_id === tenantId
    );
    if (idx === -1) return false;
    (demoDb as any).notifications.splice(idx, 1);
    return true;
  }

  const result = await query(
    'DELETE FROM notifications WHERE id = $1 AND tenant_id = $2 RETURNING id',
    [notifId, tenantId]
  );
  return result.rows.length > 0;
}

// ──────────────────────────────────────────────
// NOTIFICATION PREFERENCES
// ──────────────────────────────────────────────

export async function getUserPreferences(tenantId: number, userId: number): Promise<any[]> {
  if (isDemoMode) {
    return ((demoDb as any).notification_preferences || []).filter(
      (p: any) => p.tenant_id === tenantId && p.user_id === userId
    );
  }

  const result = await query(
    'SELECT * FROM notification_preferences WHERE tenant_id = $1 AND user_id = $2',
    [tenantId, userId]
  );
  return result.rows;
}

export async function setUserPreference(
  tenantId: number,
  userId: number,
  category: string,
  prefs: { enabled?: boolean; muted?: boolean; critical_only?: boolean; desktop?: boolean; sound?: boolean }
): Promise<any> {
  const { enabled, muted, critical_only, desktop, sound } = prefs;

  if (isDemoMode) {
    if (!(demoDb as any).notification_preferences) {
      (demoDb as any).notification_preferences = [];
    }
    const existing = ((demoDb as any).notification_preferences || []).find(
      (p: any) => p.tenant_id === tenantId && p.user_id === userId && p.category === category
    );
    if (existing) {
      if (enabled !== undefined) existing.enabled = enabled;
      if (muted !== undefined) existing.muted = muted;
      if (critical_only !== undefined) existing.critical_only = critical_only;
      if (desktop !== undefined) existing.desktop = desktop;
      if (sound !== undefined) existing.sound = sound;
      return existing;
    }
    const pref = {
      id: ((demoDb as any).notification_preferences || []).length + 1,
      tenant_id: tenantId,
      user_id: userId,
      category,
      enabled: enabled !== undefined ? enabled : true,
      muted: muted || false,
      critical_only: critical_only || false,
      desktop: desktop !== undefined ? desktop : true,
      sound: sound || false,
    };
    (demoDb as any).notification_preferences.push(pref);
    return pref;
  }

  const result = await query(
    `INSERT INTO notification_preferences (tenant_id, user_id, category, enabled, muted, critical_only, desktop, sound)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (tenant_id, user_id, category)
     DO UPDATE SET
       enabled = COALESCE($4, notification_preferences.enabled),
       muted = COALESCE($5, notification_preferences.muted),
       critical_only = COALESCE($6, notification_preferences.critical_only),
       desktop = COALESCE($7, notification_preferences.desktop),
       sound = COALESCE($8, notification_preferences.sound),
       updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [
      tenantId, userId, category,
      enabled !== undefined ? enabled : true,
      muted || false,
      critical_only || false,
      desktop !== undefined ? desktop : true,
      sound || false,
    ]
  );
  return result.rows[0];
}

// ──────────────────────────────────────────────
// EXPIRATION CLEANUP
// ──────────────────────────────────────────────

/**
 * Archive all expired notifications.
 * Should be called from a scheduled job.
 */
export async function cleanupExpiredNotifications(): Promise<number> {
  if (isDemoMode) {
    const now = new Date().toISOString();
    const expired = ((demoDb as any).notifications || []).filter(
      (n: any) => n.expires_at && n.expires_at < now && !n.archived
    );
    expired.forEach((n: any) => { n.archived = true; });
    return expired.length;
  }

  const result = await query(
    `UPDATE notifications SET archived = TRUE, updated_at = CURRENT_TIMESTAMP
     WHERE expires_at IS NOT NULL AND expires_at < CURRENT_TIMESTAMP AND archived = FALSE`
  );
  return result.rowCount || 0;
}

// ──────────────────────────────────────────────
// ROLE-BASED DISTRIBUTION HANDLER
// ──────────────────────────────────────────────

function rolesAtOrAbove(minRole: string): string[] {
  const min = ROLE_HIERARCHY[minRole];
  if (min === undefined) return [];
  return Object.entries(ROLE_HIERARCHY)
    .filter(([_, level]) => level >= min)
    .map(([role]) => role);
}

eventBus.on('notification:created', async ({ notification, minRole }: { notification: any; minRole?: string }) => {
  const effectiveMinRole = minRole || (notification.assigned_to ? undefined : 'cook');

  if (!effectiveMinRole) return;

  const matchedRoles = rolesAtOrAbove(effectiveMinRole);
  if (matchedRoles.length === 0) return;

  if (isDemoMode) {
    const targetUsers = (demoDb.users || []).filter((u: any) =>
      u.tenant_id === notification.tenant_id && matchedRoles.includes(u.role)
    );
    for (const user of targetUsers) {
      const userNotif = {
        ...notification,
        id: ((demoDb as any).notifications?.length || 0) + 1,
        assigned_to: user.id,
        read: false,
        read_at: null,
        archived: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      (demoDb as any).notifications.push(userNotif);
    }
    const idx = ((demoDb as any).notifications || []).findIndex((n: any) => n.id === notification.id);
    if (idx !== -1) (demoDb as any).notifications.splice(idx, 1);
    return;
  }

  try {
    const result = await query(
      `INSERT INTO notifications (tenant_id, type, category, priority, title, message, icon, color,
        entity_type, entity_id, created_by, assigned_to, action_url, metadata, read, archived, created_at, updated_at)
       SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, u.id, $12, $13, FALSE, FALSE, NOW(), NOW()
       FROM users u WHERE u.tenant_id = $14 AND u.role = ANY($15::text[]) AND u.is_active = TRUE`,
      [
        notification.tenant_id, notification.type, notification.category, notification.priority,
        notification.title, notification.message, notification.icon, notification.color,
        notification.entity_type, notification.entity_id, notification.created_by,
        notification.action_url, JSON.stringify(notification.metadata || {}),
        notification.tenant_id, matchedRoles
      ]
    );
    if (result.rowCount && result.rowCount > 0) {
      await query('DELETE FROM notifications WHERE id = $1', [notification.id]);
    }
  } catch (_) {
    // silent - notification remains visible to all if duplication fails
  }
});
