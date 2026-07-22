import { Router, Request, Response } from 'express';
import { getVapidPublicKey, subscribe, unsubscribe } from '../services/push.service';

const router = Router();

router.get('/vapid-public-key', (_req: Request, res: Response) => {
  res.json({ status: 'success', data: { publicKey: getVapidPublicKey() } });
});

router.post('/subscribe', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id;
    const { endpoint, keys } = req.body;
    const userAgent = req.headers['user-agent'];

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      res.status(400).json({ status: 'error', message: 'Missing subscription endpoint or keys' });
      return;
    }

    await subscribe(tenantId, userId, { endpoint, keys }, userAgent);
    res.json({ status: 'success', message: 'Subscription saved' });
  } catch (err: any) {
    console.error('[Push] subscribe error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

router.delete('/unsubscribe', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id;
    const { endpoint } = req.body;

    if (!endpoint) {
      res.status(400).json({ status: 'error', message: 'Missing endpoint' });
      return;
    }

    await unsubscribe(tenantId, userId, endpoint);
    res.json({ status: 'success', message: 'Subscription removed' });
  } catch (err: any) {
    console.error('[Push] unsubscribe error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

export default router;
