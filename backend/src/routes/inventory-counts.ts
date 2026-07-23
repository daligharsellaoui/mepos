import { Router, Request, Response } from 'express';
import { authMiddleware } from './auth';
import { tenantContextMiddleware } from '../middleware/tenantContext';
import {
  getAllCountSessions,
  getCountSessionById,
  getCountDiscrepancies,
  createCountSession,
  updateCountItem,
  startCountSession,
  completeCountSession,
  approveCountSession,
  cancelCountSession,
} from '../services/inventory-count.service';

const router = Router();

router.use(authMiddleware);
router.use(tenantContextMiddleware);

function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: any) => {
    if (!req.user) {
      return res.status(401).json({ status: 'error', message: 'Authentification requise.' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ status: 'error', message: 'Accès refusé. Rôle insuffisant.' });
    }
    next();
  };
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const { status, warehouse_id, date_from, date_to, page, perPage } = req.query;
    const result = await getAllCountSessions(req.tenantId, {
      status: status as string | undefined,
      warehouse_id: warehouse_id ? parseInt(warehouse_id as string, 10) : undefined,
      date_from: date_from as string | undefined,
      date_to: date_to as string | undefined,
      page: page ? parseInt(page as string, 10) : undefined,
      limit: perPage ? parseInt(perPage as string, 10) : undefined,
    });

    res.json({
      status: 'success',
      data: result.data,
      total: result.total,
      page: result.page,
      perPage: result.limit,
      totalPages: Math.ceil(result.total / result.limit),
    });
  } catch (error: any) {
    console.error('Error fetching count sessions:', error);
    res.status(500).json({ status: 'error', message: error.message || 'Error fetching count sessions' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const data = await getCountSessionById(parseInt(req.params.id, 10), req.tenantId);
    if (!data) {
      return res.status(404).json({ status: 'error', message: 'Count session not found' });
    }
    res.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Error fetching count session:', error);
    res.status(500).json({ status: 'error', message: error.message || 'Error fetching count session' });
  }
});

router.get('/:id/discrepancies', async (req: Request, res: Response) => {
  try {
    const data = await getCountDiscrepancies(parseInt(req.params.id, 10), req.tenantId);
    res.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Error fetching discrepancies:', error);
    res.status(500).json({ status: 'error', message: error.message || 'Error fetching discrepancies' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  const { warehouse_id, notes } = req.body;

  if (!warehouse_id) {
    return res.status(400).json({ status: 'error', message: 'Missing required fields' });
  }

  try {
    const data = await createCountSession(
      { warehouse_id: parseInt(warehouse_id, 10), notes },
      req.tenantId,
      req.user?.id || null
    );
    res.status(201).json({ status: 'success', data });
  } catch (error: any) {
    console.error('Error creating count session:', error);
    res.status(400).json({ status: 'error', message: error.message || 'Error creating count session' });
  }
});

router.put('/items/:itemId', async (req: Request, res: Response) => {
  const { actual_quantity, reason, notes } = req.body;

  try {
    const data = await updateCountItem(
      parseInt(req.params.itemId, 10),
      { actual_quantity: actual_quantity !== undefined ? parseFloat(actual_quantity) : undefined, reason, notes },
      req.tenantId
    );
    res.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Error updating count item:', error);
    res.status(400).json({ status: 'error', message: error.message || 'Error updating count item' });
  }
});

router.post('/:id/start', async (req: Request, res: Response) => {
  try {
    const data = await startCountSession(parseInt(req.params.id, 10), req.tenantId);
    res.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Error starting count session:', error);
    res.status(400).json({ status: 'error', message: error.message || 'Error starting count session' });
  }
});

router.post('/:id/complete', async (req: Request, res: Response) => {
  try {
    const data = await completeCountSession(parseInt(req.params.id, 10), req.tenantId);
    res.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Error completing count session:', error);
    res.status(400).json({ status: 'error', message: error.message || 'Error completing count session' });
  }
});

router.post('/:id/approve', requireRole('admin', 'manager'), async (req: Request, res: Response) => {
  try {
    const data = await approveCountSession(
      parseInt(req.params.id, 10),
      req.tenantId,
      req.user?.id || null
    );
    res.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Error approving count session:', error);
    res.status(400).json({ status: 'error', message: error.message || 'Error approving count session' });
  }
});

router.post('/:id/cancel', async (req: Request, res: Response) => {
  try {
    const data = await cancelCountSession(parseInt(req.params.id, 10), req.tenantId);
    res.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Error cancelling count session:', error);
    res.status(400).json({ status: 'error', message: error.message || 'Error cancelling count session' });
  }
});

export default router;
