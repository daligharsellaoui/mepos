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

function getUsersForRole(tenantId: number, minRole: string): any[] {
  if (isDemoMode) {
    return (demoDb.users || []).filter((u: any) =>
      u.tenant_id === tenantId && roleHasAccess(u.role, minRole)
    );
  }
  return []; 
}

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
}): Promise<any> {
  const {
    tenantId, type, category, priority, title, message,
    icon, color, entityType, entityId, createdBy, assignedTo,
    actionUrl, metadata, minRole,
  } = params;

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
      entity_type, entity_id, created_by, assigned_to, action_url, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING *`,
    [
      tenantId, type, category, priority, title, message || '',
      resolvedIcon, resolvedColor, entityType || null, entityId || null,
      createdBy || null, assignedTo || null, actionUrl || null,
      JSON.stringify(metadata || {}),
    ]
  );

  const notif = result.rows[0];
  eventBus.emit('notification:created', { notification: notif, minRole });
  return notif;
}

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

  let sql = 'SELECT * FROM notifications WHERE tenant_id = $1';
  const params: any[] = [tenantId];
  let paramIdx = 2;
  const conditions: string[] = [];

  if (read !== undefined) {
    conditions.push(`read = $${paramIdx++}`);
    params.push(read);
  }
  if (archived !== undefined) {
    conditions.push(`archived = $${paramIdx++}`);
    params.push(archived);
  }
  if (types && types.length > 0) {
    conditions.push(`type = ANY($${paramIdx++})`);
    params.push(types);
  }
  if (categories && categories.length > 0) {
    conditions.push(`category = ANY($${paramIdx++})`);
    params.push(categories);
  }
  if (priorities && priorities.length > 0) {
    conditions.push(`priority = ANY($${paramIdx++})`);
    params.push(priorities);
  }
  if (search) {
    conditions.push(`(title ILIKE $${paramIdx} OR message ILIKE $${paramIdx})`);
    params.push(`%${search}%`);
    paramIdx++;
  }

  conditions.push(`(assigned_to IS NULL OR assigned_to = $${paramIdx++})`);
  params.push(userId);

  if (conditions.length > 0) {
    sql += ' AND ' + conditions.join(' AND ');
  }

  const allowedSorts = ['created_at', 'priority', 'type', 'title'];
  const safeSort = allowedSorts.includes(sortBy) ? sortBy : 'created_at';
  const safeOrder = sortOrder === 'asc' ? 'ASC' : 'DESC';
  sql += ` ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END, ${safeSort} ${safeOrder}`;
  sql += ` LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
  params.push(limit, offset);

  const result = await query(sql, params);

  const countResult = await query(
    `SELECT COUNT(*) FROM notifications WHERE tenant_id = $1 AND (assigned_to IS NULL OR assigned_to = $2)`,
    [tenantId, userId]
  );

  return { data: result.rows, total: parseInt(countResult.rows[0]?.count || '0', 10) };
}

export async function getUnreadCount(tenantId: number, userId: number): Promise<number> {
  if (isDemoMode) {
    return ((demoDb as any).notifications || []).filter(
      (n: any) => n.tenant_id === tenantId && !n.read && (!n.assigned_to || n.assigned_to === userId)
    ).length;
  }

  const result = await query(
    `SELECT COUNT(*) FROM notifications
     WHERE tenant_id = $1 AND read = FALSE
       AND (assigned_to IS NULL OR assigned_to = $2)`,
    [tenantId, userId]
  );
  return parseInt(result.rows[0]?.count || '0', 10);
}

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

  const result = await query(
    `UPDATE notifications SET read = TRUE, read_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND tenant_id = $2 AND (assigned_to IS NULL OR assigned_to = $3)
     RETURNING *`,
    [notifId, tenantId, userId]
  );
  return result.rows[0] || null;
}

export async function markAllAsRead(tenantId: number, userId: number): Promise<number> {
  if (isDemoMode) {
    const notifs = ((demoDb as any).notifications || []).filter(
      (n: any) => n.tenant_id === tenantId && !n.read && (!n.assigned_to || n.assigned_to === userId)
    );
    notifs.forEach((n: any) => { n.read = true; n.read_at = new Date().toISOString(); });
    return notifs.length;
  }

  const result = await query(
    `UPDATE notifications SET read = TRUE, read_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE tenant_id = $1 AND read = FALSE AND (assigned_to IS NULL OR assigned_to = $2)`,
    [tenantId, userId]
  );
  return result.rowCount || 0;
}

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

eventBus.on('notification:created', ({ notification, minRole }: { notification: any; minRole?: string }) => {
  if (minRole && !isDemoMode) {
    query(
      `UPDATE notifications SET assigned_to = subq.id FROM (
         SELECT id FROM users WHERE tenant_id = $1 AND role IN ($2)
       ) subq WHERE id = $3`,
      [notification.tenant_id, minRole, notification.id]
    ).catch(() => {});
  }
});
