import { Router, Request, Response } from 'express';
import { authMiddleware } from './auth';
import { tenantContextMiddleware } from '../middleware/tenantContext';
import { createReception, getAllReceptions, getReceptionById } from '../services/reception.service';

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
    const { purchase_order_id, date_from, date_to, page, perPage } = req.query;

    const result = await getAllReceptions(req.tenantId, {
      po_number: purchase_order_id as string | undefined,
      date_from: date_from as string | undefined,
      date_to: date_to as string | undefined,
      page: page ? parseInt(page as string, 10) : undefined,
      limit: perPage ? parseInt(perPage as string, 10) : undefined,
    });

    res.json({
      status: 'success',
      receptions: result.data,
      total: result.total,
      page: result.page,
      perPage: result.limit,
      totalPages: Math.ceil(result.total / result.limit),
    });
  } catch (error: any) {
    console.error('Error fetching receptions:', error);
    res.status(500).json({ status: 'error', message: error.message || 'Error fetching receptions' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const reception = await getReceptionById(parseInt(req.params.id, 10), req.tenantId);
    if (!reception) {
      return res.status(404).json({ status: 'error', message: 'Reception not found' });
    }
    res.json({ status: 'success', data: reception });
  } catch (error: any) {
    console.error('Error fetching reception:', error);
    res.status(500).json({ status: 'error', message: error.message || 'Error fetching reception' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  const { purchase_order_id, warehouse_id, notes, items } = req.body;

  if (!purchase_order_id || !warehouse_id || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ status: 'error', message: 'Missing required fields: purchase_order_id, warehouse_id, items' });
  }

  for (const item of items) {
    if (!item.purchase_order_item_id || !item.ingredient_id) {
      return res.status(400).json({ status: 'error', message: 'Each item must have purchase_order_item_id and ingredient_id' });
    }
  }

  try {
    const data = await createReception(
      { purchase_order_id, warehouse_id, notes, items: items.map((item: any) => ({
        purchase_order_item_id: parseInt(item.purchase_order_item_id, 10),
        ingredient_id: parseInt(item.ingredient_id, 10),
        received_quantity: item.received_quantity ? parseFloat(item.received_quantity) : 0,
        rejected_quantity: item.rejected_quantity ? parseFloat(item.rejected_quantity) : 0,
        damaged_quantity: item.damaged_quantity ? parseFloat(item.damaged_quantity) : 0,
        batch_number: item.batch_number || undefined,
        expiration_date: item.expiration_date || undefined,
        storage_location: item.storage_location || undefined,
      })) },
      req.tenantId,
      (req.user as any)?.id
    );

    res.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Error creating reception:', error);
    res.status(400).json({ status: 'error', message: error.message || 'Error creating reception' });
  }
});

export default router;
