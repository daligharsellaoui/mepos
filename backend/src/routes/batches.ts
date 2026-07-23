import { Router, Request, Response } from 'express';
import { authMiddleware } from './auth';
import { tenantContextMiddleware } from '../middleware/tenantContext';
import {
  getAllBatches,
  getBatchById,
  getBatchMovements,
  consumeFromBatch,
  transferBatch,
  splitBatch,
  adjustBatch,
  discardBatch,
  expireBatches,
  getExpiringBatches,
} from '../services/batch.service';

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
    const {
      ingredient_id,
      warehouse_id,
      status,
      expiring_within_days,
      page,
      perPage,
    } = req.query;

    const filters: any = {};
    if (ingredient_id) filters.ingredient_id = parseInt(ingredient_id as string, 10);
    if (warehouse_id) filters.warehouse_id = parseInt(warehouse_id as string, 10);
    if (status) filters.status = status as string;
    if (expiring_within_days) filters.expiring_within_days = parseInt(expiring_within_days as string, 10);
    if (page) filters.page = parseInt(page as string, 10);
    if (perPage) filters.limit = parseInt(perPage as string, 10);

    const { batches, total } = await getAllBatches(req.tenantId, filters);

    const p = filters.page || 1;
    const l = filters.limit || 50;

    res.json({
      status: 'success',
      data: batches,
      total,
      page: p,
      perPage: l,
      totalPages: Math.ceil(total / l),
    });
  } catch (error: any) {
    console.error('Error listing batches:', error);
    res.status(500).json({ status: 'error', message: error.message || 'Error listing batches' });
  }
});

router.get('/expiring', async (req: Request, res: Response) => {
  try {
    const data = await getExpiringBatches(req.tenantId);
    res.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Error fetching expiring batches:', error);
    res.status(500).json({ status: 'error', message: error.message || 'Error fetching expiring batches' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const data = await getBatchById(parseInt(req.params.id, 10), req.tenantId);
    res.json({ status: 'success', data });
  } catch (error: any) {
    const status = error.message.includes('not found') ? 404 : 500;
    res.status(status).json({ status: 'error', message: error.message });
  }
});

router.get('/:id/movements', async (req: Request, res: Response) => {
  try {
    const data = await getBatchMovements(parseInt(req.params.id, 10), req.tenantId);
    res.json({ status: 'success', data });
  } catch (error: any) {
    const status = error.message.includes('not found') ? 404 : 500;
    res.status(status).json({ status: 'error', message: error.message });
  }
});

router.post('/:id/consume', requireRole('admin', 'manager'), async (req: Request, res: Response) => {
  const { quantity } = req.body;

  if (!quantity) {
    return res.status(400).json({ status: 'error', message: 'Missing required field: quantity' });
  }

  try {
    const batch = await getBatchById(parseInt(req.params.id, 10), req.tenantId);
    const data = await consumeFromBatch(
      batch.ingredient_id,
      batch.warehouse_id,
      parseFloat(quantity),
      req.tenantId
    );
    res.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Error consuming from batch:', error);
    res.status(400).json({ status: 'error', message: error.message || 'Error consuming from batch' });
  }
});

router.post('/:id/transfer', requireRole('admin', 'manager'), async (req: Request, res: Response) => {
  const { destination_warehouse_id, quantity } = req.body;

  if (!destination_warehouse_id || !quantity) {
    return res.status(400).json({ status: 'error', message: 'Missing required fields' });
  }

  try {
    const data = await transferBatch(
      parseInt(req.params.id, 10),
      parseInt(destination_warehouse_id, 10),
      parseFloat(quantity),
      req.tenantId
    );
    res.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Error transferring batch:', error);
    res.status(400).json({ status: 'error', message: error.message || 'Error transferring batch' });
  }
});

router.post('/:id/split', requireRole('admin', 'manager'), async (req: Request, res: Response) => {
  const { quantity } = req.body;

  if (!quantity) {
    return res.status(400).json({ status: 'error', message: 'Missing required field: quantity' });
  }

  try {
    const data = await splitBatch(
      parseInt(req.params.id, 10),
      parseFloat(quantity),
      req.tenantId
    );
    res.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Error splitting batch:', error);
    res.status(400).json({ status: 'error', message: error.message || 'Error splitting batch' });
  }
});

router.post('/:id/adjust', async (req: Request, res: Response) => {
  const { new_quantity, reason } = req.body;

  if (new_quantity === undefined || !reason) {
    return res.status(400).json({ status: 'error', message: 'Missing required fields: new_quantity, reason' });
  }

  try {
    const data = await adjustBatch(
      parseInt(req.params.id, 10),
      parseFloat(new_quantity),
      reason,
      req.tenantId
    );
    res.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Error adjusting batch:', error);
    res.status(400).json({ status: 'error', message: error.message || 'Error adjusting batch' });
  }
});

router.post('/:id/discard', async (req: Request, res: Response) => {
  const { reason } = req.body;

  if (!reason) {
    return res.status(400).json({ status: 'error', message: 'Missing required field: reason' });
  }

  try {
    const data = await discardBatch(
      parseInt(req.params.id, 10),
      reason,
      req.tenantId
    );
    res.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Error discarding batch:', error);
    res.status(400).json({ status: 'error', message: error.message || 'Error discarding batch' });
  }
});

router.post('/expire-now', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const result = await expireBatches(req.tenantId);
    res.json({ status: 'success', data: result });
  } catch (error: any) {
    console.error('Error expiring batches:', error);
    res.status(500).json({ status: 'error', message: error.message || 'Error expiring batches' });
  }
});

export default router;
