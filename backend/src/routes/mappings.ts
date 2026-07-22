import { Router, Request, Response } from 'express';
import { authMiddleware } from './auth';
import { tenantContextMiddleware } from '../middleware/tenantContext';
import {
  getMappings,
  getMappingById,
  createMapping,
  updateMapping,
  deleteMapping,
  bulkMap,
  autoMatch,
  getMappingStats,
  getUnmappedProducts,
  validateMappings,
  importPosProducts
} from '../services/mapping.service';

const router = Router();

router.use(authMiddleware);
router.use(tenantContextMiddleware);

/**
 * Require admin or manager role for write operations
 */
function requireWriteRole(req: Request, res: Response, next: Function) {
  const user = (req as any).user;
  if (!user || (user.role !== 'admin' && user.role !== 'manager')) {
    return res.status(403).json({ status: 'error', message: 'Accès réservé aux administrateurs et gestionnaires' });
  }
  next();
}

/**
 * GET /mappings/stats
 * Get mapping statistics dashboard
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const stats = await getMappingStats(tenantId);
    res.json({ status: 'success', data: stats });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * GET /mappings/validate
 * Validate mapping completeness
 */
router.get('/validate', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await validateMappings(tenantId);
    res.json({ status: 'success', data: result });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * GET /mappings/unmapped
 * Get unmapped products
 */
router.get('/unmapped', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const limit = parseInt(req.query.limit as string, 10) || 100;
    const data = await getUnmappedProducts(tenantId, limit);
    res.json({ status: 'success', data });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * GET /mappings
 * List all mappings with filters
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const { connector_type, status, search, limit, offset } = req.query;

    const result = await getMappings(tenantId, {
      connectorType: connector_type as string,
      status: status as string,
      search: search as string,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined
    });

    res.json({ status: 'success', data: result.data, total: result.total });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * GET /mappings/:id
 * Get a single mapping
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const tenantId = (req as any).tenantId;

    if (isNaN(id)) {
      return res.status(400).json({ status: 'error', message: 'ID invalide' });
    }

    const mapping = await getMappingById(id, tenantId);
    if (!mapping) {
      return res.status(404).json({ status: 'error', message: 'Mapping non trouvé' });
    }

    res.json({ status: 'success', data: mapping });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * POST /mappings
 * Create a new mapping
 */
router.post('/', requireWriteRole, async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const {
      connector_type,
      external_product_id,
      external_product_code,
      external_product_name,
      mepos_product_id,
      mapping_status,
      confidence
    } = req.body;

    if (!connector_type || !external_product_id) {
      return res.status(400).json({ status: 'error', message: 'connector_type et external_product_id requis' });
    }

    const mapping = await createMapping(tenantId, {
      connector_type,
      external_product_id,
      external_product_code,
      external_product_name,
      mepos_product_id,
      mapping_status,
      confidence
    });

    res.json({ status: 'success', data: mapping });
  } catch (error: any) {
    res.status(400).json({ status: 'error', message: error.message });
  }
});

/**
 * POST /mappings/bulk
 * Bulk create/update mappings
 */
router.post('/bulk', requireWriteRole, async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const { mappings } = req.body;

    if (!mappings || !Array.isArray(mappings)) {
      return res.status(400).json({ status: 'error', message: 'Tableau mappings requis' });
    }

    const result = await bulkMap(tenantId, mappings);
    res.json({ status: 'success', data: result });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * POST /mappings/auto-match
 * Auto-match external products to recipes
 */
router.post('/auto-match', requireWriteRole, async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const { connector_type, threshold } = req.body;

    if (!connector_type) {
      return res.status(400).json({ status: 'error', message: 'connector_type requis' });
    }

    const result = await autoMatch(tenantId, connector_type, threshold || 60);
    res.json({ status: 'success', data: result });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * POST /mappings/import-pos
 * Import external POS products
 */
router.post('/import-pos', requireWriteRole, async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const { connector_type, products } = req.body;

    if (!connector_type || !products || !Array.isArray(products)) {
      return res.status(400).json({ status: 'error', message: 'connector_type et products requis' });
    }

    const result = await importPosProducts(tenantId, connector_type, products);
    res.json({ status: 'success', data: result });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * PUT /mappings/:id
 * Update a mapping
 */
router.put('/:id', requireWriteRole, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const tenantId = (req as any).tenantId;
    const { mepos_product_id, mapping_status, confidence } = req.body;

    if (isNaN(id)) {
      return res.status(400).json({ status: 'error', message: 'ID invalide' });
    }

    const mapping = await updateMapping(id, tenantId, {
      mepos_product_id,
      mapping_status,
      confidence
    });

    if (!mapping) {
      return res.status(404).json({ status: 'error', message: 'Mapping non trouvé' });
    }

    res.json({ status: 'success', data: mapping });
  } catch (error: any) {
    res.status(400).json({ status: 'error', message: error.message });
  }
});

/**
 * DELETE /mappings/:id
 * Delete a mapping
 */
router.delete('/:id', requireWriteRole, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const tenantId = (req as any).tenantId;

    if (isNaN(id)) {
      return res.status(400).json({ status: 'error', message: 'ID invalide' });
    }

    const deleted = await deleteMapping(id, tenantId);
    if (!deleted) {
      return res.status(404).json({ status: 'error', message: 'Mapping non trouvé' });
    }

    res.json({ status: 'success', message: 'Mapping supprimé' });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

export default router;
