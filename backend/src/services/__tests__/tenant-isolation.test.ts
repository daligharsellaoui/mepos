import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { demoDb } from '../../database';
import { createTenant, deleteTenant, getTenantById, getTenantSettings } from '../tenant.service';
import { getAgentsByTenant, createAgent } from '../agent.service';
import { getAllUsers, createUser } from '../auth.service';
import { getAllDepartments } from '../inventory.service';

const cleanupTenantIds: number[] = [];
const TENANT_A_SLUG = 'tenant-a-isolated';
const TENANT_B_SLUG = 'tenant-b-isolated';

afterEach(async () => {
  for (const id of cleanupTenantIds) {
    const idx = (demoDb.tenants || []).findIndex((t: any) => t.id === id);
    if (idx !== -1) demoDb.tenants.splice(idx, 1);
  }
  cleanupTenantIds.length = 0;

  if (demoDb.users) {
    demoDb.users.length = 0;
    demoDb.users.push(
      { id: 1, tenant_id: 1, username: 'admin', password_hash: 'admin123', role: 'admin', first_name: 'Med', last_name: 'Mair' },
      { id: 2, tenant_id: 1, username: 'gerant', password_hash: 'gerant123', role: 'manager', first_name: 'Ahmed', last_name: 'Ben Ali' },
      { id: 3, tenant_id: 1, username: 'cuisinier', password_hash: 'cuisinier123', role: 'cook', first_name: 'Youssef', last_name: 'Tunisi' },
    );
  }

  if (demoDb.agents) demoDb.agents.length = 0;
  if (demoDb.tenant_settings) demoDb.tenant_settings.length = 0;
});

describe('Tenant Isolation (Demo Mode)', () => {
  let tenantA: any;
  let tenantB: any;

  beforeAll(async () => {
    tenantA = await createTenant({ name: 'Tenant A', slug: TENANT_A_SLUG });
    cleanupTenantIds.push(tenantA.id);
    tenantB = await createTenant({ name: 'Tenant B', slug: TENANT_B_SLUG });
    cleanupTenantIds.push(tenantB.id);
  });

  describe('Tenant records are isolated', () => {
    it('should not leak tenant A info when fetching tenant B', async () => {
      const fetchedA = await getTenantById(tenantA.id);
      const fetchedB = await getTenantById(tenantB.id);

      expect(fetchedA!.slug).toBe(TENANT_A_SLUG);
      expect(fetchedB!.slug).toBe(TENANT_B_SLUG);
      expect(fetchedA!.id).not.toBe(fetchedB!.id);
    });

    it('should return null for non-existent tenant ID', async () => {
      const result = await getTenantById(99999);
      expect(result).toBeNull();
    });
  });

  describe('Agent isolation', () => {
    it('should not leak agents between tenants', async () => {
      const { agent: agentA } = await createAgent(tenantA.id, { name: 'Agent Alpha' });
      await createAgent(tenantB.id, { name: 'Agent Beta' });

      const agentsA = await getAgentsByTenant(tenantA.id);
      const agentsB = await getAgentsByTenant(tenantB.id);

      expect(agentsA.length).toBe(1);
      expect(agentsA[0].name).toBe('Agent Alpha');
      expect(agentsA[0].tenant_id).toBe(tenantA.id);

      expect(agentsB.length).toBe(1);
      expect(agentsB[0].name).toBe('Agent Beta');
      expect(agentsB[0].tenant_id).toBe(tenantB.id);

      demoDb.agents = demoDb.agents.filter(
        (a: any) => a.id !== agentA.id
      );
    });
  });

  describe('User isolation', () => {
    it('should scope user listing by tenant', async () => {
      const u1 = await createUser({ username: 'user_a', password: 'pass', role: 'cook', tenantId: tenantA.id });
      const u2 = await createUser({ username: 'user_b', password: 'pass', role: 'cook', tenantId: tenantB.id });

      const usersA = await getAllUsers(tenantA.id);
      const usersB = await getAllUsers(tenantB.id);

      expect(usersA.some((u: any) => u.username === 'user_a')).toBe(true);
      expect(usersA.some((u: any) => u.username === 'user_b')).toBe(false);

      expect(usersB.some((u: any) => u.username === 'user_b')).toBe(true);
      expect(usersB.some((u: any) => u.username === 'user_a')).toBe(false);

      demoDb.users = demoDb.users.filter(
        (u: any) => u.id !== u1.id && u.id !== u2.id
      );
    });
  });

  describe('Department isolation', () => {
    it('should scope department listing by tenant', async () => {
      const deptsA = await getAllDepartments(tenantA.id);
      const deptsB = await getAllDepartments(tenantB.id);

      const deptNamesA = deptsA.map((d: any) => d.name);
      const deptNamesB = deptsB.map((d: any) => d.name);

      deptNamesA.forEach((name: string) => {
        expect(deptNamesB.includes(name)).toBe(false);
      });
    });

    it('should return empty departments for a tenant with none', async () => {
      const deptsB = await getAllDepartments(tenantB.id);
      expect(deptsB.length).toBe(0);
    });
  });

  describe('Settings isolation', () => {
    it('should not leak settings between tenants', async () => {
      const { setTenantSetting } = await import('../tenant.service');

      await setTenantSetting(tenantA.id, 'general', 'theme', 'dark');
      await setTenantSetting(tenantB.id, 'general', 'theme', 'light');

      const settingsA = await getTenantSettings(tenantA.id);
      const settingsB = await getTenantSettings(tenantB.id);

      expect(settingsA.general?.theme).toBe('dark');
      expect(settingsB.general?.theme).toBe('light');
    });
  });
});
