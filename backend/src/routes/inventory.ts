import { Router, Request, Response } from 'express';
import { authMiddleware } from './auth';
import { tenantContextMiddleware } from '../middleware/tenantContext';
import {
  getAllDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  getAllIngredients,
  createIngredient,
  updateIngredient,
  deleteIngredient,
  getAllRecipes,
  createRecipe,
  updateRecipe,
  deleteRecipe,
  saveRecipeIngredients,
  getAllStocks,
  getAllMovements,
  adjustStock,
} from '../services/inventory.service';

const router = Router();

router.use(authMiddleware);
router.use(tenantContextMiddleware);

// ======================================================
// DEPARTMENTS
// ======================================================

router.get('/departments', async (req: Request, res: Response) => {
  try {
    const data = await getAllDepartments(req.tenantId);
    res.json({ status: 'success', data });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

router.post('/departments', async (req: Request, res: Response) => {
  const { name, stock_type, description } = req.body;

  if (!name || !stock_type) {
    return res.status(400).json({ status: 'error', message: 'Nom et politique de stock requis.' });
  }

  try {
    const data = await createDepartment({ name, stock_type, description }, req.tenantId);
    res.json({ status: 'success', data });
  } catch (error: any) {
    const status = error.message.includes('existe déjà') || error.message.includes('invalide') ? 400 : 500;
    res.status(status).json({ status: 'error', message: error.message });
  }
});

router.put('/departments/:id', async (req: Request, res: Response) => {
  const deptId = parseInt(req.params.id, 10);
  const { name, stock_type, description } = req.body;

  if (isNaN(deptId)) {
    return res.status(400).json({ status: 'error', message: 'ID de dépôt invalide.' });
  }

  try {
    const data = await updateDepartment(deptId, { name, stock_type, description }, req.tenantId);
    res.json({ status: 'success', data });
  } catch (error: any) {
    const status = error.message.includes('introuvable') ? 404 : 400;
    res.status(status).json({ status: 'error', message: error.message });
  }
});

router.delete('/departments/:id', async (req: Request, res: Response) => {
  const deptId = parseInt(req.params.id, 10);
  const transferToId = req.query.transfer_to_id
    ? parseInt(req.query.transfer_to_id as string, 10)
    : null;

  try {
    const result = await deleteDepartment(deptId, transferToId, req.tenantId);
    if (result.requiresTransfer) {
      return res.json({
        status: 'requires_transfer',
        message: result.message,
      });
    }
    res.json({ status: 'success', message: result.message });
  } catch (error: any) {
    if (error.code === '23503') {
      return res.status(400).json({
        status: 'error',
        message: 'Ce dépôt est lié à des transactions historiques (ventes, pertes ou mouvements) et ne peut pas être supprimé.',
      });
    }
    const status = error.message.includes('introuvable') ? 404 : 400;
    res.status(status).json({ status: 'error', message: error.message });
  }
});

// ======================================================
// INGREDIENTS
// ======================================================

router.get('/ingredients', async (req: Request, res: Response) => {
  try {
    const data = await getAllIngredients(req.tenantId);
    res.json({ status: 'success', data });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

router.post('/ingredients', async (req: Request, res: Response) => {
  const { name, unit, purchase_unit, purchase_unit_price, conversion_factor, alert_threshold } = req.body;

  if (!name || !unit || purchase_unit_price === undefined || !conversion_factor) {
    return res.status(400).json({ status: 'error', message: 'Champs obligatoires manquants.' });
  }

  try {
    const data = await createIngredient({
      name, unit, purchase_unit, purchase_unit_price, conversion_factor, alert_threshold,
    }, req.tenantId);
    res.json({ status: 'success', data });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

router.put('/ingredients/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const { name, unit, purchase_unit, purchase_unit_price, conversion_factor, alert_threshold } = req.body;

  try {
    const data = await updateIngredient(id, {
      name, unit, purchase_unit, purchase_unit_price, conversion_factor, alert_threshold,
    }, req.tenantId);
    res.json({ status: 'success', data });
  } catch (error: any) {
    const status = error.message.includes('not found') ? 404 : 500;
    res.status(status).json({ status: 'error', message: error.message });
  }
});

router.delete('/ingredients/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);

  try {
    const result = await deleteIngredient(id, req.tenantId);
    if (!result.success) {
      return res.status(409).json({ status: 'error', ...result });
    }
    res.json({ status: 'success', message: result.message });
  } catch (error: any) {
    const status = error.message.includes('not found') ? 404 : 500;
    res.status(status).json({ status: 'error', message: error.message });
  }
});

// ======================================================
// RECIPES
// ======================================================

router.get('/recipes', async (req: Request, res: Response) => {
  try {
    const ingredientId = req.query.ingredient_id ? parseInt(req.query.ingredient_id as string, 10) : undefined;
    const data = await getAllRecipes(req.tenantId, ingredientId);
    res.json({ status: 'success', data });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

router.post('/recipes', async (req: Request, res: Response) => {
  const { name, sale_price } = req.body;

  if (!name || sale_price === undefined) {
    return res.status(400).json({ status: 'error', message: 'Nom ou prix de vente manquant.' });
  }

  try {
    const data = await createRecipe({ name, sale_price }, req.tenantId);
    res.json({ status: 'success', data });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

router.put('/recipes/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const { name, sale_price } = req.body;

  try {
    const data = await updateRecipe(id, { name, sale_price }, req.tenantId);
    res.json({ status: 'success', data });
  } catch (error: any) {
    const status = error.message.includes('not found') ? 404 : 500;
    res.status(status).json({ status: 'error', message: error.message });
  }
});

router.delete('/recipes/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);

  try {
    const result = await deleteRecipe(id, req.tenantId);
    if (!result.success) {
      return res.status(404).json({ status: 'error', message: result.message });
    }
    res.json({ status: 'success', message: result.message });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message || 'Erreur lors de la suppression' });
  }
});

router.post('/recipes/:id/ingredients', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const { ingredients } = req.body;

  if (!ingredients || !Array.isArray(ingredients)) {
    return res.status(400).json({ status: 'error', message: 'Tableau d\'ingrédients requis.' });
  }

  try {
    await saveRecipeIngredients(id, ingredients, req.tenantId);
    res.json({ status: 'success', message: 'Ingrédients de la recette mis à jour.' });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// ======================================================
// STOCKS
// ======================================================

router.get('/stocks', async (req: Request, res: Response) => {
  try {
    const data = await getAllStocks(req.tenantId);
    res.json({ status: 'success', data });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// ======================================================
// MOVEMENTS
// ======================================================

router.get('/movements', async (req: Request, res: Response) => {
  try {
    const ingredientId = req.query.ingredient_id ? parseInt(req.query.ingredient_id as string, 10) : undefined;
    const data = await getAllMovements(req.tenantId, ingredientId);
    res.json({ status: 'success', data });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// ======================================================
// ADJUSTMENTS (purchase / reconciliation)
// ======================================================

router.post('/inventory/adjust', async (req: Request, res: Response) => {
  const { department_id, ingredient_id, quantity, type, reference_id } = req.body;

  if (department_id === undefined || ingredient_id === undefined || quantity === undefined || !type) {
    return res.status(400).json({ status: 'error', message: 'Champs obligatoires manquants.' });
  }

  try {
    const result = await adjustStock({ department_id, ingredient_id, quantity, type, reference_id }, req.tenantId);
    res.json({ status: 'success', data: result });
  } catch (error: any) {
    res.status(400).json({ status: 'error', message: error.message });
  }
});

export default router;
