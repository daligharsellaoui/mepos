/**
 * mePOS STOCK — Agent Service
 * =============================
 * Agent CRUD, authentication, heartbeat processing, and secure config distribution.
 * Agents authenticate with agent_id + agent_secret, receive a short-lived JWT.
 */

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { query, isDemoMode, demoDb, getClient } from '../database';
import { encrypt, decrypt, encryptIfNeeded, isEncrypted } from './encryption.service';
import { eventBus, Events } from './event.service';

const JWT_SECRET = process.env.JWT_SECRET || 'mepos_jwt_dev_secret_change_in_production';
const AGENT_JWT_EXPIRY = '1h';
const AGENT_SECRET_ROUNDS = 12;

// ─── Types ───

export interface Agent {
  id: number;
  uuid: string;
  tenant_id: number;
  name: string;
  machine_name?: string;
  machine_id?: string;
  operating_system?: string;
  version?: string;
  connector_type: string;
  status: string;
  agent_secret_hash: string;
  config: any;
  last_seen_at?: string;
  last_sync_at?: string;
  last_heartbeat_at?: string;
  health_status: string;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export interface SafeAgent extends Omit<Agent, 'agent_secret_hash'> {}

export interface CreateAgentInput {
  name: string;
  machine_name?: string;
  machine_id?: string;
  operating_system?: string;
  version?: string;
  connector_type?: string;
  config?: any;
}

export interface HeartbeatPayload {
  version?: string;
  status?: string;
  health_status?: string;
  last_sync_at?: string;
  connector_status?: string;
  sync_duration_ms?: number;
  tickets_imported?: number;
  errors_count?: number;
  warnings?: string[];
}

export interface AgentAuthResult {
  token: string;
  agent: SafeAgent;
  config: any;
}

// ─── Helpers ───

function safeAgent(agent: Agent): SafeAgent {
  const { agent_secret_hash, ...safe } = agent;
  return safe;
}

function generateAgentSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

// ─── CRUD Operations ───

/**
 * Get all agents for a tenant.
 */
export async function getAgentsByTenant(tenantId: number): Promise<SafeAgent[]> {
  if (isDemoMode) {
    return (demoDb.agents || [])
      .filter((a: any) => a.tenant_id === tenantId)
      .map((a: any) => {
        const { agent_secret_hash, ...safe } = a;
        return safe;
      });
  }

  const result = await query(
    'SELECT * FROM agents WHERE tenant_id = $1 ORDER BY created_at DESC',
    [tenantId]
  );
  return result.rows.map(safeAgent);
}

/**
 * Get a single agent by ID (tenant-scoped).
 */
export async function getAgentById(agentId: number, tenantId: number): Promise<SafeAgent | null> {
  if (isDemoMode) {
    const agent = (demoDb.agents || []).find((a: any) => a.id === agentId && a.tenant_id === tenantId);
    if (!agent) return null;
    const { agent_secret_hash, ...safe } = agent;
    return safe;
  }

  const result = await query(
    'SELECT * FROM agents WHERE id = $1 AND tenant_id = $2',
    [agentId, tenantId]
  );
  if (result.rows.length === 0) return null;
  return safeAgent(result.rows[0]);
}

/**
 * Create a new agent. Returns the agent with the plaintext secret (only shown once).
 */
export async function createAgent(
  tenantId: number,
  input: CreateAgentInput
): Promise<{ agent: SafeAgent; secret: string }> {
  const secret = generateAgentSecret();
  const secretHash = await bcrypt.hash(secret, AGENT_SECRET_ROUNDS);

  if (isDemoMode) {
    const newAgent: any = {
      id: (demoDb.agents || []).length + 1,
      uuid: crypto.randomUUID(),
      tenant_id: tenantId,
      name: input.name,
      machine_name: input.machine_name || null,
      machine_id: input.machine_id || null,
      operating_system: input.operating_system || null,
      version: input.version || null,
      connector_type: input.connector_type || 'database',
      status: 'offline',
      agent_secret_hash: secretHash,
      config: input.config || {},
      last_seen_at: null,
      last_sync_at: null,
      last_heartbeat_at: null,
      health_status: 'unknown',
      error_message: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (!demoDb.agents) demoDb.agents = [];
    demoDb.agents.push(newAgent);
    const { agent_secret_hash, ...safe } = newAgent;
    return { agent: safe, secret };
  }

  const result = await query(
    `INSERT INTO agents (tenant_id, name, machine_name, machine_id, operating_system, version, connector_type, status, agent_secret_hash, config)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'offline', $8, $9)
     RETURNING *`,
    [
      tenantId,
      input.name,
      input.machine_name || null,
      input.machine_id || null,
      input.operating_system || null,
      input.version || null,
      input.connector_type || 'database',
      secretHash,
      JSON.stringify(input.config || {}),
    ]
  );

  return { agent: safeAgent(result.rows[0]), secret };
}

/**
 * Update an agent's properties (not secret).
 */
export async function updateAgent(
  agentId: number,
  tenantId: number,
  updates: Partial<CreateAgentInput>
): Promise<SafeAgent | null> {
  if (isDemoMode) {
    const idx = (demoDb.agents || []).findIndex((a: any) => a.id === agentId && a.tenant_id === tenantId);
    if (idx === -1) return null;
    const agent = demoDb.agents[idx];
    if (updates.name !== undefined) agent.name = updates.name;
    if (updates.machine_name !== undefined) agent.machine_name = updates.machine_name;
    if (updates.machine_id !== undefined) agent.machine_id = updates.machine_id;
    if (updates.operating_system !== undefined) agent.operating_system = updates.operating_system;
    if (updates.version !== undefined) agent.version = updates.version;
    if (updates.connector_type !== undefined) agent.connector_type = updates.connector_type;
    if (updates.config !== undefined) agent.config = updates.config;
    agent.updated_at = new Date().toISOString();
    const { agent_secret_hash, ...safe } = agent;
    return safe;
  }

  const fields: string[] = [];
  const values: any[] = [];
  let paramIdx = 1;

  if (updates.name !== undefined) { fields.push(`name = $${paramIdx++}`); values.push(updates.name); }
  if (updates.machine_name !== undefined) { fields.push(`machine_name = $${paramIdx++}`); values.push(updates.machine_name); }
  if (updates.machine_id !== undefined) { fields.push(`machine_id = $${paramIdx++}`); values.push(updates.machine_id); }
  if (updates.operating_system !== undefined) { fields.push(`operating_system = $${paramIdx++}`); values.push(updates.operating_system); }
  if (updates.version !== undefined) { fields.push(`version = $${paramIdx++}`); values.push(updates.version); }
  if (updates.connector_type !== undefined) { fields.push(`connector_type = $${paramIdx++}`); values.push(updates.connector_type); }
  if (updates.config !== undefined) { fields.push(`config = $${paramIdx++}`); values.push(JSON.stringify(updates.config)); }

  if (fields.length === 0) return getAgentById(agentId, tenantId);

  fields.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(agentId, tenantId);

  const result = await query(
    `UPDATE agents SET ${fields.join(', ')} WHERE id = $${paramIdx++} AND tenant_id = $${paramIdx} RETURNING *`,
    values
  );

  if (result.rows.length === 0) return null;
  return safeAgent(result.rows[0]);
}

/**
 * Delete an agent.
 */
export async function deleteAgent(agentId: number, tenantId: number): Promise<boolean> {
  if (isDemoMode) {
    const idx = (demoDb.agents || []).findIndex((a: any) => a.id === agentId && a.tenant_id === tenantId);
    if (idx === -1) return false;
    demoDb.agents.splice(idx, 1);
    return true;
  }

  const result = await query(
    'DELETE FROM agents WHERE id = $1 AND tenant_id = $2 RETURNING id',
    [agentId, tenantId]
  );
  return result.rows.length > 0;
}

/**
 * Enable an agent.
 */
export async function enableAgent(agentId: number, tenantId: number): Promise<SafeAgent | null> {
  if (isDemoMode) {
    const agent = (demoDb.agents || []).find((a: any) => a.id === agentId && a.tenant_id === tenantId);
    if (!agent) return null;
    agent.status = 'offline';
    agent.updated_at = new Date().toISOString();
    const { agent_secret_hash, ...safe } = agent;
    return safe;
  }

  const result = await query(
    `UPDATE agents SET status = 'offline', error_message = NULL, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND tenant_id = $2 RETURNING *`,
    [agentId, tenantId]
  );
  if (result.rows.length === 0) return null;
  return safeAgent(result.rows[0]);
}

/**
 * Disable an agent.
 */
export async function disableAgent(agentId: number, tenantId: number): Promise<SafeAgent | null> {
  if (isDemoMode) {
    const agent = (demoDb.agents || []).find((a: any) => a.id === agentId && a.tenant_id === tenantId);
    if (!agent) return null;
    agent.status = 'disabled';
    agent.updated_at = new Date().toISOString();
    const { agent_secret_hash, ...safe } = agent;

    eventBus.emit(Events.AGENT_DISCONNECTED, {
      tenantId, agentId, agentName: agent.name,
    });

    return safe;
  }

  const result = await query(
    `UPDATE agents SET status = 'disabled', updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND tenant_id = $2 RETURNING *`,
    [agentId, tenantId]
  );
  if (result.rows.length === 0) return null;
  return safeAgent(result.rows[0]);
}

/**
 * Rotate agent secret. Returns the new plaintext secret.
 */
export async function rotateAgentSecret(agentId: number, tenantId: number): Promise<{ agent: SafeAgent; secret: string } | null> {
  const secret = generateAgentSecret();
  const secretHash = await bcrypt.hash(secret, AGENT_SECRET_ROUNDS);

  if (isDemoMode) {
    const agent = (demoDb.agents || []).find((a: any) => a.id === agentId && a.tenant_id === tenantId);
    if (!agent) return null;
    agent.agent_secret_hash = secretHash;
    agent.updated_at = new Date().toISOString();
    const { agent_secret_hash, ...safe } = agent;
    return { agent: safe, secret };
  }

  const result = await query(
    `UPDATE agents SET agent_secret_hash = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2 AND tenant_id = $3 RETURNING *`,
    [secretHash, agentId, tenantId]
  );
  if (result.rows.length === 0) return null;
  return { agent: safeAgent(result.rows[0]), secret };
}

// ─── Authentication ───

/**
 * Authenticate an agent with agent_id + secret.
 * Returns a short-lived JWT and the agent's sync config.
 */
export async function authenticateAgent(
  agentId: number,
  agentSecret: string
): Promise<AgentAuthResult> {
  // Find agent (not tenant-scoped — agent auth is cross-tenant by design)
  let agent: any;

  if (isDemoMode) {
    agent = (demoDb.agents || []).find((a: any) => a.id === agentId);
  } else {
    const result = await query(
      'SELECT * FROM agents WHERE id = $1',
      [agentId]
    );
    agent = result.rows[0];
  }

  if (!agent) {
    throw new Error('Agent not found');
  }

  if (agent.status === 'disabled') {
    throw new Error('Agent is disabled');
  }

  // Verify secret
  const isValid = await bcrypt.compare(agentSecret, agent.agent_secret_hash);
  if (!isValid) {
    throw new Error('Invalid agent secret');
  }

  // Generate JWT
  const token = jwt.sign(
    {
      agentId: agent.id,
      tenantId: agent.tenant_id,
      type: 'agent',
    },
    JWT_SECRET,
    { expiresIn: AGENT_JWT_EXPIRY }
  );

  // Update last_seen_at
  if (!isDemoMode) {
    await query(
      `UPDATE agents SET last_seen_at = CURRENT_TIMESTAMP, status = 'online', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [agentId]
    );
  } else {
    agent.last_seen_at = new Date().toISOString();
    agent.status = 'online';
  }

  // Get decrypted config
  const config = getDecryptedConfig(agent.config);

  return {
    token,
    agent: safeAgent(agent),
    config,
  };
}

// ─── Heartbeat ───

/**
 * Process an agent heartbeat. Updates agent status and logs heartbeat.
 */
export async function processHeartbeat(
  agentId: number,
  tenantId: number,
  payload: HeartbeatPayload
): Promise<{ success: boolean; config?: any }> {
  if (isDemoMode) {
    const agent = (demoDb.agents || []).find((a: any) => a.id === agentId && a.tenant_id === tenantId);
    if (!agent) return { success: false };

    const wasOffline = agent.status === 'offline' || agent.status === 'error';

    agent.last_heartbeat_at = new Date().toISOString();
    agent.last_seen_at = new Date().toISOString();
    agent.status = 'online';
    if (payload.version) agent.version = payload.version;
    if (payload.health_status) agent.health_status = payload.health_status;
    if (payload.last_sync_at) agent.last_sync_at = payload.last_sync_at;

    if (wasOffline) {
      eventBus.emit(Events.AGENT_RECONNECTED, {
        tenantId, agentId, agentName: agent.name,
      });
    }

    return { success: true };
  }

  const { client, release } = await getClient();
  try {
    await client.query('BEGIN');

    // Update agent status
    await client.query(
      `UPDATE agents SET
        last_heartbeat_at = CURRENT_TIMESTAMP,
        last_seen_at = CURRENT_TIMESTAMP,
        status = 'online',
        version = COALESCE($1, version),
        health_status = COALESCE($2, health_status),
        last_sync_at = COALESCE($3, last_sync_at),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $4 AND tenant_id = $5`,
      [payload.version, payload.health_status, payload.last_sync_at, agentId, tenantId]
    );

    // Log heartbeat
    await client.query(
      `INSERT INTO agent_heartbeats (agent_id, tenant_id, version, status, health_status, last_sync_at, connector_status, sync_duration_ms, tickets_imported, errors_count, warnings)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        agentId, tenantId,
        payload.version, payload.status || 'active', payload.health_status || 'healthy',
        payload.last_sync_at, payload.connector_status,
        payload.sync_duration_ms, payload.tickets_imported || 0, payload.errors_count || 0,
        payload.warnings || [],
      ]
    );

    // Get current config (agent may need to refresh)
    const agentResult = await client.query('SELECT config FROM agents WHERE id = $1 AND tenant_id = $2', [agentId, tenantId]);
    const config = agentResult.rows.length > 0 ? getDecryptedConfig(agentResult.rows[0].config) : {};

    await client.query('COMMIT');
    return { success: true, config };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    release();
  }
}

// ─── Secure Config Distribution ───

/**
 * Get the decrypted sync configuration for an agent.
 * Credentials stored encrypted in agents.config are decrypted before sending.
 */
export async function getAgentConfig(agentId: number, tenantId: number): Promise<any | null> {
  if (isDemoMode) {
    const agent = (demoDb.agents || []).find((a: any) => a.id === agentId && a.tenant_id === tenantId);
    if (!agent) return null;
    return getDecryptedConfig(agent.config);
  }

  const result = await query(
    'SELECT config FROM agents WHERE id = $1 AND tenant_id = $2',
    [agentId, tenantId]
  );
  if (result.rows.length === 0) return null;
  return getDecryptedConfig(result.rows[0].config);
}

/**
 * Update the sync configuration for an agent (encrypts sensitive fields).
 */
export async function updateAgentConfig(
  agentId: number,
  tenantId: number,
  config: any
): Promise<boolean> {
  const encryptedConfig = encryptConfigFields(config);

  if (isDemoMode) {
    const agent = (demoDb.agents || []).find((a: any) => a.id === agentId && a.tenant_id === tenantId);
    if (!agent) return false;
    agent.config = encryptedConfig;
    agent.updated_at = new Date().toISOString();
    return true;
  }

  const result = await query(
    `UPDATE agents SET config = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2 AND tenant_id = $3 RETURNING id`,
    [JSON.stringify(encryptedConfig), agentId, tenantId]
  );
  return result.rows.length > 0;
}

// ─── Encryption Helpers ───

/**
 * Fields in agent config that should be encrypted at rest.
 */
const SENSITIVE_FIELDS = ['password', 'apiKey', 'api_key', 'secret', 'token'];

/**
 * Encrypt sensitive fields in config before storing.
 */
function encryptConfigFields(config: any): any {
  if (!config || typeof config !== 'object') return config;

  const encrypted = { ...config };
  for (const field of SENSITIVE_FIELDS) {
    if (encrypted[field] && typeof encrypted[field] === 'string' && !isEncrypted(encrypted[field])) {
      encrypted[field] = encrypt(encrypted[field]);
    }
  }
  return encrypted;
}

/**
 * Decrypt sensitive fields in config before sending to agent.
 */
function getDecryptedConfig(config: any): any {
  if (!config || typeof config !== 'object') return config;

  const decrypted = { ...config };
  for (const field of SENSITIVE_FIELDS) {
    if (decrypted[field] && typeof decrypted[field] === 'string' && isEncrypted(decrypted[field])) {
      decrypted[field] = decrypt(decrypted[field]);
    }
  }
  return decrypted;
}

/**
 * Get agent heartbeats history.
 */
export async function getAgentHeartbeats(
  agentId: number,
  tenantId: number,
  limit: number = 50
): Promise<any[]> {
  if (isDemoMode) {
    return (demoDb.agent_heartbeats || [])
      .filter((h: any) => h.agent_id === agentId && h.tenant_id === tenantId)
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, limit);
  }

  const result = await query(
    `SELECT * FROM agent_heartbeats
     WHERE agent_id = $1 AND tenant_id = $2
     ORDER BY created_at DESC
     LIMIT $3`,
    [agentId, tenantId, limit]
  );
  return result.rows;
}

/**
 * Get agent sync status summary.
 */
export async function getAgentSyncStatus(agentId: number, tenantId: number): Promise<any> {
  if (isDemoMode) {
    const agent = (demoDb.agents || []).find((a: any) => a.id === agentId && a.tenant_id === tenantId);
    if (!agent) return null;
    return {
      agent_id: agent.id,
      status: agent.status,
      health: agent.health_status,
      last_sync: agent.last_sync_at,
      last_heartbeat: agent.last_heartbeat_at,
      version: agent.version,
    };
  }

  const result = await query(
    `SELECT id as agent_id, status, health_status as health, last_sync_at as last_sync,
            last_heartbeat_at as last_heartbeat, version, connector_type
     FROM agents WHERE id = $1 AND tenant_id = $2`,
    [agentId, tenantId]
  );
  return result.rows[0] || null;
}
