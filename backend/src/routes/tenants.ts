/**
 * mePOS STOCK — Tenant Management Routes (Platform Admin)
 * =========================================================
 * Endpoints for tenant CRUD and management.
 * Requires platform_admin role.
 */

import { Router, Request, Response } from 'express';
import { authMiddleware } from './auth';
import {
  getAllTenants,
  getTenantById,
  createTenant,
  updateTenant,
  deleteTenant,
  suspendTenant,
  activateTenant,
  getTenantStats,
} from '../services/tenant.service';

const router = Router();
router.use(authMiddleware);

/**
 * GET /api/v1/tenants
 * List all tenants (platform admin only).
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const tenants = await getAllTenants();
    res.json({ status: 'success', data: tenants });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message || 'Failed to list tenants' });
  }
});

/**
 * GET /api/v1/tenants/:id
 * Get a tenant by ID.
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const tenant = await getTenantById(parseInt(req.params.id, 10));
    if (!tenant) {
      return res.status(404).json({ status: 'error', message: 'Tenant not found' });
    }
    res.json({ status: 'success', data: tenant });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message || 'Failed to get tenant' });
  }
});

/**
 * GET /api/v1/tenants/:id/stats
 * Get tenant statistics.
 */
router.get('/:id/stats', async (req: Request, res: Response) => {
  try {
    const stats = await getTenantStats(parseInt(req.params.id, 10));
    res.json({ status: 'success', data: stats });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message || 'Failed to get stats' });
  }
});

/**
 * POST /api/v1/tenants
 * Create a new tenant.
 */
router.post('/', async (req: Request, res: Response) => {
  const { name, slug, email, phone, address, country, timezone, language, currency, subscription_plan } = req.body;

  if (!name || !slug) {
    return res.status(400).json({ status: 'error', message: 'name and slug are required' });
  }

  try {
    const tenant = await createTenant({ name, slug, email, phone, address, country, timezone, language, currency, subscription_plan });
    res.status(201).json({ status: 'success', data: tenant });
  } catch (error: any) {
    res.status(400).json({ status: 'error', message: error.message || 'Failed to create tenant' });
  }
});

/**
 * PUT /api/v1/tenants/:id
 * Update a tenant.
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const tenant = await updateTenant(parseInt(req.params.id, 10), req.body);
    if (!tenant) {
      return res.status(404).json({ status: 'error', message: 'Tenant not found' });
    }
    res.json({ status: 'success', data: tenant });
  } catch (error: any) {
    res.status(400).json({ status: 'error', message: error.message || 'Failed to update tenant' });
  }
});

/**
 * DELETE /api/v1/tenants/:id
 * Delete a tenant and all associated data.
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await deleteTenant(parseInt(req.params.id, 10));
    if (!deleted) {
      return res.status(404).json({ status: 'error', message: 'Tenant not found' });
    }
    res.json({ status: 'success', message: 'Tenant deleted' });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message || 'Failed to delete tenant' });
  }
});

/**
 * POST /api/v1/tenants/:id/suspend
 * Suspend a tenant.
 */
router.post('/:id/suspend', async (req: Request, res: Response) => {
  try {
    const tenant = await suspendTenant(parseInt(req.params.id, 10));
    if (!tenant) {
      return res.status(404).json({ status: 'error', message: 'Tenant not found' });
    }
    res.json({ status: 'success', message: 'Tenant suspended', data: tenant });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message || 'Failed to suspend tenant' });
  }
});

/**
 * POST /api/v1/tenants/:id/activate
 * Activate a suspended tenant.
 */
router.post('/:id/activate', async (req: Request, res: Response) => {
  try {
    const tenant = await activateTenant(parseInt(req.params.id, 10));
    if (!tenant) {
      return res.status(404).json({ status: 'error', message: 'Tenant not found' });
    }
    res.json({ status: 'success', message: 'Tenant activated', data: tenant });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message || 'Failed to activate tenant' });
  }
});

export default router;
