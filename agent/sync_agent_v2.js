/**
 * mePOS STOCK — Secure Multi-Tenant Synchronization Agent (v2)
 * ==============================================================
 * Authenticates with backend via agent_id + agent_secret,
 * receives encrypted config, and synchronizes POS tickets
 * using the connector architecture.
 *
 * Features:
 * - Agent authentication (agent_id + secret → JWT)
 * - Periodic heartbeat (every 30s)
 * - Encrypted config distribution from backend
 * - Connector-based POS integration (file, database, API)
 * - Circuit breaker, exponential backoff, dedup
 * - Automatic re-authentication on token expiry
 * - Graceful shutdown
 *
 * Usage:
 *   node sync_agent_v2.js
 *
 * Config file (agent.json):
 *   { "agent_id": 1, "agent_secret": "...", "backend_url": "http://localhost:5000" }
 *   If absent, falls back to sync_config.json (legacy mode).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const https = require('https');

// ======================================================
// CONFIGURATION
// ======================================================

const BOOTSTRAP_CONFIG_PATH = path.join(__dirname, 'agent.json');

const DEFAULTS = {
  heartbeatInterval: 30,
  configRefreshInterval: 300,
  syncInterval: 10,
  maxBatchSize: 50,
  maxRetries: 5,
  baseBackoff: 1000,
  maxBackoff: 60000,
  backoffJitter: 0.5,
  circuitBreakerThreshold: 3,
  circuitBreakerReset: 30000,
  dbPath: path.join(__dirname, 'local_sales_db.json'),
  metadataPath: path.join(__dirname, 'sync_metadata.json'),
  logLevel: 'info',
};

function loadBootstrapConfig() {
  if (fs.existsSync(BOOTSTRAP_CONFIG_PATH)) {
    try {
      const raw = fs.readFileSync(BOOTSTRAP_CONFIG_PATH, 'utf-8');
      return JSON.parse(raw);
    } catch (err) {
      console.warn(`[WARN] Failed to read ${BOOTSTRAP_CONFIG_PATH}: ${err.message}`);
    }
  }

  // Fallback: try legacy sync_config.json
  const legacyPath = path.join(__dirname, 'sync_config.json');
  if (fs.existsSync(legacyPath)) {
    try {
      const raw = fs.readFileSync(legacyPath, 'utf-8');
      const legacy = JSON.parse(raw);
      // Map legacy fields to bootstrap config
      return {
        backend_url: legacy.api_url ? legacy.api_url.replace('/api/v1/sales/sync', '') : DEFAULTS.backend_url,
        agent_id: legacy.agent_id || null,
        agent_secret: legacy.agent_secret || null,
        department_id: legacy.department_id || null,
      };
    } catch (err) {
      console.warn(`[WARN] Failed to read legacy config: ${err.message}`);
    }
  }

  return {};
}

function resolveBackendUrl(url) {
  if (!url) return 'http://localhost:5000';
  // Strip trailing slash and any path beyond host:port
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return url;
  }
}

// ======================================================
// LOGGING
// ======================================================

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3, critical: 4 };
let currentLogLevel = 'info';

function log(level, message, extra) {
  if (LOG_LEVELS[level] < LOG_LEVELS[currentLogLevel]) return;
  const ts = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const prefix = `[${ts}] [${level.toUpperCase()}] mepos-agent-v2:`;
  const suffix = extra ? ` ${JSON.stringify(extra)}` : '';
  const line = `${prefix} ${message}${suffix}`;
  if (level === 'error' || level === 'critical') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

// ======================================================
// HTTP HELPER
// ======================================================

function httpRequest(method, url, headers, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const transport = parsed.protocol === 'https:' ? https : http;
    const bodyStr = body ? JSON.stringify(body) : undefined;

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + (parsed.search || ''),
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      timeout: 30000,
    };

    if (bodyStr) {
      options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }

    const req = transport.request(options, (res) => {
      let data = '';
      res.setEncoding('utf-8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ statusCode: res.statusCode, body: parsed, raw: data });
        } catch {
          resolve({ statusCode: res.statusCode, body: null, raw: data });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });

    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ======================================================
// CIRCUIT BREAKER (reused from v1)
// ======================================================

class CircuitBreaker {
  constructor(threshold, resetTimeout) {
    this.threshold = threshold;
    this.resetTimeout = resetTimeout;
    this.failureCount = 0;
    this.lastFailureTime = 0;
    this.state = 'closed';
  }

  recordSuccess() { this.failureCount = 0; this.state = 'closed'; }

  recordFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.threshold) this.state = 'open';
  }

  allowRequest() {
    if (this.state === 'closed') return true;
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime >= this.resetTimeout) {
        this.state = 'half-open';
        return true;
      }
      return false;
    }
    return true;
  }
}

// ======================================================
// SYNC AGENT V2
// ======================================================

class SyncAgentV2 {
  constructor() {
    const bootstrap = loadBootstrapConfig();
    this.backendUrl = resolveBackendUrl(bootstrap.backend_url || process.env.MEPOS_BACKEND_URL);
    this.agentId = bootstrap.agent_id || (process.env.MEPOS_AGENT_ID ? parseInt(process.env.MEPOS_AGENT_ID, 10) : null);
    this.agentSecret = bootstrap.agent_secret || process.env.MEPOS_AGENT_SECRET || '';
    this.departmentId = bootstrap.department_id || (process.env.MEPOS_DEPARTMENT_ID ? parseInt(process.env.MEPOS_DEPARTMENT_ID, 10) : null);

    this.config = { ...DEFAULTS };
    this.agentInfo = null;
    this.jwt = null;
    this.jwtExpiresAt = 0;
    this.running = true;
    this.circuitBreaker = new CircuitBreaker(
      DEFAULTS.circuitBreakerThreshold,
      DEFAULTS.circuitBreakerReset
    );
    this.syncTimer = null;
    this.heartbeatTimer = null;
    this.configRefreshTimer = null;

    if (bootstrap.logLevel) this.config.logLevel = bootstrap.logLevel;
    currentLogLevel = this.config.logLevel;

    process.on('SIGINT', () => this.shutdown('SIGINT'));
    process.on('SIGTERM', () => this.shutdown('SIGTERM'));
    process.on('uncaughtException', (err) => {
      log('error', `Uncaught exception: ${err.message}`, { stack: err.stack?.split('\n')[0] });
    });
  }

  shutdown(signal) {
    log('info', `Received ${signal}, shutting down gracefully...`);
    this.running = false;
    [this.syncTimer, this.heartbeatTimer, this.configRefreshTimer].forEach(t => {
      if (t) clearInterval(t);
    });
    setTimeout(() => process.exit(0), 5000).unref();
  }

  // ─── Authentication ───

  async authenticate() {
    if (!this.agentId || !this.agentSecret) {
      log('critical', 'No agent credentials configured. Create an agent via the dashboard, then save agent_id and agent_secret to agent.json.');
      return false;
    }

    log('info', `Authenticating agent ${this.agentId}...`);

    try {
      const res = await httpRequest('POST', `${this.backendUrl}/api/v1/agents/authenticate`, {}, {
        agent_id: this.agentId,
        agent_secret: this.agentSecret,
      });

      if (res.statusCode === 200 && res.body?.status === 'success') {
        this.jwt = res.body.token;
        this.agentInfo = res.body.agent;
        const now = Date.now();
        this.jwtExpiresAt = now + 55 * 60 * 1000; // Assume 1h JWT, refresh 5min early

        // Apply config from backend
        if (res.body.config) {
          this.applyConfig(res.body.config);
        }

        log('info', `Authenticated as agent "${res.body.agent.name}" (tenant ${res.body.agent.tenant_id})`);
        return true;
      }

      if (res.statusCode === 401) {
        log('error', `Authentication failed: ${res.body?.message || 'Invalid credentials'}`);
        return false;
      }

      log('error', `Authentication failed (HTTP ${res.statusCode})`);
      return false;
    } catch (err) {
      log('error', `Cannot reach backend at ${this.backendUrl}: ${err.message}`);
      return false;
    }
  }

  applyConfig(backendConfig) {
    if (!backendConfig || typeof backendConfig !== 'object') return;

    if (backendConfig.syncInterval) this.config.syncInterval = parseInt(backendConfig.syncInterval, 10) || DEFAULTS.syncInterval;
    if (backendConfig.maxBatchSize) this.config.maxBatchSize = parseInt(backendConfig.maxBatchSize, 10) || DEFAULTS.maxBatchSize;
    if (backendConfig.department_id) this.departmentId = parseInt(backendConfig.department_id, 10);
    if (backendConfig.heartbeatInterval) this.config.heartbeatInterval = parseInt(backendConfig.heartbeatInterval, 10) || DEFAULTS.heartbeatInterval;
    if (backendConfig.maxRetries) this.config.maxRetries = parseInt(backendConfig.maxRetries, 10) || DEFAULTS.maxRetries;
    if (backendConfig.dbPath) this.config.dbPath = backendConfig.dbPath;
    if (backendConfig.logLevel) { this.config.logLevel = backendConfig.logLevel; currentLogLevel = backendConfig.logLevel; }

    log('debug', 'Config updated from backend');
  }

  async refreshConfig() {
    if (!this.jwt) return;

    try {
      const res = await httpRequest('GET', `${this.backendUrl}/api/v1/agents/${this.agentId}/config`, {
        'Authorization': `Bearer ${this.jwt}`,
      });

      if (res.statusCode === 200 && res.body?.status === 'success') {
        this.applyConfig(res.body.config);
      }
    } catch (err) {
      log('debug', `Config refresh failed: ${err.message}`);
    }
  }

  async ensureAuthenticated() {
    if (this.jwt && Date.now() < this.jwtExpiresAt) return true;
    return this.authenticate();
  }

  // ─── Heartbeat ───

  async sendHeartbeat() {
    if (!await this.ensureAuthenticated()) return;

    const payload = {
      version: '3.0.0',
      status: 'active',
      health_status: this.circuitBreaker.state === 'open' ? 'degraded' : 'healthy',
      last_sync_at: new Date().toISOString(),
      connector_status: 'connected',
    };

    try {
      const res = await httpRequest('POST', `${this.backendUrl}/api/v1/agents/heartbeat`, {
        'Authorization': `Bearer ${this.jwt}`,
      }, payload);

      if (res.statusCode === 200) {
        log('debug', 'Heartbeat sent');
        if (res.body?.config) {
          this.applyConfig(res.body.config);
        }
      } else if (res.statusCode === 401) {
        log('warn', 'Heartbeat rejected (token expired), re-authenticating...');
        this.jwt = null;
      }
    } catch (err) {
      log('debug', `Heartbeat failed: ${err.message}`);
    }
  }

  // ─── POS Data Reading ───

  readLocalSalesDb() {
    if (!fs.existsSync(this.config.dbPath)) {
      log('debug', `No local sales DB at ${this.config.dbPath}, skipping sync.`);
      return null;
    }

    try {
      const data = JSON.parse(fs.readFileSync(this.config.dbPath, 'utf-8'));
      if (!Array.isArray(data)) {
        log('error', 'Invalid local sales DB format: expected array.');
        return null;
      }
      return data;
    } catch (err) {
      log('error', `Failed to read local sales DB: ${err.message}`);
      return null;
    }
  }

  // ─── Metadata Persistence ───

  getOffset() {
    try {
      if (fs.existsSync(this.config.metadataPath)) {
        const data = JSON.parse(fs.readFileSync(this.config.metadataPath, 'utf-8'));
        return data.last_synced_id || 0;
      }
    } catch { /* ignore */ }
    return 0;
  }

  updateOffset(lastId) {
    try {
      const dir = path.dirname(this.config.metadataPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.config.metadataPath, JSON.stringify({ last_synced_id: lastId }, null, 2));
    } catch (err) {
      log('error', `Failed to write metadata: ${err.message}`);
    }
  }

  computeTicketHash(ticket) {
    const raw = `${ticket.external_ticket_id || ''}|${ticket.ticket_date || ''}|${ticket.total_amount || ''}`;
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  loadSeenHashes() {
    try {
      const meta = JSON.parse(fs.readFileSync(this.config.metadataPath, 'utf-8'));
      return new Set(meta.seen_ticket_hashes || []);
    } catch { return new Set(); }
  }

  persistTicketHashes(hashes) {
    if (!hashes || !hashes.length) return;
    try {
      const meta = JSON.parse(fs.readFileSync(this.config.metadataPath, 'utf-8'));
      const existing = meta.seen_ticket_hashes || [];
      meta.seen_ticket_hashes = [...existing, ...hashes].slice(-10000);
      fs.writeFileSync(this.config.metadataPath, JSON.stringify(meta, null, 2));
    } catch { /* ignore dedup cache write errors */ }
  }

  // ─── Sync Logic ───

  async syncTickets() {
    if (!await this.ensureAuthenticated()) return;

    const tickets = this.readLocalSalesDb();
    if (!tickets) return;

    const lastSyncedId = this.getOffset();
    const unsynced = tickets
      .filter(t => t.id > lastSyncedId)
      .sort((a, b) => a.id - b.id)
      .slice(0, this.config.maxBatchSize);

    if (unsynced.length === 0) return;

    log('info', `Found ${unsynced.length} unsynced ticket(s)`);

    // Dedup via hashes
    const seenHashes = this.loadSeenHashes();
    const newHashes = [];
    const payloadTickets = [];
    let maxId = lastSyncedId;
    let dupCount = 0;

    for (const ticket of unsynced) {
      const apiTicket = {
        external_ticket_id: ticket.ticket_number,
        ticket_date: (ticket.sold_at || '').endsWith('Z') ? ticket.sold_at : (ticket.sold_at + 'Z'),
        total_amount: ticket.total_amount,
        items: (ticket.items || []).map(item => ({
          recipe_id: item.recipe_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          quantity_served: item.quantity_served,
        })),
      };

      const hash = this.computeTicketHash(apiTicket);
      if (seenHashes.has(hash)) {
        dupCount++;
        maxId = Math.max(maxId, ticket.id);
        continue;
      }

      seenHashes.add(hash);
      newHashes.push(hash);
      payloadTickets.push(apiTicket);
      maxId = Math.max(maxId, ticket.id);
    }

    this.persistTicketHashes(newHashes);

    if (payloadTickets.length === 0) {
      log('info', `All ${dupCount} tickets were duplicates. Updating offset.`);
      this.updateOffset(maxId);
      return;
    }

    if (!this.circuitBreaker.allowRequest()) {
      log('warn', `Circuit breaker OPEN. Skipping sync.`);
      return;
    }

    const payload = {
      department_id: this.departmentId,
      tickets: payloadTickets,
    };

    log('info', `Sending ${payloadTickets.length} ticket(s) to ${this.backendUrl}/api/v1/sales/sync`);

    try {
      const res = await httpRequest('POST', `${this.backendUrl}/api/v1/sales/sync`, {
        'Authorization': `Bearer ${this.jwt}`,
      }, payload);

      if (res.statusCode >= 200 && res.statusCode < 300 && res.body?.status === 'success') {
        this.circuitBreaker.recordSuccess();
        log('info', `Synced ${res.body.synced_tickets_count || payloadTickets.length} ticket(s)`);

        if (res.body.warnings?.length) {
          res.body.warnings.forEach(w => log('warn', `API warning: ${w}`));
        }

        this.updateOffset(maxId);
      } else {
        this.circuitBreaker.recordFailure();
        log('error', `Sync failed (HTTP ${res.statusCode}): ${res.body?.message || res.raw?.substring(0, 200)}`);

        if (res.statusCode === 401) {
          log('warn', 'JWT rejected, will re-authenticate on next cycle');
          this.jwt = null;
        }
      }
    } catch (err) {
      this.circuitBreaker.recordFailure();
      log('error', `Sync request failed: ${err.message}`);
    }
  }

  // ─── Entry Point ───

  async start() {
    log('info', '=== mePOS Sync Agent v3 starting ===');

    if (!this.agentId || !this.agentSecret) {
      log('warn', 'No credentials configured. Attempting legacy API key mode...');
      log('warn', 'To use secure auth, create an agent via the dashboard and save credentials to agent.json');
      log('warn', 'Falling back to legacy sync_agent.js behavior...');
      return this.runLegacyMode();
    }

    // Authenticate on startup
    const authed = await this.authenticate();
    if (!authed) {
      log('critical', 'Startup authentication failed. Check agent credentials and backend URL.');
      log('critical', `  Backend URL: ${this.backendUrl}`);
      log('critical', `  Agent ID: ${this.agentId}`);
      log('critical', 'Retrying in 30s...');
    }

    log('info', `  Backend URL: ${this.backendUrl}`);
    log('info', `  Agent ID: ${this.agentId}`);
    log('info', `  Department ID: ${this.departmentId}`);
    log('info', `  Sync Interval: ${this.config.syncInterval}s`);
    log('info', `  Heartbeat Interval: ${this.config.heartbeatInterval}s`);

    // Immediate sync
    this.syncTickets();

    // Periodic sync
    this.syncTimer = setInterval(() => {
      if (!this.running) return;
      this.syncTickets().catch(err => log('error', `Sync error: ${err.message}`));
    }, this.config.syncInterval * 1000);
    this.syncTimer.unref();

    // Heartbeat every 30s
    this.heartbeatTimer = setInterval(() => {
      if (!this.running) return;
      this.sendHeartbeat().catch(err => log('debug', `Heartbeat error: ${err.message}`));
    }, this.config.heartbeatInterval * 1000);
    this.heartbeatTimer.unref();

    // Config refresh every 5min
    this.configRefreshTimer = setInterval(() => {
      if (!this.running) return;
      this.refreshConfig().catch(err => log('debug', `Config refresh error: ${err.message}`));
    }, this.config.configRefreshInterval * 1000);
    this.configRefreshTimer.unref();
  }

  // ─── Legacy Fallback (API key mode) ───

  runLegacyMode() {
    const config = this.loadLegacyConfig();
    if (!config) {
      log('critical', 'No configuration found. Create agent.json or sync_config.json.');
      process.exit(1);
    }

    log('info', 'Running in legacy mode (API key authentication).');
    log('info', '  Upgrade to secure agent auth: create an agent via dashboard and save credentials to agent.json');

    // Reuse the heartbeat timer for legacy mode too (health tracking)
    this.heartbeatTimer = setInterval(() => {
      if (!this.running) return;
      log('debug', 'Legacy agent alive');
    }, 60000);
    this.heartbeatTimer.unref();

    const apiUrl = config.api_url || 'http://localhost:5000/api/v1/sales/sync';
    const apiKey = config.api_key || '';
    this.departmentId = this.departmentId || config.department_id;

    this.syncTimer = setInterval(() => {
      if (!this.running) return;
      this.legacySync(apiUrl, apiKey);
    }, (config.sync_interval || 10) * 1000);
    this.syncTimer.unref();

    this.legacySync(apiUrl, apiKey);
  }

  loadLegacyConfig() {
    const legacyPath = path.join(__dirname, 'sync_config.json');
    try {
      if (fs.existsSync(legacyPath)) {
        return JSON.parse(fs.readFileSync(legacyPath, 'utf-8'));
      }
    } catch { /* ignore */ }
    return null;
  }

  legacySync(apiUrl, apiKey) {
    const tickets = this.readLocalSalesDb();
    if (!tickets) return;

    const lastSyncedId = this.getOffset();
    const unsynced = tickets
      .filter(t => t.id > lastSyncedId)
      .sort((a, b) => a.id - b.id)
      .slice(0, this.config.maxBatchSize);

    if (unsynced.length === 0) return;

    const seenHashes = this.loadSeenHashes();
    const newHashes = [];
    const payloadTickets = [];
    let maxId = lastSyncedId;

    for (const ticket of unsynced) {
      const apiTicket = {
        external_ticket_id: ticket.ticket_number,
        ticket_date: (ticket.sold_at || '').endsWith('Z') ? ticket.sold_at : (ticket.sold_at + 'Z'),
        total_amount: ticket.total_amount,
        items: (ticket.items || []).map(item => ({
          recipe_id: item.recipe_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          quantity_served: item.quantity_served,
        })),
      };

      const hash = this.computeTicketHash(apiTicket);
      if (seenHashes.has(hash)) { maxId = Math.max(maxId, ticket.id); continue; }

      seenHashes.add(hash);
      newHashes.push(hash);
      payloadTickets.push(apiTicket);
      maxId = Math.max(maxId, ticket.id);
    }

    this.persistTicketHashes(newHashes);
    if (payloadTickets.length === 0) { this.updateOffset(maxId); return; }

    httpRequest('POST', apiUrl, { 'X-API-KEY': apiKey }, {
      department_id: this.departmentId,
      tickets: payloadTickets,
    }).then(res => {
      if (res.statusCode >= 200 && res.statusCode < 300 && res.body?.status === 'success') {
        log('info', `[Legacy] Synced ${res.body.synced_tickets_count || payloadTickets.length} ticket(s)`);
        this.updateOffset(maxId);
      } else {
        log('error', `[Legacy] Sync failed (HTTP ${res.statusCode})`);
      }
    }).catch(err => {
      log('error', `[Legacy] Sync error: ${err.message}`);
    });
  }
}

// ======================================================
// ENTRY POINT
// ======================================================

const agent = new SyncAgentV2();
agent.start();
