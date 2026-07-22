import { Router, Request, Response } from 'express';
import { authMiddleware } from './auth';
import { tenantContextMiddleware } from '../middleware/tenantContext';
import * as supplierService from '../services/supplier.service';

const router = Router();
router.use(authMiddleware);
router.use(tenantContextMiddleware);

router.get('/', async (req: Request, res: Response) => {
  try {
    const { search, status, preferred, country, sortBy, sortDir, page, perPage } = req.query;
    const result = await supplierService.getAllSuppliers(
      req.tenantId,
      search as string,
      status as string,
      preferred as string,
      country as string,
      sortBy as string,
      sortDir as string,
      page ? parseInt(page as string, 10) : undefined,
      perPage ? parseInt(perPage as string, 10) : undefined
    );
    res.json({ status: 'success', ...result });
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
    const supplier = await supplierService.getSupplierById(id, req.tenantId);
    if (!supplier) {
      return res.status(404).json({ status: 'error', message: 'Fournisseur introuvable.' });
    }
    res.json({ status: 'success', data: supplier });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const data = await supplierService.createSupplier(req.body, req.tenantId);
    res.json({ status: 'success', data });
  } catch (error: any) {
    const statusCode = error.message.includes('requis') || error.message.includes('valide') || error.message.includes('existe déjà') ? 400 : 500;
    res.status(statusCode).json({ status: 'error', message: error.message });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ status: 'error', message: 'ID invalide.' });
    }
    const supplier = await supplierService.updateSupplier(id, req.body, req.tenantId);
    res.json({ status: 'success', data: supplier });
  } catch (error: any) {
    const statusCode = error.message.includes('introuvable') ? 404 : error.message.includes('requis') || error.message.includes('valide') || error.message.includes('existe déjà') ? 400 : 500;
    res.status(statusCode).json({ status: 'error', message: error.message });
  }
});

router.post('/:id/archive', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ status: 'error', message: 'ID invalide.' });
    }
    const supplier = await supplierService.archiveSupplier(id, req.tenantId);
    res.json({ status: 'success', data: supplier });
  } catch (error: any) {
    const statusCode = error.message.includes('introuvable') ? 404 : 500;
    res.status(statusCode).json({ status: 'error', message: error.message });
  }
});

router.post('/:id/restore', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ status: 'error', message: 'ID invalide.' });
    }
    const supplier = await supplierService.restoreSupplier(id, req.tenantId);
    res.json({ status: 'success', data: supplier });
  } catch (error: any) {
    const statusCode = error.message.includes('introuvable') ? 404 : 500;
    res.status(statusCode).json({ status: 'error', message: error.message });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ status: 'error', message: 'ID invalide.' });
    }
    const user = (req as any).user;
    if (user?.role !== 'admin') {
      return res.status(403).json({ status: 'error', message: 'Accès refusé. Seul un administrateur peut supprimer.' });
    }
    const result = await supplierService.deleteSupplier(id, req.tenantId, user.role);
    if (!result.success) {
      return res.status(409).json({ status: 'error', ...result });
    }
    res.json({ status: 'success', ...result });
  } catch (error: any) {
    const statusCode = error.message.includes('introuvable') ? 404 : error.message.includes('Administrateur') ? 403 : 500;
    res.status(statusCode).json({ status: 'error', message: error.message });
  }
});

router.get('/:id/ingredients', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ status: 'error', message: 'ID invalide.' });
    }
    const ingredients = await supplierService.getSupplierIngredients(id, req.tenantId);
    res.json({ status: 'success', data: ingredients });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

export default router;
