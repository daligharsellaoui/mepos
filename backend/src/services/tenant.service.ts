/**
 * mePOS STOCK — Tenant Service
 * ==============================
 * Tenant CRUD, settings management, and tenant-scoped operations.
 */

import { query, isDemoMode, demoDb, getClient } from '../database';
import { encryptIfNeeded, decryptIfNeeded, isEncrypted } from './encryption.service';
import { eventBus, Events } from './event.service';

// ─── Types ───

export interface Tenant {
  id: number;
  uuid: string;
  name: string;
  slug: string;
  logo?: string;
  email?: string;
  phone?: string;
  address?: string;
  country?: string;
  timezone?: string;
  language?: string;
  currency?: string;
  status: string;
  subscription_plan?: string;
  trial_ends_at?: string;
  max_users?: number;
  max_agents?: number;
  created_at: string;
  updated_at: string;
}

export interface TenantSetting {
  id: number;
  tenant_id: number;
  category: string;
  key: string;
  value: any;
  encrypted: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateTenantInput {
  name: string;
  slug: string;
  email?: string;
  phone?: string;
  address?: string;
  country?: string;
  timezone?: string;
  language?: string;
  currency?: string;
  subscription_plan?: string;
}

export interface UpdateTenantInput {
  name?: string;
  logo?: string;
  email?: string;
  phone?: string;
  address?: string;
  country?: string;
  timezone?: string;
  language?: string;
  currency?: string;
  status?: string;
  subscription_plan?: string;
}

// ─── Tenant CRUD ───

/**
 * Get all tenants (platform admin only).
 */
export async function getAllTenants(): Promise<Tenant[]> {
  if (isDemoMode) {
    return demoDb.tenants || [];
  }
  const result = await query('SELECT * FROM tenants ORDER BY id');
  return result.rows;
}

/**
 * Get a tenant by ID.
 */
export async function getTenantById(tenantId: number): Promise<Tenant | null> {
  if (isDemoMode) {
    const tenant = (demoDb.tenants || []).find((t: any) => t.id === tenantId);
    return tenant || null;
  }
  const result = await query('SELECT * FROM tenants WHERE id = $1', [tenantId]);
  return result.rows[0] || null;
}

/**
 * Get a tenant by slug.
 */
export async function getTenantBySlug(slug: string): Promise<Tenant | null> {
  if (isDemoMode) {
    const tenant = (demoDb.tenants || []).find((t: any) => t.slug === slug);
    return tenant || null;
  }
  const result = await query('SELECT * FROM tenants WHERE slug = $1', [slug]);
  return result.rows[0] || null;
}

/**
 * Create a new tenant with default settings.
 */
export async function createTenant(input: CreateTenantInput): Promise<Tenant> {
  if (isDemoMode) {
    const newTenant: any = {
      id: (demoDb.tenants || []).length + 1,
      uuid: require('crypto').randomUUID(),
      name: input.name,
      slug: input.slug,
      email: input.email || null,
      phone: input.phone || null,
      address: input.address || null,
      country: input.country || null,
      timezone: input.timezone || 'UTC',
      language: input.language || 'fr',
      currency: input.currency || 'EUR',
      status: 'active',
      subscription_plan: input.subscription_plan || 'starter',
      max_users: 10,
      max_agents: 5,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (!demoDb.tenants) demoDb.tenants = [];
    demoDb.tenants.push(newTenant);
    eventBus.emit(Events.TENANT_CREATED, {
      tenantId: newTenant.id, name: newTenant.name, slug: newTenant.slug,
    });
    return newTenant;
  }

  const { client, release } = await getClient();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO tenants (name, slug, email, phone, address, country, timezone, language, currency, subscription_plan)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [
        input.name,
        input.slug,
        input.email || null,
        input.phone || null,
        input.address || null,
        input.country || null,
        input.timezone || 'UTC',
        input.language || 'fr',
        input.currency || 'EUR',
        input.subscription_plan || 'starter',
      ]
    );
    const tenant = result.rows[0];

    eventBus.emit(Events.TENANT_CREATED, {
      tenantId: tenant.id, name: tenant.name, slug: tenant.slug,
    });

    // Create default tenant settings
    await client.query(
      `INSERT INTO tenant_settings (tenant_id, category, key, value) VALUES
       ($1, 'restaurant', 'name', $2),
       ($1, 'restaurant', 'currency', $3),
       ($1, 'restaurant', 'timezone', $4),
       ($1, 'general', 'language', $5),
       ($1, 'sync', 'polling_interval', '12000'),
       ($1, 'inventory', 'enable_losses', 'true'),
       ($1, 'inventory', 'enable_transfers', 'true')`,
      [tenant.id, input.name, input.currency || 'EUR', input.timezone || 'UTC', input.language || 'fr']
    );

    await client.query('COMMIT');
    return tenant;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    release();
  }
}

/**
 * Update a tenant.
 */
export async function updateTenant(tenantId: number, input: UpdateTenantInput): Promise<Tenant | null> {
  if (isDemoMode) {
    const tenant = (demoDb.tenants || []).find((t: any) => t.id === tenantId);
    if (!tenant) return null;
    if (input.name !== undefined) tenant.name = input.name;
    if (input.logo !== undefined) tenant.logo = input.logo;
    if (input.email !== undefined) tenant.email = input.email;
    if (input.phone !== undefined) tenant.phone = input.phone;
    if (input.address !== undefined) tenant.address = input.address;
    if (input.country !== undefined) tenant.country = input.country;
    if (input.timezone !== undefined) tenant.timezone = input.timezone;
    if (input.language !== undefined) tenant.language = input.language;
    if (input.currency !== undefined) tenant.currency = input.currency;
    if (input.status !== undefined) tenant.status = input.status;
    if (input.subscription_plan !== undefined) tenant.subscription_plan = input.subscription_plan;
    tenant.updated_at = new Date().toISOString();
    return tenant;
  }

  const fields: string[] = [];
  const values: any[] = [];
  let paramIdx = 1;

  if (input.name !== undefined) { fields.push(`name = $${paramIdx++}`); values.push(input.name); }
  if (input.logo !== undefined) { fields.push(`logo = $${paramIdx++}`); values.push(input.logo); }
  if (input.email !== undefined) { fields.push(`email = $${paramIdx++}`); values.push(input.email); }
  if (input.phone !== undefined) { fields.push(`phone = $${paramIdx++}`); values.push(input.phone); }
  if (input.address !== undefined) { fields.push(`address = $${paramIdx++}`); values.push(input.address); }
  if (input.country !== undefined) { fields.push(`country = $${paramIdx++}`); values.push(input.country); }
  if (input.timezone !== undefined) { fields.push(`timezone = $${paramIdx++}`); values.push(input.timezone); }
  if (input.language !== undefined) { fields.push(`language = $${paramIdx++}`); values.push(input.language); }
  if (input.currency !== undefined) { fields.push(`currency = $${paramIdx++}`); values.push(input.currency); }
  if (input.status !== undefined) { fields.push(`status = $${paramIdx++}`); values.push(input.status); }
  if (input.subscription_plan !== undefined) { fields.push(`subscription_plan = $${paramIdx++}`); values.push(input.subscription_plan); }

  if (fields.length === 0) return getTenantById(tenantId);

  fields.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(tenantId);

  const result = await query(
    `UPDATE tenants SET ${fields.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
    values
  );

  const updatedTenant = result.rows[0] || null;
  if (updatedTenant) {
    eventBus.emit(Events.TENANT_UPDATED, {
      tenantId,
      name: updatedTenant.name,
      changes: input,
    });
  }

  return updatedTenant;
}

/**
 * Delete a tenant and all associated data (cascade).
 */
export async function deleteTenant(tenantId: number): Promise<boolean> {
  if (isDemoMode) {
    const idx = (demoDb.tenants || []).findIndex((t: any) => t.id === tenantId);
    if (idx === -1) return false;
    demoDb.tenants.splice(idx, 1);
    return true;
  }
  const result = await query('DELETE FROM tenants WHERE id = $1 RETURNING id', [tenantId]);
  return result.rows.length > 0;
}

/**
 * Suspend a tenant.
 */
export async function suspendTenant(tenantId: number): Promise<Tenant | null> {
  return updateTenant(tenantId, { status: 'suspended' });
}

/**
 * Activate a tenant.
 */
export async function activateTenant(tenantId: number): Promise<Tenant | null> {
  return updateTenant(tenantId, { status: 'active' });
}

// ─── Tenant Settings ───

/**
 * Get all settings for a tenant (grouped by category).
 */
export async function getTenantSettings(tenantId: number): Promise<Record<string, Record<string, any>>> {
  if (isDemoMode) {
    const settings = (demoDb.tenant_settings || []).filter((s: any) => s.tenant_id === tenantId);
    const grouped: Record<string, Record<string, any>> = {};
    for (const s of settings) {
      if (!grouped[s.category]) grouped[s.category] = {};
      grouped[s.category][s.key] = isEncrypted(s.value) ? decryptIfNeeded(s.value) : s.value;
    }
    return grouped;
  }

  const result = await query(
    'SELECT category, key, value, encrypted FROM tenant_settings WHERE tenant_id = $1',
    [tenantId]
  );

  const grouped: Record<string, Record<string, any>> = {};
  for (const row of result.rows) {
    if (!grouped[row.category]) grouped[row.category] = {};
    grouped[row.category][row.key] = row.encrypted ? decryptIfNeeded(row.value) : row.value;
  }
  return grouped;
}

/**
 * Get settings for a specific category.
 */
export async function getTenantSettingsByCategory(
  tenantId: number,
  category: string
): Promise<Record<string, any>> {
  if (isDemoMode) {
    const settings = (demoDb.tenant_settings || []).filter(
      (s: any) => s.tenant_id === tenantId && s.category === category
    );
    const result: Record<string, any> = {};
    for (const s of settings) {
      result[s.key] = isEncrypted(s.value) ? decryptIfNeeded(s.value) : s.value;
    }
    return result;
  }

  const result = await query(
    'SELECT key, value, encrypted FROM tenant_settings WHERE tenant_id = $1 AND category = $2',
    [tenantId, category]
  );

  const settings: Record<string, any> = {};
  for (const row of result.rows) {
    settings[row.key] = row.encrypted ? decryptIfNeeded(row.value) : row.value;
  }
  return settings;
}

/**
 * Get a single setting value.
 */
export async function getTenantSetting(
  tenantId: number,
  category: string,
  key: string
): Promise<any | null> {
  if (isDemoMode) {
    const setting = (demoDb.tenant_settings || []).find(
      (s: any) => s.tenant_id === tenantId && s.category === category && s.key === key
    );
    if (!setting) return null;
    return isEncrypted(setting.value) ? decryptIfNeeded(setting.value) : setting.value;
  }

  const result = await query(
    'SELECT value, encrypted FROM tenant_settings WHERE tenant_id = $1 AND category = $2 AND key = $3',
    [tenantId, category, key]
  );

  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return row.encrypted ? decryptIfNeeded(row.value) : row.value;
}

/**
 * Set a single setting value (upsert).
 */
export async function setTenantSetting(
  tenantId: number,
  category: string,
  key: string,
  value: any,
  encrypt: boolean = false
): Promise<TenantSetting> {
  const storedValue = encrypt ? encryptIfNeeded(typeof value === 'string' ? value : JSON.stringify(value)) : (typeof value === 'string' ? value : JSON.stringify(value));

  if (isDemoMode) {
    const existing = (demoDb.tenant_settings || []).find(
      (s: any) => s.tenant_id === tenantId && s.category === category && s.key === key
    );
    if (existing) {
      existing.value = storedValue;
      existing.encrypted = encrypt;
      existing.updated_at = new Date().toISOString();
      return existing;
    }
    const newSetting: any = {
      id: (demoDb.tenant_settings || []).length + 1,
      tenant_id: tenantId,
      category,
      key,
      value: storedValue,
      encrypted: encrypt,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (!demoDb.tenant_settings) demoDb.tenant_settings = [];
    demoDb.tenant_settings.push(newSetting);
    eventBus.emit(Events.SETTINGS_UPDATED, {
      tenantId, category, key,
    });
    eventBus.emit(Events.TENANT_SETTINGS_CHANGED, {
      tenantId, category, key,
    });
    return newSetting;
  }

  const result = await query(
    `INSERT INTO tenant_settings (tenant_id, category, key, value, encrypted)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (tenant_id, category, key)
     DO UPDATE SET value = $4, encrypted = $5, updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [tenantId, category, key, storedValue, encrypt]
  );
  eventBus.emit(Events.SETTINGS_UPDATED, {
    tenantId, category, key,
  });
  eventBus.emit(Events.TENANT_SETTINGS_CHANGED, {
    tenantId, category, key,
  });
  return result.rows[0];
}

/**
 * Set multiple settings for a category at once.
 */
export async function setTenantSettingsBulk(
  tenantId: number,
  category: string,
  settings: Record<string, any>,
  encryptKeys: string[] = []
): Promise<void> {
  for (const [key, value] of Object.entries(settings)) {
    const shouldEncrypt = encryptKeys.includes(key);
    await setTenantSetting(tenantId, category, key, value, shouldEncrypt);
  }
}

/**
 * Delete a setting.
 */
export async function deleteTenantSetting(
  tenantId: number,
  category: string,
  key: string
): Promise<boolean> {
  if (isDemoMode) {
    const idx = (demoDb.tenant_settings || []).findIndex(
      (s: any) => s.tenant_id === tenantId && s.category === category && s.key === key
    );
    if (idx === -1) return false;
    demoDb.tenant_settings.splice(idx, 1);
    return true;
  }

  const result = await query(
    'DELETE FROM tenant_settings WHERE tenant_id = $1 AND category = $2 AND key = $3 RETURNING id',
    [tenantId, category, key]
  );
  return result.rows.length > 0;
}

/**
 * Get tenant statistics (user count, agent count, etc).
 */
export async function getTenantStats(tenantId: number): Promise<any> {
  if (isDemoMode) {
    return {
      user_count: (demoDb.users || []).filter((u: any) => u.tenant_id === tenantId).length,
      agent_count: (demoDb.agents || []).filter((a: any) => a.tenant_id === tenantId).length,
      department_count: (demoDb.departments || []).filter((d: any) => d.tenant_id === tenantId).length,
      ingredient_count: (demoDb.ingredients || []).filter((i: any) => i.tenant_id === tenantId).length,
      recipe_count: (demoDb.recipes || []).filter((r: any) => r.tenant_id === tenantId).length,
    };
  }

  const result = await query(`
    SELECT
      (SELECT count(*) FROM users WHERE tenant_id = $1) as user_count,
      (SELECT count(*) FROM agents WHERE tenant_id = $1) as agent_count,
      (SELECT count(*) FROM departments WHERE tenant_id = $1) as department_count,
      (SELECT count(*) FROM ingredients WHERE tenant_id = $1) as ingredient_count,
      (SELECT count(*) FROM recipes WHERE tenant_id = $1) as recipe_count
  `, [tenantId]);
  return result.rows[0];
}
