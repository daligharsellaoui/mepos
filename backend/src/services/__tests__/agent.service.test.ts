import { describe, it, expect, afterEach } from 'vitest';
import { demoDb } from '../../database';
import {
  getAgentsByTenant,
  getAgentById,
  createAgent,
  updateAgent,
  deleteAgent,
  enableAgent,
  disableAgent,
  rotateAgentSecret,
  authenticateAgent,
  processHeartbeat,
  getAgentConfig,
  updateAgentConfig,
  getAgentHeartbeats,
  getAgentSyncStatus,
} from '../agent.service';

const createdAgentIds: number[] = [];
const TENANT_ID = 1;
const OTHER_TENANT_ID = 999;

afterEach(async () => {
  for (const agentId of createdAgentIds) {
    const idx = (demoDb.agents || []).findIndex((a: any) => a.id === agentId);
    if (idx !== -1) demoDb.agents.splice(idx, 1);
  }
  createdAgentIds.length = 0;

  if (demoDb.agent_heartbeats) {
    demoDb.agent_heartbeats.length = 0;
  }
});

describe('Agent Service (Demo Mode)', () => {
  describe('createAgent', () => {
    it('should create an agent with default values', async () => {
      const { agent, secret } = await createAgent(TENANT_ID, { name: 'Test Agent' });
      createdAgentIds.push(agent.id);

      expect(agent.name).toBe('Test Agent');
      expect(agent.tenant_id).toBe(TENANT_ID);
      expect(agent.connector_type).toBe('database');
      expect(agent.status).toBe('offline');
      expect(agent.health_status).toBe('unknown');
      expect(agent.uuid).toBeDefined();
      expect((agent as any).agent_secret_hash).toBeUndefined();
      expect(secret).toBeDefined();
      expect(secret.length).toBe(64);
    });

    it('should create an agent with all fields', async () => {
      const { agent, secret } = await createAgent(TENANT_ID, {
        name: 'Kitchen Terminal 1',
        machine_name: 'kt-01',
        machine_id: 'MACH-001',
        operating_system: 'Linux 6.1',
        version: '2.5.0',
        connector_type: 'api',
        config: { apiUrl: 'https://pos.example.com' },
      });
      createdAgentIds.push(agent.id);

      expect(agent.name).toBe('Kitchen Terminal 1');
      expect(agent.machine_name).toBe('kt-01');
      expect(agent.machine_id).toBe('MACH-001');
      expect(agent.operating_system).toBe('Linux 6.1');
      expect(agent.version).toBe('2.5.0');
      expect(agent.connector_type).toBe('api');
      expect(agent.config).toEqual({ apiUrl: 'https://pos.example.com' });
      expect(secret).toBeDefined();
    });
  });

  describe('getAgentsByTenant', () => {
    it('should return seeded agents for tenant 1', async () => {
      const agents = await getAgentsByTenant(TENANT_ID);
      expect(agents.length).toBeGreaterThanOrEqual(1);
      expect(agents.some((a: any) => a.name === 'POS-DB-Sync')).toBe(true);
    });

    it('should return only agents for the given tenant', async () => {
      const { agent: a1 } = await createAgent(TENANT_ID, { name: 'Agent A' });
      createdAgentIds.push(a1.id);
      const { agent: a2 } = await createAgent(TENANT_ID, { name: 'Agent B' });
      createdAgentIds.push(a2.id);

      const agents = await getAgentsByTenant(TENANT_ID);
      expect(agents.length).toBe(3); // 1 seeded + 2 created
      expect(agents.map((a: any) => a.name).sort()).toEqual(['Agent A', 'Agent B', 'POS-DB-Sync']);
      agents.forEach((a: any) => {
        expect((a as any).agent_secret_hash).toBeUndefined();
      });
    });

    it('should not return agents from other tenants', async () => {
      const { agent } = await createAgent(TENANT_ID, { name: 'My Agent' });
      createdAgentIds.push(agent.id);

      const otherAgents = await getAgentsByTenant(OTHER_TENANT_ID);
      expect(otherAgents).toEqual([]);
    });
  });

  describe('getAgentById', () => {
    it('should return an agent by ID', async () => {
      const { agent } = await createAgent(TENANT_ID, { name: 'Find Me' });
      createdAgentIds.push(agent.id);

      const found = await getAgentById(agent.id, TENANT_ID);
      expect(found).not.toBeNull();
      expect(found!.name).toBe('Find Me');
      expect((found as any).agent_secret_hash).toBeUndefined();
    });

    it('should return null for non-existent agent', async () => {
      const found = await getAgentById(99999, TENANT_ID);
      expect(found).toBeNull();
    });

    it('should return null for agent in different tenant', async () => {
      const { agent } = await createAgent(TENANT_ID, { name: 'Wrong Tenant' });
      createdAgentIds.push(agent.id);

      const found = await getAgentById(agent.id, OTHER_TENANT_ID);
      expect(found).toBeNull();
    });
  });

  describe('updateAgent', () => {
    it('should update agent properties', async () => {
      const { agent } = await createAgent(TENANT_ID, { name: 'Old Name' });
      createdAgentIds.push(agent.id);

      const updated = await updateAgent(agent.id, TENANT_ID, {
        name: 'New Name',
        version: '2.6.0',
        machine_name: 'updated-machine',
      });

      expect(updated).not.toBeNull();
      expect(updated!.name).toBe('New Name');
      expect(updated!.version).toBe('2.6.0');
      expect(updated!.machine_name).toBe('updated-machine');
    });

    it('should return null for non-existent agent', async () => {
      const result = await updateAgent(99999, TENANT_ID, { name: 'Ghost' });
      expect(result).toBeNull();
    });

    it('should return null for agent in different tenant', async () => {
      const { agent } = await createAgent(TENANT_ID, { name: 'Mine' });
      createdAgentIds.push(agent.id);

      const result = await updateAgent(agent.id, OTHER_TENANT_ID, { name: 'Theirs' });
      expect(result).toBeNull();
    });
  });

  describe('deleteAgent', () => {
    it('should delete an agent', async () => {
      const { agent } = await createAgent(TENANT_ID, { name: 'To Delete' });
      createdAgentIds.push(agent.id);

      const deleted = await deleteAgent(agent.id, TENANT_ID);
      expect(deleted).toBe(true);

      const found = await getAgentById(agent.id, TENANT_ID);
      expect(found).toBeNull();
    });

    it('should return false for non-existent agent', async () => {
      const result = await deleteAgent(99999, TENANT_ID);
      expect(result).toBe(false);
    });

    it('should return false when agent belongs to different tenant', async () => {
      const { agent } = await createAgent(TENANT_ID, { name: 'Not Yours' });
      createdAgentIds.push(agent.id);

      const result = await deleteAgent(agent.id, OTHER_TENANT_ID);
      expect(result).toBe(false);
    });
  });

  describe('enableAgent / disableAgent', () => {
    it('should disable an agent', async () => {
      const { agent } = await createAgent(TENANT_ID, { name: 'Toggle Me' });
      createdAgentIds.push(agent.id);

      const disabled = await disableAgent(agent.id, TENANT_ID);
      expect(disabled).not.toBeNull();
      expect(disabled!.status).toBe('disabled');
    });

    it('should enable an agent', async () => {
      const { agent } = await createAgent(TENANT_ID, { name: 'Enable Me' });
      createdAgentIds.push(agent.id);

      await disableAgent(agent.id, TENANT_ID);
      const enabled = await enableAgent(agent.id, TENANT_ID);
      expect(enabled).not.toBeNull();
      expect(enabled!.status).toBe('offline');
    });

    it('should return null when disabling non-existent agent', async () => {
      const result = await disableAgent(99999, TENANT_ID);
      expect(result).toBeNull();
    });

    it('should return null when enabling agent from different tenant', async () => {
      const { agent } = await createAgent(TENANT_ID, { name: 'Locked' });
      createdAgentIds.push(agent.id);

      const result = await enableAgent(agent.id, OTHER_TENANT_ID);
      expect(result).toBeNull();
    });
  });

  describe('rotateAgentSecret', () => {
    it('should rotate the agent secret', async () => {
      const { agent, secret: oldSecret } = await createAgent(TENANT_ID, { name: 'Rotate Me' });
      createdAgentIds.push(agent.id);

      const rotated = await rotateAgentSecret(agent.id, TENANT_ID);
      expect(rotated).not.toBeNull();
      expect(rotated!.secret).toBeDefined();
      expect(rotated!.secret).not.toBe(oldSecret);
      expect(rotated!.agent.id).toBe(agent.id);

      const authWithOld = authenticateAgent(agent.id, oldSecret);
      await expect(authWithOld).rejects.toThrow('Invalid agent secret');
    });

    it('should return null for non-existent agent', async () => {
      const result = await rotateAgentSecret(99999, TENANT_ID);
      expect(result).toBeNull();
    });
  });

  describe('authenticateAgent', () => {
    it('should authenticate with valid credentials', async () => {
      const { agent, secret } = await createAgent(TENANT_ID, { name: 'Auth Test' });
      createdAgentIds.push(agent.id);

      const result = await authenticateAgent(agent.id, secret);
      expect(result.token).toBeDefined();
      expect(result.agent.id).toBe(agent.id);
      expect(result.agent.name).toBe('Auth Test');
      expect(result.config).toBeDefined();
      expect((result.agent as any).agent_secret_hash).toBeUndefined();
    });

    it('should reject invalid secret', async () => {
      const { agent } = await createAgent(TENANT_ID, { name: 'Wrong Secret' });
      createdAgentIds.push(agent.id);

      await expect(authenticateAgent(agent.id, 'wrong-secret'))
        .rejects.toThrow('Invalid agent secret');
    });

    it('should reject non-existent agent', async () => {
      await expect(authenticateAgent(99999, 'any-secret'))
        .rejects.toThrow('Agent not found');
    });

    it('should reject disabled agent', async () => {
      const { agent, secret } = await createAgent(TENANT_ID, { name: 'Disabled Agent' });
      createdAgentIds.push(agent.id);

      await disableAgent(agent.id, TENANT_ID);
      await expect(authenticateAgent(agent.id, secret))
        .rejects.toThrow('Agent is disabled');
    });

    it('should update agent status to online after auth', async () => {
      const { agent, secret } = await createAgent(TENANT_ID, { name: 'Go Online' });
      createdAgentIds.push(agent.id);

      await authenticateAgent(agent.id, secret);
      const found = await getAgentById(agent.id, TENANT_ID);
      expect(found!.status).toBe('online');
    });

    it('should return decrypted config', async () => {
      const { agent, secret } = await createAgent(TENANT_ID, {
        name: 'Config Check',
        config: { password: 'secret123', host: 'db.example.com' },
      });
      createdAgentIds.push(agent.id);

      const result = await authenticateAgent(agent.id, secret);
      expect(result.config.password).toBe('secret123');
      expect(result.config.host).toBe('db.example.com');
    });
  });

  describe('processHeartbeat', () => {
    it('should process a heartbeat successfully', async () => {
      const { agent, secret } = await createAgent(TENANT_ID, { name: 'Heartbeat Agent' });
      createdAgentIds.push(agent.id);

      await authenticateAgent(agent.id, secret);

      const result = await processHeartbeat(agent.id, TENANT_ID, {
        version: '2.5.0',
        health_status: 'healthy',
        connector_status: 'connected',
        tickets_imported: 10,
        errors_count: 0,
        warnings: [],
      });

      expect(result.success).toBe(true);
    });

    it('should return success: false for non-existent agent', async () => {
      const result = await processHeartbeat(99999, TENANT_ID, {});
      expect(result.success).toBe(false);
    });

    it('should update agent heartbeat fields', async () => {
      const { agent, secret } = await createAgent(TENANT_ID, { name: 'Update Agent' });
      createdAgentIds.push(agent.id);

      await authenticateAgent(agent.id, secret);
      await processHeartbeat(agent.id, TENANT_ID, {
        version: '2.6.0',
        health_status: 'degraded',
        last_sync_at: new Date().toISOString(),
      });

      const updated = await getAgentById(agent.id, TENANT_ID);
      expect(updated!.version).toBe('2.6.0');
      expect(updated!.health_status).toBe('degraded');
      expect(updated!.status).toBe('online');
    });

    it('should update agent status on heartbeat', async () => {
      const { agent, secret } = await createAgent(TENANT_ID, { name: 'Heartbeat Updater' });
      createdAgentIds.push(agent.id);

      await authenticateAgent(agent.id, secret);
      await processHeartbeat(agent.id, TENANT_ID, {
        version: '1.0.0',
        health_status: 'healthy',
        status: 'active',
      });

      const updated = await getAgentById(agent.id, TENANT_ID);
      expect(updated!.version).toBe('1.0.0');
      expect(updated!.health_status).toBe('healthy');
      expect(updated!.status).toBe('online');
    });
  });

  describe('getAgentConfig / updateAgentConfig', () => {
    it('should store and return decrypted config', async () => {
      const { agent } = await createAgent(TENANT_ID, { name: 'Config Store' });
      createdAgentIds.push(agent.id);

      const config = { password: 'db-password', apiKey: 'api-key-123', host: 'localhost' };
      const updated = await updateAgentConfig(agent.id, TENANT_ID, config);
      expect(updated).toBe(true);

      const stored = await getAgentConfig(agent.id, TENANT_ID);
      expect(stored.password).toBe('db-password');
      expect(stored.apiKey).toBe('api-key-123');
      expect(stored.host).toBe('localhost');
    });

    it('should return null for non-existent agent config', async () => {
      const result = await getAgentConfig(99999, TENANT_ID);
      expect(result).toBeNull();
    });

    it('should return false when updating config for non-existent agent', async () => {
      const result = await updateAgentConfig(99999, TENANT_ID, { key: 'value' });
      expect(result).toBe(false);
    });

    it('should encrypt sensitive fields in demoDb agent config', async () => {
      const { agent } = await createAgent(TENANT_ID, { name: 'Encrypt Check' });
      createdAgentIds.push(agent.id);

      await updateAgentConfig(agent.id, TENANT_ID, { password: 'plaintext-pw' });

      const storedAgent = demoDb.agents.find((a: any) => a.id === agent.id);
      expect(storedAgent.config.password).not.toBe('plaintext-pw');
      expect(storedAgent.config.password.split(':').length).toBe(3);
    });
  });

  describe('getAgentHeartbeats', () => {
    it('should return heartbeats in reverse chronological order', async () => {
      if (!demoDb.agent_heartbeats) demoDb.agent_heartbeats = [];

      demoDb.agent_heartbeats.push(
        { agent_id: 1, tenant_id: TENANT_ID, tickets_imported: 5, created_at: '2026-07-20T10:00:00Z' },
        { agent_id: 1, tenant_id: TENANT_ID, tickets_imported: 10, created_at: '2026-07-20T11:00:00Z' },
      );

      const heartbeats = await getAgentHeartbeats(1, TENANT_ID);
      expect(heartbeats.length).toBe(2);
      expect(heartbeats[0].tickets_imported).toBe(10);
      expect(heartbeats[1].tickets_imported).toBe(5);
    });

    it('should return empty array for agent with no heartbeats', async () => {
      const heartbeats = await getAgentHeartbeats(99999, TENANT_ID);
      expect(heartbeats).toEqual([]);
    });

    it('should respect the limit parameter', async () => {
      if (!demoDb.agent_heartbeats) demoDb.agent_heartbeats = [];

      for (let i = 0; i < 5; i++) {
        demoDb.agent_heartbeats.push({
          agent_id: 2, tenant_id: TENANT_ID, tickets_imported: i,
          created_at: new Date(2026, 6, 20, 10 + i).toISOString(),
        });
      }

      const heartbeats = await getAgentHeartbeats(2, TENANT_ID, 3);
      expect(heartbeats.length).toBe(3);
    });
  });

  describe('getAgentSyncStatus', () => {
    it('should return sync status for an agent', async () => {
      const { agent, secret } = await createAgent(TENANT_ID, { name: 'Sync Status' });
      createdAgentIds.push(agent.id);

      await authenticateAgent(agent.id, secret);
      await processHeartbeat(agent.id, TENANT_ID, { health_status: 'healthy' });

      const status = await getAgentSyncStatus(agent.id, TENANT_ID);
      expect(status).not.toBeNull();
      expect(status.agent_id).toBe(agent.id);
      expect(status.health).toBe('healthy');
      expect(status.status).toBe('online');
    });

    it('should return null for non-existent agent', async () => {
      const status = await getAgentSyncStatus(99999, TENANT_ID);
      expect(status).toBeNull();
    });
  });
});
