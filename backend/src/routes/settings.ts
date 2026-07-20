/**
 * mePOS STOCK — Tenant Settings Routes
 * ======================================
 * Endpoints for tenant settings management.
 *
 * All routes require user JWT + tenant context.
 */

import { Router, Request, Response } from 'express';
import { authMiddleware } from './auth';
import {
  getTenantSettings,
  getTenantSettingsByCategory,
  getTenantSetting,
  setTenantSetting,
  setTenantSettingsBulk,
  deleteTenantSetting,
} from '../services/tenant.service';

const router = Router();
router.use(authMiddleware);

/**
 * GET /api/v1/settings
 * Get all settings for the current tenant (grouped by category).
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId ?? 1;
    const settings = await getTenantSettings(tenantId);
    res.json({ status: 'success', data: settings });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message || 'Failed to get settings' });
  }
});

/**
 * GET /api/v1/settings/:category
 * Get settings for a specific category.
 */
router.get('/:category', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId ?? 1;
    const settings = await getTenantSettingsByCategory(tenantId, req.params.category);
    res.json({ status: 'success', data: settings });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message || 'Failed to get settings' });
  }
});

/**
 * GET /api/v1/settings/:category/:key
 * Get a single setting value.
 */
router.get('/:category/:key', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId ?? 1;
    const value = await getTenantSetting(tenantId, req.params.category, req.params.key);
    if (value === null) {
      return res.status(404).json({ status: 'error', message: 'Setting not found' });
    }
    res.json({ status: 'success', data: { value } });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message || 'Failed to get setting' });
  }
});

/**
 * PUT /api/v1/settings/:category
 * Update multiple settings for a category (bulk upsert).
 */
router.put('/:category', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId ?? 1;
    const { settings, encrypt_keys } = req.body;

    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ status: 'error', message: 'settings object is required' });
    }

    await setTenantSettingsBulk(tenantId, req.params.category, settings, encrypt_keys || []);
    res.json({ status: 'success', message: 'Settings updated' });
  } catch (error: any) {
    res.status(400).json({ status: 'error', message: error.message || 'Failed to update settings' });
  }
});

/**
 * PUT /api/v1/settings/:category/:key
 * Set a single setting value.
 */
router.put('/:category/:key', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId ?? 1;
    const { value, encrypt } = req.body;

    if (value === undefined) {
      return res.status(400).json({ status: 'error', message: 'value is required' });
    }

    const setting = await setTenantSetting(tenantId, req.params.category, req.params.key, value, encrypt || false);
    res.json({ status: 'success', data: setting });
  } catch (error: any) {
    res.status(400).json({ status: 'error', message: error.message || 'Failed to set setting' });
  }
});

/**
 * DELETE /api/v1/settings/:category/:key
 * Delete a single setting.
 */
router.delete('/:category/:key', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId ?? 1;
    const deleted = await deleteTenantSetting(tenantId, req.params.category, req.params.key);
    if (!deleted) {
      return res.status(404).json({ status: 'error', message: 'Setting not found' });
    }
    res.json({ status: 'success', message: 'Setting deleted' });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message || 'Failed to delete setting' });
  }
});

export default router;
