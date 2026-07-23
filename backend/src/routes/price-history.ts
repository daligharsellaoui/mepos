import { Router, Request, Response } from 'express';
import { authMiddleware } from './auth';
import { tenantContextMiddleware } from '../middleware/tenantContext';
import * as priceHistoryService from '../services/price-history.service';

const router = Router();
router.use(authMiddleware);
router.use(tenantContextMiddleware);

router.get('/ingredients/:ingredientId/history', async (req: Request, res: Response) => {
  try {
    const ingredientId = parseInt(req.params.ingredientId, 10);
    if (isNaN(ingredientId)) {
      return res.status(400).json({ status: 'error', message: 'ID ingrédient invalide.' });
    }
    const { supplier_id, date_from, date_to, limit, offset } = req.query;
    const data = await priceHistoryService.getPriceHistory(ingredientId, req.tenantId, {
      supplier_id: supplier_id ? parseInt(supplier_id as string, 10) : undefined,
      date_from: date_from as string,
      date_to: date_to as string,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    });
    res.json({ status: 'success', data });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

router.get('/ingredients/:ingredientId/analytics', async (req: Request, res: Response) => {
  try {
    const ingredientId = parseInt(req.params.ingredientId, 10);
    if (isNaN(ingredientId)) {
      return res.status(400).json({ status: 'error', message: 'ID ingrédient invalide.' });
    }
    const data = await priceHistoryService.getPriceAnalytics(ingredientId, req.tenantId);
    if (!data) {
      return res.status(404).json({ status: 'error', message: 'Ingrédient introuvable.' });
    }
    res.json({ status: 'success', data });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

router.post('/ingredients/:ingredientId/record', async (req: Request, res: Response) => {
  try {
    const ingredientId = parseInt(req.params.ingredientId, 10);
    if (isNaN(ingredientId)) {
      return res.status(400).json({ status: 'error', message: 'ID ingrédient invalide.' });
    }
    const { unit_price, supplier_id, purchase_order_id, purchase_unit, conversion_factor, quantity, currency, source, notes } = req.body;
    const data = await priceHistoryService.recordPrice(
      {
        ingredient_id: ingredientId,
        unit_price,
        supplier_id: supplier_id ? parseInt(supplier_id, 10) : undefined,
        purchase_order_id: purchase_order_id ? parseInt(purchase_order_id, 10) : undefined,
        purchase_unit,
        conversion_factor,
        quantity,
        currency,
        source,
        notes,
      },
      req.tenantId
    );
    res.json({ status: 'success', data });
  } catch (error: any) {
    const statusCode = error.message.includes('requis') || error.message.includes('valide') ? 400 : 500;
    res.status(statusCode).json({ status: 'error', message: error.message });
  }
});

router.get('/suppliers/:supplierId/comparison', async (req: Request, res: Response) => {
  try {
    const supplierId = parseInt(req.params.supplierId, 10);
    if (isNaN(supplierId)) {
      return res.status(400).json({ status: 'error', message: 'ID fournisseur invalide.' });
    }
    const data = await priceHistoryService.getSupplierPriceComparison(supplierId, req.tenantId);
    res.json({ status: 'success', data });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

router.get('/suppliers/:supplierId/ingredients', async (req: Request, res: Response) => {
  try {
    const supplierId = parseInt(req.params.supplierId, 10);
    if (isNaN(supplierId)) {
      return res.status(400).json({ status: 'error', message: 'ID fournisseur invalide.' });
    }
    const data = await priceHistoryService.getSupplierIngredients(supplierId, req.tenantId);
    res.json({ status: 'success', data });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

router.post('/supplier-ingredients', async (req: Request, res: Response) => {
  try {
    const { supplier_id, ingredient_id, supplier_sku, unit_price, purchase_unit, conversion_factor, minimum_order_quantity, lead_time_days, is_preferred } = req.body;
    const data = await priceHistoryService.linkSupplierIngredient(
      {
        supplier_id: parseInt(supplier_id, 10),
        ingredient_id: parseInt(ingredient_id, 10),
        supplier_sku,
        unit_price,
        purchase_unit,
        conversion_factor,
        minimum_order_quantity,
        lead_time_days,
        is_preferred,
      },
      req.tenantId
    );
    res.json({ status: 'success', data });
  } catch (error: any) {
    const statusCode = error.message.includes('requis') || error.message.includes('valide') ? 400 : 500;
    res.status(statusCode).json({ status: 'error', message: error.message });
  }
});

router.delete('/supplier-ingredients', async (req: Request, res: Response) => {
  try {
    const { supplier_id, ingredient_id } = req.body;
    if (!supplier_id || !ingredient_id) {
      return res.status(400).json({ status: 'error', message: 'Fournisseur et ingrédient requis.' });
    }
    const result = await priceHistoryService.unlinkSupplierIngredient(
      parseInt(supplier_id, 10),
      parseInt(ingredient_id, 10),
      req.tenantId
    );
    res.json({ status: 'success', ...result });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

export default router;
