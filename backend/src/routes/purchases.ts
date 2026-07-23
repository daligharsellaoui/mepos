import { Router, Request, Response } from 'express';
import { authMiddleware } from './auth';
import { tenantContextMiddleware } from '../middleware/tenantContext';
import {
  getAllPurchaseOrders,
  getPurchaseOrderById,
  createPurchaseOrder,
  updatePurchaseOrder,
  submitPurchaseOrder,
  approvePurchaseOrder,
  rejectPurchaseOrder,
  cancelPurchaseOrder,
  closePurchaseOrder,
  deletePurchaseOrder,
} from '../services/purchase.service';

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
    const { status, supplier_id, search, date_from, date_to, page, perPage } = req.query;
    const result = await getAllPurchaseOrders(req.tenantId, {
      status: status as string,
      supplier_id: supplier_id ? parseInt(supplier_id as string, 10) : undefined,
      search: search as string,
      date_from: date_from as string,
      date_to: date_to as string,
      page: page ? parseInt(page as string, 10) : undefined,
      perPage: perPage ? parseInt(perPage as string, 10) : undefined,
    });
    res.json({ status: 'success', data: result.orders, total: result.total, page: result.page, perPage: result.perPage, totalPages: result.totalPages });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ status: 'error', message: 'ID invalide.' });
    }
    const data = await getPurchaseOrderById(id, req.tenantId);
    if (!data) {
      return res.status(404).json({ status: 'error', message: 'Bon de commande introuvable.' });
    }
    res.json({ status: 'success', data });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const data = await createPurchaseOrder(req.body, req.tenantId, userId);
    res.json({ status: 'success', data });
  } catch (error: any) {
    const statusCode = error.message.includes('requis') || error.message.includes('valide') || error.message.includes('must have at least') ? 400 : 500;
    res.status(statusCode).json({ status: 'error', message: error.message });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ status: 'error', message: 'ID invalide.' });
    }
    const data = await updatePurchaseOrder(id, req.body, req.tenantId);
    res.json({ status: 'success', data });
  } catch (error: any) {
    const statusCode = error.message.includes('introuvable') ? 404 : error.message.includes('draft') || error.message.includes('édité') ? 400 : 500;
    res.status(statusCode).json({ status: 'error', message: error.message });
  }
});

router.post('/:id/submit', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ status: 'error', message: 'ID invalide.' });
    }
    const userId = (req as any).user?.id;
    const data = await submitPurchaseOrder(id, req.tenantId, userId);
    res.json({ status: 'success', data });
  } catch (error: any) {
    const statusCode = error.message.includes('introuvable') ? 404 : 400;
    res.status(statusCode).json({ status: 'error', message: error.message });
  }
});

router.post('/:id/approve', requireRole('admin', 'manager'), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ status: 'error', message: 'ID invalide.' });
    }
    const userId = (req as any).user?.id;
    const data = await approvePurchaseOrder(id, req.tenantId, userId);
    res.json({ status: 'success', data });
  } catch (error: any) {
    const statusCode = error.message.includes('introuvable') ? 404 : 400;
    res.status(statusCode).json({ status: 'error', message: error.message });
  }
});

router.post('/:id/reject', requireRole('admin', 'manager'), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ status: 'error', message: 'ID invalide.' });
    }
    const userId = (req as any).user?.id;
    const data = await rejectPurchaseOrder(id, req.tenantId, userId);
    res.json({ status: 'success', data });
  } catch (error: any) {
    const statusCode = error.message.includes('introuvable') ? 404 : 400;
    res.status(statusCode).json({ status: 'error', message: error.message });
  }
});

router.post('/:id/cancel', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ status: 'error', message: 'ID invalide.' });
    }
    const userId = (req as any).user?.id;
    const data = await cancelPurchaseOrder(id, req.tenantId, userId);
    res.json({ status: 'success', data });
  } catch (error: any) {
    const statusCode = error.message.includes('introuvable') ? 404 : 400;
    res.status(statusCode).json({ status: 'error', message: error.message });
  }
});

router.post('/:id/close', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ status: 'error', message: 'ID invalide.' });
    }
    const userId = (req as any).user?.id;
    const data = await closePurchaseOrder(id, req.tenantId, userId);
    res.json({ status: 'success', data });
  } catch (error: any) {
    const statusCode = error.message.includes('introuvable') ? 404 : 500;
    res.status(statusCode).json({ status: 'error', message: error.message });
  }
});

router.delete('/:id', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ status: 'error', message: 'ID invalide.' });
    }
    const result = await deletePurchaseOrder(id, req.tenantId);
    res.json({ status: 'success', ...result });
  } catch (error: any) {
    const statusCode = error.message.includes('introuvable') ? 404 : error.message.includes('draft') || error.message.includes('supprimés') ? 409 : 500;
    res.status(statusCode).json({ status: 'error', message: error.message });
  }
});

export default router;
