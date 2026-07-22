import { Router, Request, Response } from 'express';
import { authMiddleware } from './auth';
import { tenantContextMiddleware } from '../middleware/tenantContext';
import {
  getNotifications, getUnreadCount, markAsRead, markAllAsRead,
  archiveNotification, deleteNotification,
  getUserPreferences, setUserPreference,
} from '../services/notification.service';

const router = Router();

router.use(authMiddleware, tenantContextMiddleware);

router.get('/', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id;
    const {
      types, categories, priorities, read, archived, search,
      limit, offset, sort_by, sort_order,
    } = req.query as any;

    const result = await getNotifications(tenantId, userId, {
      types: types ? types.split(',') : undefined,
      categories: categories ? categories.split(',') : undefined,
      priorities: priorities ? priorities.split(',') : undefined,
      read: read !== undefined ? read === 'true' : undefined,
      archived: archived !== undefined ? archived === 'true' : undefined,
      search,
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
      sortBy: sort_by || 'created_at',
      sortOrder: (sort_order as any) || 'desc',
    });

    res.json({ status: 'success', data: result.data, total: result.total });
  } catch (err: any) {
    console.error('[Notifications] GET error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

router.get('/unread-count', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id;
    const count = await getUnreadCount(tenantId, userId);
    res.json({ status: 'success', data: { count } });
  } catch (err: any) {
    console.error('[Notifications] unread-count error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

router.put('/:id/read', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id;
    const notifId = parseInt(req.params.id, 10);
    const notif = await markAsRead(notifId, tenantId, userId);
    if (!notif) {
      return res.status(404).json({ status: 'error', message: 'Notification non trouvée.' });
    }
    res.json({ status: 'success', data: notif });
  } catch (err: any) {
    console.error('[Notifications] mark-read error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

router.put('/read-all', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id;
    const count = await markAllAsRead(tenantId, userId);
    res.json({ status: 'success', data: { markedRead: count } });
  } catch (err: any) {
    console.error('[Notifications] read-all error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

router.put('/:id/archive', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const notifId = parseInt(req.params.id, 10);
    const notif = await archiveNotification(notifId, tenantId);
    if (!notif) {
      return res.status(404).json({ status: 'error', message: 'Notification non trouvée.' });
    }
    res.json({ status: 'success', data: notif });
  } catch (err: any) {
    console.error('[Notifications] archive error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const notifId = parseInt(req.params.id, 10);
    const deleted = await deleteNotification(notifId, tenantId);
    if (!deleted) {
      return res.status(404).json({ status: 'error', message: 'Notification non trouvée.' });
    }
    res.json({ status: 'success', message: 'Notification supprimée.' });
  } catch (err: any) {
    console.error('[Notifications] delete error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

router.get('/preferences', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id;
    const prefs = await getUserPreferences(tenantId, userId);
    res.json({ status: 'success', data: prefs });
  } catch (err: any) {
    console.error('[Notifications] preferences error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

router.put('/preferences/:category', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id;
    const category = req.params.category;
    const { enabled, muted, critical_only, desktop, sound } = req.body;
    const pref = await setUserPreference(tenantId, userId, category, {
      enabled, muted, critical_only, desktop, sound,
    });
    res.json({ status: 'success', data: pref });
  } catch (err: any) {
    console.error('[Notifications] set preference error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

export default router;
