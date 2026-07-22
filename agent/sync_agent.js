/**
 * mePOS STOCK — Legacy POS Synchronization Agent (Node.js)
 * ==========================================================
 * Synchronizes local sales tickets from legacy POS databases to the mePOS STOCK API.
 *
 * Features:
 * - Exponential backoff with jitter for transient failures
 * - Structured logging (JSON + console)
 * - Circuit breaker pattern to avoid hammering a down API
 * - Graceful shutdown on SIGINT/SIGTERM
 * - Duplicate ticket detection via external_ticket_id hash
 * - Batch size limit to avoid oversized payloads
 * - Configurable via env vars or config file
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');

// ======================================================
// CONFIGURATION
// ======================================================

const DEFAULT_CONFIG = {
  apiUrl: 'http://localhost:5000/api/v1/sales/sync',
  apiKey: '',
  departmentId: 2,
  syncInterval: 10, // seconds
  maxBatchSize: 50,
  maxRetries: 5,
  baseBackoff: 1000, // ms
  maxBackoff: 60000, // ms
  backoffJitter: 0.5,
  circuitBreakerThreshold: 3,
  circuitBreakerReset: 30000, // ms
  dbPath: path.join(__dirname, 'local_sales_db.json'),
  metadataPath: path.join(__dirname, 'sync_metadata.json'),
  logLevel: 'info',
};

function loadConfig() {
  const config = { ...DEFAULT_CONFIG };

  // Try config file
  const configPath = process.env.MEPOS_CONFIG_FILE || path.join(__dirname, 'sync_config.json');
  if (fs.existsSync(configPath)) {
    try {
      const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      Object.assign(config, fileConfig);
    } catch (err) {
      console.warn(`[WARN] Failed to load config file ${configPath}: ${err.message}`);
    }
  }

  // Env vars override
  if (process.env.MEPOS_API_URL) config.apiUrl = process.env.MEPOS_API_URL;
  if (process.env.MEPOS_API_KEY) config.apiKey = process.env.MEPOS_API_KEY;
  if (process.env.API_KEY) config.apiKey = process.env.API_KEY;
  if (process.env.MEPOS_DEPARTMENT_ID) config.departmentId = parseInt(process.env.MEPOS_DEPARTMENT_ID, 10);
  if (process.env.MEPOS_SYNC_INTERVAL) config.syncInterval = parseInt(process.env.MEPOS_SYNC_INTERVAL, 10);
  if (process.env.MEPOS_MAX_BATCH_SIZE) config.maxBatchSize = parseInt(process.env.MEPOS_MAX_BATCH_SIZE, 10);
  if (process.env.MEPOS_MAX_RETRIES) config.maxRetries = parseInt(process.env.MEPOS_MAX_RETRIES, 10);
  if (process.env.MEPOS_LOG_LEVEL) config.logLevel = process.env.MEPOS_LOG_LEVEL;

  return config;
}

// ======================================================
// LOGGING
// ======================================================

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3, critical: 4 };
let currentLogLevel = 'info';

function log(level, message, ...args) {
  if (LOG_LEVELS[level] < LOG_LEVELS[currentLogLevel]) return;
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const prefix = `[${timestamp}] [${level.toUpperCase()}] mepos-sync-agent:`;
  const fullMsg = args.length > 0 ? `${message} ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ')}` : message;
  
  if (level === 'error' || level === 'critical') {
    console.error(prefix, fullMsg);
  } else {
    console.log(prefix, fullMsg);
  }
}

// ======================================================
// CIRCUIT BREAKER
// ======================================================

class CircuitBreaker {
  constructor(threshold, resetTimeout) {
    this.threshold = threshold;
    this.resetTimeout = resetTimeout;
    this.failureCount = 0;
    this.lastFailureTime = 0;
    this.state = 'closed'; // closed, open, half-open
  }

  recordSuccess() {
    this.failureCount = 0;
    this.state = 'closed';
  }

  recordFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.threshold) {
      this.state = 'open';
    }
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
    // half-open: allow one request
    return true;
  }
}

// ======================================================
// SYNC AGENT
// ======================================================

class SyncAgent {
  constructor(config) {
    this.config = config;
    this.running = true;
    this.circuitBreaker = new CircuitBreaker(
      config.circuitBreakerThreshold,
      config.circuitBreakerReset
    );
    this.intervalHandle = null;

    currentLogLevel = config.logLevel;

    // Graceful shutdown
    process.on('SIGINT', () => this.shutdown('SIGINT'));
    process.on('SIGTERM', () => this.shutdown('SIGTERM'));
    process.on('uncaughtException', (err) => {
      log('error', `Uncaught exception: ${err.message}`, { stack: err.stack });
    });

    log('info', 'Sync Agent initialized');
    log('info', `  API URL: ${config.apiUrl}`);
    log('info', `  Department ID: ${config.departmentId}`);
    log('info', `  Sync Interval: ${config.syncInterval}s`);
    log('info', `  Max Batch: ${config.maxBatchSize}`);
    log('info', `  Max Retries: ${config.maxRetries}`);
  }

  shutdown(signal) {
    log('info', `Received ${signal}, shutting down gracefully...`);
    this.running = false;
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    
    log('info', 'Waiting for in-flight requests to complete...');
    
    // Let current request finish naturally, force exit after 5s
    setTimeout(() => {
      log('info', 'Forced exit after shutdown timeout.');
      process.exit(0);
    }, 5000).unref();
  }

  getOffset() {
    try {
      if (fs.existsSync(this.config.metadataPath)) {
        const data = JSON.parse(fs.readFileSync(this.config.metadataPath, 'utf-8'));
        return data.last_synced_id || 0;
      }
    } catch (err) {
      log('warn', `Failed to read metadata: ${err.message}`);
    }
    return 0;
  }

  updateOffset(lastId) {
    try {
      const dir = path.dirname(this.config.metadataPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.config.metadataPath, JSON.stringify({ last_synced_id: lastId }, null, 2));
    } catch (err) {
      log('error', `Failed to write metadata: ${err.message}`);
    }
  }

  computeTicketHash(ticket) {
    const raw = `${ticket.external_ticket_id || ''}|${ticket.ticket_date || ''}|${ticket.total_amount || ''}`;
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  classifyError(err) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT' || err.code === 'ECONNRESET') {
      return 'transient';
    }
    if (err.statusCode) {
      if (err.statusCode >= 500) return 'transient';
      if (err.statusCode === 429) return 'transient';
      if (err.statusCode === 401 || err.statusCode === 403) return 'permanent_auth';
      if (err.statusCode === 400) return 'permanent';
    }
    return 'transient';
  }

  calculateBackoff(attempt) {
    const base = this.config.baseBackoff;
    const maxBackoff = this.config.maxBackoff;
    const jitter = this.config.backoffJitter;
    const delay = Math.min(base * Math.pow(2, attempt), maxBackoff);
    return Math.max(100, delay * (1 + (Math.random() * 2 - 1) * jitter));
  }

  loadSeenHashes() {
    try {
      const meta = JSON.parse(fs.readFileSync(this.config.metadataPath, 'utf-8'));
      return new Set(meta.seen_ticket_hashes || []);
    } catch (err) {
      return new Set();
    }
  }

  persistTicketHash(hash) {
    this.persistTicketHashes([hash]);
  }

  persistTicketHashes(hashes) {
    if (!hashes || !hashes.length) return;
    try {
      const meta = JSON.parse(fs.readFileSync(this.config.metadataPath, 'utf-8'));
      const existing = meta.seen_ticket_hashes || [];
      // Keep the last 10,000 hashes to bound memory
      meta.seen_ticket_hashes = [...existing, ...hashes].slice(-10000);
      fs.writeFileSync(this.config.metadataPath, JSON.stringify(meta, null, 2));
    } catch (err) {
      // Ignore write errors for dedup cache
    }
  }

  sendSyncRequest(payload) {
    return new Promise((resolve) => {
      const url = new URL(this.config.apiUrl);
      const payloadStr = JSON.stringify(payload);
      const isHttps = url.protocol === 'https:';
      const transport = isHttps ? https : http;

      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': this.config.apiKey,
          'Content-Length': Buffer.byteLength(payloadStr),
        },
        timeout: 30000,
      };

      const attemptRequest = (attempt) => {
        const req = transport.request(options, (res) => {
          let body = '';
          res.setEncoding('utf-8');
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => {
            try {
              if (res.statusCode >= 200 && res.statusCode < 300) {
                const resJson = JSON.parse(body);
                this.circuitBreaker.recordSuccess();
                return resolve(resJson);
              }

              const error = new Error(`HTTP ${res.statusCode}`);
              error.statusCode = res.statusCode;
              error.body = body;
              const errorType = this.classifyError(error);

              if (errorType === 'permanent') {
                log('error', `Permanent error ${res.statusCode} from API. Skipping batch.`, { body: body.substring(0, 500) });
                return resolve({ status: 'error', message: `HTTP ${res.statusCode}: ${res.statusMessage}` });
              }

              if (errorType === 'permanent_auth') {
                log('critical', `Authentication error ${res.statusCode}. Check API key.`);
                return resolve({ status: 'error', message: `Auth error: ${res.statusMessage}` });
              }

              // Transient — retry
              if (attempt < this.config.maxRetries) {
                const delay = this.calculateBackoff(attempt);
                log('warn', `HTTP ${res.statusCode} (attempt ${attempt + 1}/${this.config.maxRetries + 1}), retrying in ${(delay / 1000).toFixed(1)}s...`);
                setTimeout(() => attemptRequest(attempt + 1), delay);
              } else {
                log('error', `Max retries reached for HTTP ${res.statusCode}`);
                this.circuitBreaker.recordFailure();
                return resolve({ status: 'error', message: `HTTP ${res.statusCode} after max retries` });
              }
            } catch (parseErr) {
              log('error', `Failed to parse API response: ${parseErr.message}`, { body: body.substring(0, 500) });
              return resolve({ status: 'error', message: 'Invalid API response' });
            }
          });
        });

        req.on('error', (err) => {
          const errorType = this.classifyError(err);
          if (errorType === 'transient' && attempt < this.config.maxRetries) {
            const delay = this.calculateBackoff(attempt);
            log('warn', `Network error: ${err.message} (attempt ${attempt + 1}/${this.config.maxRetries + 1}), retrying in ${(delay / 1000).toFixed(1)}s...`);
            setTimeout(() => attemptRequest(attempt + 1), delay);
          } else if (attempt >= this.config.maxRetries) {
            log('error', `Max retries reached: ${err.message}`);
            this.circuitBreaker.recordFailure();
            return resolve({ status: 'error', message: `Network error after max retries: ${err.message}` });
          }
        });

        req.on('timeout', () => {
          req.destroy();
          if (attempt < this.config.maxRetries) {
            const delay = this.calculateBackoff(attempt);
            log('warn', `Request timeout (attempt ${attempt + 1}/${this.config.maxRetries + 1}), retrying in ${(delay / 1000).toFixed(1)}s...`);
            setTimeout(() => attemptRequest(attempt + 1), delay);
          } else {
            log('error', 'Max retries reached for timeout');
            this.circuitBreaker.recordFailure();
            return resolve({ status: 'error', message: 'Timeout after max retries' });
          }
        });

        req.write(payloadStr);
        req.end();
      };

      attemptRequest(0);
    });
  }

  syncTickets() {
    if (!fs.existsSync(this.config.dbPath)) {
      log('debug', 'No local sales DB found, skipping sync.');
      return;
    }

    let tickets;
    try {
      tickets = JSON.parse(fs.readFileSync(this.config.dbPath, 'utf-8'));
      if (!Array.isArray(tickets)) {
        log('error', 'Invalid local sales DB format: expected array.');
        return;
      }
    } catch (err) {
      log('error', `Failed to parse local sales DB: ${err.message}`);
      return;
    }

    const lastSyncedId = this.getOffset();
    const unsyncedTickets = tickets
      .filter((t) => t.id > lastSyncedId)
      .sort((a, b) => a.id - b.id)
      .slice(0, this.config.maxBatchSize);

    if (unsyncedTickets.length === 0) {
      return;
    }

    log('info', `Found ${unsyncedTickets.length} unsynced ticket(s). Preparing payload...`);

    // Load seen hashes once before the loop to avoid O(n) disk reads
    const seenHashes = this.loadSeenHashes();
    const newHashes = [];
    const payloadTickets = [];
    let maxIdProcessed = lastSyncedId;
    let duplicatesFound = 0;

    for (const ticket of unsyncedTickets) {
      const apiTicket = {
        external_ticket_id: ticket.ticket_number,
        ticket_date: (ticket.sold_at || '').endsWith('Z') ? ticket.sold_at : (ticket.sold_at + 'Z'),
        total_amount: ticket.total_amount,
        items: (ticket.items || []).map((item) => ({
          recipe_id: item.recipe_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          quantity_served: item.quantity_served,
        })),
      };

      // Duplicate detection (in-memory, no disk reads per ticket)
      const hash = this.computeTicketHash(apiTicket);
      if (seenHashes.has(hash)) {
        log('warn', `Duplicate ticket detected: ${ticket.ticket_number}`);
        duplicatesFound++;
        maxIdProcessed = Math.max(maxIdProcessed, ticket.id);
        continue;
      }

      seenHashes.add(hash);
      newHashes.push(hash);
      payloadTickets.push(apiTicket);
      maxIdProcessed = Math.max(maxIdProcessed, ticket.id);
    }

    // Persist all new hashes in one batch write (O(1) disk I/O)
    this.persistTicketHashes(newHashes);

    if (payloadTickets.length === 0) {
      log('info', `All ${duplicatesFound} tickets were duplicates. Updating offset.`);
      this.updateOffset(maxIdProcessed);
      return;
    }

    // Check circuit breaker
    if (!this.circuitBreaker.allowRequest()) {
      log('warn', `Circuit breaker is OPEN. Skipping sync. Will retry in ${this.config.circuitBreakerReset / 1000}s.`);
      return;
    }

    const payload = {
      department_id: this.config.departmentId,
      tickets: payloadTickets,
    };

    log('info', `Sending ${payloadTickets.length} ticket(s) to API...`);

    this.sendSyncRequest(payload).then((result) => {
      if (result && result.status === 'success') {
        const syncedCount = result.synced_tickets_count || 0;
        const warnings = result.warnings || [];
        log('info', `Successfully synced ${syncedCount} ticket(s)`);

        if (warnings.length > 0) {
          warnings.forEach((w) => log('warn', `API warning: ${w}`));
        }

        this.updateOffset(maxIdProcessed);
      } else {
        const errorMsg = (result && result.message) || 'Unknown error';
        log('error', `Sync failed: ${errorMsg}`);
      }
    });
  }

  run() {
    log('info', '=== Sync Agent started ===');

    // Immediate sync on start
    this.syncTickets();

    // Periodic sync
    this.intervalHandle = setInterval(() => {
      if (!this.running) return;
      try {
        this.syncTickets();
      } catch (err) {
        log('error', `Uncaught error in sync loop: ${err.message}`);
      }
    }, this.config.syncInterval * 1000);

    this.intervalHandle.unref();
  }
}

// ======================================================
// ENTRY POINT
// ======================================================

const config = loadConfig();
const agent = new SyncAgent(config);
agent.run();
