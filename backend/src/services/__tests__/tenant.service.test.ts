import { describe, it, expect, afterEach } from 'vitest';
import { demoDb } from '../../database';
import {
  getAllTenants,
  getTenantById,
  getTenantBySlug,
  createTenant,
  updateTenant,
  deleteTenant,
  suspendTenant,
  activateTenant,
  getTenantSettings,
  getTenantSettingsByCategory,
  getTenantSetting,
  setTenantSetting,
  setTenantSettingsBulk,
  deleteTenantSetting,
  getTenantStats,
} from '../tenant.service';

const createdTenantIds: number[] = [];

afterEach(async () => {
  for (const tenantId of createdTenantIds) {
    const idx = (demoDb.tenants || []).findIndex((t: any) => t.id === tenantId);
    if (idx !== -1) demoDb.tenants.splice(idx, 1);
  }
  createdTenantIds.length = 0;

  if (demoDb.tenant_settings) {
    demoDb.tenant_settings.length = 0;
  }

  const defaultTenant = (demoDb.tenants || []).find((t: any) => t.id === 1);
  if (defaultTenant) {
    defaultTenant.status = 'active';
    defaultTenant.subscription_plan = 'starter';
  }
});

describe('Tenant Service (Demo Mode)', () => {
  describe('getAllTenants', () => {
    it('should return the default tenant', async () => {
      const tenants = await getAllTenants();
      expect(tenants.length).toBeGreaterThanOrEqual(1);
      expect(tenants[0].name).toBe('Restaurant Demo');
    });

    it('should return all created tenants', async () => {
      const t1 = await createTenant({ name: 'Tenant Alpha', slug: 'alpha' });
      createdTenantIds.push(t1.id);
      const t2 = await createTenant({ name: 'Tenant Beta', slug: 'beta' });
      createdTenantIds.push(t2.id);

      const tenants = await getAllTenants();
      const names = tenants.map((t: any) => t.name);
      expect(names).toContain('Tenant Alpha');
      expect(names).toContain('Tenant Beta');
    });
  });

  describe('getTenantById', () => {
    it('should return the default tenant by ID', async () => {
      const tenant = await getTenantById(1);
      expect(tenant).not.toBeNull();
      expect(tenant!.name).toBe('Restaurant Demo');
      expect(tenant!.slug).toBe('restaurant-demo');
    });

    it('should return null for non-existent ID', async () => {
      const tenant = await getTenantById(99999);
      expect(tenant).toBeNull();
    });
  });

  describe('getTenantBySlug', () => {
    it('should find tenant by slug', async () => {
      const tenant = await getTenantBySlug('restaurant-demo');
      expect(tenant).not.toBeNull();
      expect(tenant!.id).toBe(1);
    });

    it('should return null for unknown slug', async () => {
      const tenant = await getTenantBySlug('does-not-exist');
      expect(tenant).toBeNull();
    });
  });

  describe('createTenant', () => {
    it('should create a tenant with default values', async () => {
      const tenant = await createTenant({
        name: 'New Restaurant',
        slug: 'new-restaurant',
      });
      createdTenantIds.push(tenant.id);

      expect(tenant.name).toBe('New Restaurant');
      expect(tenant.slug).toBe('new-restaurant');
      expect(tenant.status).toBe('active');
      expect(tenant.subscription_plan).toBe('starter');
      expect(tenant.timezone).toBe('UTC');
      expect(tenant.language).toBe('fr');
      expect(tenant.currency).toBe('EUR');
      expect(tenant.uuid).toBeDefined();
    });

    it('should create a tenant with custom values', async () => {
      const tenant = await createTenant({
        name: 'Pizza Napoli',
        slug: 'pizza-napoli',
        email: 'info@pizzanapoli.com',
        phone: '+216123456',
        address: 'Tunis',
        country: 'Tunisia',
        timezone: 'Africa/Tunis',
        language: 'ar',
        currency: 'TND',
        subscription_plan: 'professional',
      });
      createdTenantIds.push(tenant.id);

      expect(tenant.email).toBe('info@pizzanapoli.com');
      expect(tenant.phone).toBe('+216123456');
      expect(tenant.address).toBe('Tunis');
      expect(tenant.country).toBe('Tunisia');
      expect(tenant.timezone).toBe('Africa/Tunis');
      expect(tenant.language).toBe('ar');
      expect(tenant.currency).toBe('TND');
      expect(tenant.subscription_plan).toBe('professional');
    });
  });

  describe('updateTenant', () => {
    it('should update tenant properties', async () => {
      const tenant = await createTenant({ name: 'Old Name', slug: 'old-name' });
      createdTenantIds.push(tenant.id);

      const updated = await updateTenant(tenant.id, {
        name: 'New Name',
        email: 'new@email.com',
        timezone: 'America/New_York',
      });

      expect(updated).not.toBeNull();
      expect(updated!.name).toBe('New Name');
      expect(updated!.email).toBe('new@email.com');
      expect(updated!.timezone).toBe('America/New_York');
    });

    it('should return null for non-existent tenant', async () => {
      const result = await updateTenant(99999, { name: 'Ghost' });
      expect(result).toBeNull();
    });

    it('should preserve unchanged fields', async () => {
      const tenant = await createTenant({
        name: 'Original',
        slug: 'original',
        currency: 'USD',
      });
      createdTenantIds.push(tenant.id);

      const updated = await updateTenant(tenant.id, { name: 'Updated' });
      expect(updated!.name).toBe('Updated');
      expect(updated!.currency).toBe('USD');
    });
  });

  describe('deleteTenant', () => {
    it('should delete a tenant', async () => {
      const tenant = await createTenant({ name: 'To Delete', slug: 'to-delete' });
      createdTenantIds.push(tenant.id);

      const deleted = await deleteTenant(tenant.id);
      expect(deleted).toBe(true);

      const found = await getTenantById(tenant.id);
      expect(found).toBeNull();
    });

    it('should return false for non-existent tenant', async () => {
      const result = await deleteTenant(99999);
      expect(result).toBe(false);
    });
  });

  describe('suspendTenant / activateTenant', () => {
    it('should suspend a tenant', async () => {
      const tenant = await createTenant({ name: 'Suspend Test', slug: 'suspend-test' });
      createdTenantIds.push(tenant.id);

      const suspended = await suspendTenant(tenant.id);
      expect(suspended).not.toBeNull();
      expect(suspended!.status).toBe('suspended');
    });

    it('should activate a tenant', async () => {
      const tenant = await createTenant({ name: 'Activate Test', slug: 'activate-test' });
      createdTenantIds.push(tenant.id);

      await suspendTenant(tenant.id);
      const activated = await activateTenant(tenant.id);
      expect(activated!.status).toBe('active');
    });
  });

  describe('Tenant Settings', () => {
    it('should set and get a setting', async () => {
      const setting = await setTenantSetting(1, 'general', 'language', 'en');
      expect(setting.key).toBe('language');
      expect(setting.value).toBe('en');
      expect(setting.encrypted).toBe(false);
      expect(setting.tenant_id).toBe(1);

      const value = await getTenantSetting(1, 'general', 'language');
      expect(value).toBe('en');
    });

    it('should update an existing setting (upsert)', async () => {
      await setTenantSetting(1, 'general', 'language', 'en');
      await setTenantSetting(1, 'general', 'language', 'fr');

      const value = await getTenantSetting(1, 'general', 'language');
      expect(value).toBe('fr');
    });

    it('should encrypt setting values when requested', async () => {
      await setTenantSetting(1, 'sync', 'api_key', 'sk-secret-123', true);

      const setting = demoDb.tenant_settings.find(
        (s: any) => s.tenant_id === 1 && s.category === 'sync' && s.key === 'api_key'
      );
      expect(setting.encrypted).toBe(true);

      const value = await getTenantSetting(1, 'sync', 'api_key');
      expect(value).toBe('sk-secret-123');
    });

    it('should return null for non-existent setting', async () => {
      const value = await getTenantSetting(1, 'nonexistent', 'key');
      expect(value).toBeNull();
    });

    it('should delete a setting', async () => {
      await setTenantSetting(1, 'general', 'todelete', 'value');
      const deleted = await deleteTenantSetting(1, 'general', 'todelete');
      expect(deleted).toBe(true);

      const value = await getTenantSetting(1, 'general', 'todelete');
      expect(value).toBeNull();
    });

    it('should return false when deleting non-existent setting', async () => {
      const result = await deleteTenantSetting(1, 'no-category', 'no-key');
      expect(result).toBe(false);
    });

    it('should get settings grouped by category', async () => {
      await setTenantSetting(1, 'restaurant', 'name', 'Demo');
      await setTenantSetting(1, 'restaurant', 'currency', 'TND');
      await setTenantSetting(1, 'sync', 'polling', '5000');

      const all = await getTenantSettings(1);
      expect(all.restaurant).toBeDefined();
      expect(all.restaurant.name).toBe('Demo');
      expect(all.restaurant.currency).toBe('TND');
      expect(all.sync.polling).toBe('5000');
    });

    it('should get settings by category', async () => {
      await setTenantSetting(1, 'notifications', 'email', 'true');
      await setTenantSetting(1, 'notifications', 'sms', 'false');

      const settings = await getTenantSettingsByCategory(1, 'notifications');
      expect(settings.email).toBe('true');
      expect(settings.sms).toBe('false');
    });

    it('should return empty object for unknown category', async () => {
      const settings = await getTenantSettingsByCategory(1, 'unknown');
      expect(settings).toEqual({});
    });

    it('should bulk set settings', async () => {
      await setTenantSettingsBulk(1, 'inventory', {
        enable_losses: 'true',
        enable_transfers: 'true',
        stock_alert: '10',
      });

      const value = await getTenantSetting(1, 'inventory', 'enable_losses');
      expect(value).toBe('true');
    });

    it('should encrypt specified keys in bulk set', async () => {
      await setTenantSettingsBulk(
        1,
        'sync',
        { api_key: 'sk-123', endpoint: 'https://api.example.com' },
        ['api_key']
      );

      const rawSetting = demoDb.tenant_settings.find(
        (s: any) => s.tenant_id === 1 && s.category === 'sync' && s.key === 'api_key'
      );
      expect(rawSetting.encrypted).toBe(true);

      const value = await getTenantSetting(1, 'sync', 'api_key');
      expect(value).toBe('sk-123');
    });
  });

  describe('getTenantStats', () => {
    it('should return stats for tenant 1', async () => {
      const stats = await getTenantStats(1);

      expect(stats).toBeDefined();
      expect(stats.user_count).toBeGreaterThanOrEqual(3);
      expect(stats.department_count).toBe(3);
      expect(stats.ingredient_count).toBe(13);
      expect(stats.recipe_count).toBe(9);
      expect(stats.agent_count).toBe(0);
    });

    it('should return zero counts for tenant with no data', async () => {
      const tenant = await createTenant({ name: 'Empty', slug: 'empty' });
      createdTenantIds.push(tenant.id);

      const stats = await getTenantStats(tenant.id);
      expect(stats.user_count).toBe(0);
      expect(stats.agent_count).toBe(0);
      expect(stats.department_count).toBe(0);
      expect(stats.ingredient_count).toBe(0);
      expect(stats.recipe_count).toBe(0);
    });
  });
});
