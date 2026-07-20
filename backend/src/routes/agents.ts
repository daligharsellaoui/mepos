/**
 * mePOS STOCK — Agent Routes
 * ============================
 * Endpoints for agent CRUD, authentication, heartbeat, and config management.
 *
 * Authentication:
 * - POST /api/v1/agents/authenticate — Agent → Backend auth (uses agent_id + secret)
 * - POST /api/v1/agents/heartbeat — Agent heartbeat (uses agent JWT)
 * - GET /api/v1/agents/:id/config — Agent gets sync config (uses agent JWT)
 *
 * Management (requires user JWT):
 * - GET /api/v1/agents — List tenant's agents
 * - POST /api/v1/agents — Create agent
 * - PUT /api/v1/agents/:id — Update agent
 * - DELETE /api/v1/agents/:id — Delete agent
 * - POST /api/v1/agents/:id/enable — Enable agent
 * - POST /api/v1/agents/:id/disable — Disable agent
 * - POST /api/v1/agents/:id/rotate-secret — Rotate agent credentials
 * - GET /api/v1/agents/:id/heartbeats — Get heartbeat history
 * - GET /api/v1/agents/:id/sync-status — Get sync status
 */

import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { authMiddleware } from './auth';
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
} from '../services/agent.service';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'mepos_jwt_dev_secret_change_in_production';

// ============================================================
// PUBLIC / AGENT JWT ROUTES (defined BEFORE authMiddleware)
// ============================================================

/**
 * POST /api/v1/agents/authenticate
 * Agent authenticates with agent_id + agent_secret.
 * Returns a short-lived JWT and the sync config.
 */
router.post('/authenticate', async (req: Request, res: Response) => {
  const { agent_id, agent_secret } = req.body;

  if (!agent_id || !agent_secret) {
    return res.status(400).json({ status: 'error', message: 'agent_id and agent_secret are required' });
  }

  try {
    const result = await authenticateAgent(parseInt(agent_id, 10), agent_secret);
    res.json({
      status: 'success',
      token: result.token,
      agent: result.agent,
      config: result.config,
    });
  } catch (error: any) {
    console.error('Agent authentication failed:', error.message);
    res.status(401).json({ status: 'error', message: error.message || 'Authentication failed' });
  }
});

/**
 * POST /api/v1/agents/heartbeat
 * Agent sends periodic heartbeat with status info.
 * Uses agent JWT (type: 'agent' in payload).
 */
router.post('/heartbeat', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ status: 'error', message: 'Bearer token required' });
  }

  try {
    const token = authHeader.substring(7);
    const decoded: any = jwt.verify(token, JWT_SECRET);

    if (decoded.type !== 'agent') {
      return res.status(403).json({ status: 'error', message: 'Agent JWT required' });
    }

    const result = await processHeartbeat(decoded.agentId, decoded.tenantId, req.body);
    res.json({ status: 'success', config: result.config });
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ status: 'error', message: 'Token expired' });
    }
    res.status(500).json({ status: 'error', message: error.message || 'Heartbeat processing failed' });
  }
});

/**
 * GET /api/v1/agents/:id/config
 * Agent gets its decrypted sync configuration.
 * Uses agent JWT (type: 'agent' in payload).
 */
router.get('/:id/config', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ status: 'error', message: 'Bearer token required' });
  }

  try {
    const token = authHeader.substring(7);
    const decoded: any = jwt.verify(token, JWT_SECRET);

    if (decoded.type !== 'agent') {
      return res.status(403).json({ status: 'error', message: 'Agent JWT required' });
    }

    const agentId = parseInt(req.params.id, 10);
    if (decoded.agentId !== agentId) {
      return res.status(403).json({ status: 'error', message: 'Cannot access config for another agent' });
    }

    const config = await getAgentConfig(agentId, decoded.tenantId);
    if (!config) {
      return res.status(404).json({ status: 'error', message: 'Agent not found' });
    }

    res.json({ status: 'success', config });
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ status: 'error', message: 'Token expired' });
    }
    res.status(500).json({ status: 'error', message: error.message || 'Failed to get config' });
  }
});

// ============================================================
// USER JWT ROUTES (all routes below require user JWT + tenant context)
// ============================================================

router.use(authMiddleware);

// ─── Agent CRUD ───

/**
 * GET /api/v1/agents
 * List all agents for the current tenant.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId ?? 1;
    const agents = await getAgentsByTenant(tenantId);
    res.json({ status: 'success', data: agents });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message || 'Failed to list agents' });
  }
});

/**
 * POST /api/v1/agents
 * Create a new agent. Returns the agent with the plaintext secret (shown only once).
 */
router.post('/', async (req: Request, res: Response) => {
  const { name, machine_name, machine_id, operating_system, version, connector_type, config } = req.body;

  if (!name) {
    return res.status(400).json({ status: 'error', message: 'Agent name is required' });
  }

  try {
    const tenantId = req.tenantId ?? 1;
    const result = await createAgent(tenantId, {
      name,
      machine_name,
      machine_id,
      operating_system,
      version,
      connector_type,
      config,
    });

    res.status(201).json({
      status: 'success',
      message: 'Agent created. Save the secret — it will not be shown again.',
      data: result.agent,
      secret: result.secret,
    });
  } catch (error: any) {
    res.status(400).json({ status: 'error', message: error.message || 'Failed to create agent' });
  }
});

/**
 * GET /api/v1/agents/:id
 * Get a single agent by ID.
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId ?? 1;
    const agent = await getAgentById(parseInt(req.params.id, 10), tenantId);
    if (!agent) {
      return res.status(404).json({ status: 'error', message: 'Agent not found' });
    }
    res.json({ status: 'success', data: agent });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message || 'Failed to get agent' });
  }
});

/**
 * PUT /api/v1/agents/:id
 * Update an agent's properties.
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId ?? 1;
    const agent = await updateAgent(parseInt(req.params.id, 10), tenantId, req.body);
    if (!agent) {
      return res.status(404).json({ status: 'error', message: 'Agent not found' });
    }
    res.json({ status: 'success', data: agent });
  } catch (error: any) {
    res.status(400).json({ status: 'error', message: error.message || 'Failed to update agent' });
  }
});

/**
 * DELETE /api/v1/agents/:id
 * Delete an agent.
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId ?? 1;
    const deleted = await deleteAgent(parseInt(req.params.id, 10), tenantId);
    if (!deleted) {
      return res.status(404).json({ status: 'error', message: 'Agent not found' });
    }
    res.json({ status: 'success', message: 'Agent deleted' });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message || 'Failed to delete agent' });
  }
});

// ─── Agent Actions ───

/**
 * POST /api/v1/agents/:id/enable
 * Enable a disabled agent.
 */
router.post('/:id/enable', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId ?? 1;
    const agent = await enableAgent(parseInt(req.params.id, 10), tenantId);
    if (!agent) {
      return res.status(404).json({ status: 'error', message: 'Agent not found' });
    }
    res.json({ status: 'success', message: 'Agent enabled', data: agent });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message || 'Failed to enable agent' });
  }
});

/**
 * POST /api/v1/agents/:id/disable
 * Disable an agent (stops sync).
 */
router.post('/:id/disable', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId ?? 1;
    const agent = await disableAgent(parseInt(req.params.id, 10), tenantId);
    if (!agent) {
      return res.status(404).json({ status: 'error', message: 'Agent not found' });
    }
    res.json({ status: 'success', message: 'Agent disabled', data: agent });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message || 'Failed to disable agent' });
  }
});

/**
 * POST /api/v1/agents/:id/rotate-secret
 * Rotate agent credentials. Returns new secret (shown only once).
 */
router.post('/:id/rotate-secret', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId ?? 1;
    const result = await rotateAgentSecret(parseInt(req.params.id, 10), tenantId);
    if (!result) {
      return res.status(404).json({ status: 'error', message: 'Agent not found' });
    }
    res.json({
      status: 'success',
      message: 'Secret rotated. Save the new secret — it will not be shown again.',
      data: result.agent,
      secret: result.secret,
    });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message || 'Failed to rotate secret' });
  }
});

// ─── Agent Monitoring ───

/**
 * GET /api/v1/agents/:id/heartbeats
 * Get heartbeat history for an agent.
 */
router.get('/:id/heartbeats', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId ?? 1;
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const heartbeats = await getAgentHeartbeats(parseInt(req.params.id, 10), tenantId, limit);
    res.json({ status: 'success', data: heartbeats });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message || 'Failed to get heartbeats' });
  }
});

/**
 * GET /api/v1/agents/:id/sync-status
 * Get sync status summary for an agent.
 */
router.get('/:id/sync-status', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId ?? 1;
    const status = await getAgentSyncStatus(parseInt(req.params.id, 10), tenantId);
    if (!status) {
      return res.status(404).json({ status: 'error', message: 'Agent not found' });
    }
    res.json({ status: 'success', data: status });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message || 'Failed to get sync status' });
  }
});

// ─── Agent Config (user JWT route) ───

/**
 * PUT /api/v1/agents/:id/config
 * Update agent sync configuration (encrypts sensitive fields).
 */
router.put('/:id/config', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId ?? 1;
    const updated = await updateAgentConfig(parseInt(req.params.id, 10), tenantId, req.body);
    if (!updated) {
      return res.status(404).json({ status: 'error', message: 'Agent not found' });
    }
    res.json({ status: 'success', message: 'Configuration updated' });
  } catch (error: any) {
    res.status(400).json({ status: 'error', message: error.message || 'Failed to update config' });
  }
});

export default router;
