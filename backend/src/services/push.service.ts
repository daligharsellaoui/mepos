import webPush from 'web-push';
import { query, isDemoMode, demoDb } from '../database';

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@mepos.app';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

export function getVapidPublicKey(): string {
  if (VAPID_PUBLIC_KEY) return VAPID_PUBLIC_KEY;
  const keys = webPush.generateVAPIDKeys();
  return keys.publicKey;
}

export async function subscribe(
  tenantId: number,
  userId: number,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  userAgent?: string
): Promise<void> {
  const { endpoint, keys } = subscription;

  if (isDemoMode) {
    if (!(demoDb as any).push_subscriptions) {
      (demoDb as any).push_subscriptions = [];
    }
    const existing = ((demoDb as any).push_subscriptions || []).findIndex(
      (s: any) => s.tenant_id === tenantId && s.user_id === userId && s.endpoint === endpoint
    );
    if (existing >= 0) {
      (demoDb as any).push_subscriptions[existing] = {
        ...(demoDb as any).push_subscriptions[existing],
        p256dh: keys.p256dh,
        auth: keys.auth,
        user_agent: userAgent || null,
        updated_at: new Date().toISOString(),
      };
    } else {
      (demoDb as any).push_subscriptions.push({
        id: ((demoDb as any).push_subscriptions || []).length + 1,
        tenant_id: tenantId,
        user_id: userId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        user_agent: userAgent || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
    return;
  }

  await query(
    `INSERT INTO push_subscriptions (tenant_id, user_id, endpoint, p256dh, auth, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (tenant_id, user_id, endpoint)
     DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
                   user_agent = EXCLUDED.user_agent, updated_at = CURRENT_TIMESTAMP`,
    [tenantId, userId, endpoint, keys.p256dh, keys.auth, userAgent || null]
  );
}

export async function unsubscribe(
  tenantId: number,
  userId: number,
  endpoint: string
): Promise<void> {
  if (isDemoMode) {
    (demoDb as any).push_subscriptions = ((demoDb as any).push_subscriptions || []).filter(
      (s: any) => !(s.tenant_id === tenantId && s.user_id === userId && s.endpoint === endpoint)
    );
    return;
  }

  await query(
    'DELETE FROM push_subscriptions WHERE tenant_id = $1 AND user_id = $2 AND endpoint = $3',
    [tenantId, userId, endpoint]
  );
}

export async function sendPushToUser(
  tenantId: number,
  userId: number,
  title: string,
  body: string,
  options: { icon?: string; badge?: string; data?: Record<string, any>; tag?: string } = {}
): Promise<void> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;

  let subs: any[];
  if (isDemoMode) {
    subs = ((demoDb as any).push_subscriptions || []).filter(
      (s: any) => s.tenant_id === tenantId && s.user_id === userId
    );
  } else {
    const result = await query(
      'SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE tenant_id = $1 AND user_id = $2',
      [tenantId, userId]
    );
    subs = result.rows;
  }

  const payload = JSON.stringify({
    title,
    body,
    icon: options.icon || '/favicon.svg',
    badge: options.badge || '/favicon.svg',
    data: options.data || {},
    tag: options.tag || 'default',
  });

  for (const sub of subs) {
    try {
      await webPush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        payload
      );
    } catch (err: any) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        if (!isDemoMode) {
          await query(
            'DELETE FROM push_subscriptions WHERE endpoint = $1',
            [sub.endpoint]
          );
        }
      }
    }
  }
}

export async function sendPushToRole(
  tenantId: number,
  role: string,
  title: string,
  body: string,
  options: { icon?: string; badge?: string; data?: Record<string, any>; tag?: string } = {}
): Promise<void> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;

  let userIds: number[];
  if (isDemoMode) {
    userIds = demoDb.users
      .filter((u: any) => u.tenant_id === tenantId && u.role === role)
      .map((u: any) => u.id);
  } else {
    const result = await query(
      'SELECT id FROM users WHERE tenant_id = $1 AND role = $2',
      [tenantId, role]
    );
    userIds = result.rows.map((r: any) => r.id);
  }

  await Promise.all(
    userIds.map((uid) => sendPushToUser(tenantId, uid, title, body, options))
  );
}

export async function sendPushForNotification(
  tenantId: number,
  notification: any,
  minRole?: string
): Promise<void> {
  const title = notification.title || 'Notification';
  const body = notification.message || '';

  if (notification.assigned_to) {
    await sendPushToUser(tenantId, notification.assigned_to, title, body, {
      data: { notificationId: notification.id, entityType: notification.entity_type, entityId: notification.entity_id, actionUrl: notification.action_url },
      tag: `notif-${notification.id}`,
    });
  } else if (minRole) {
    await sendPushToRole(tenantId, minRole, title, body, {
      data: { notificationId: notification.id, entityType: notification.entity_type, entityId: notification.entity_id, actionUrl: notification.action_url },
      tag: `notif-${notification.id}`,
    });
  }
}
