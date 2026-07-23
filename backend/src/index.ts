import express, { Request, Response, NextFunction } from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { checkConnection, isDemoMode } from './database';
import { initializeDatabase } from './schema';
import { startSalesSimulator } from './simulator';
import { authMiddleware } from './routes/auth';
import { tenantContextMiddleware } from './middleware/tenantContext';
import { eventBus } from './services/event.service';
import { setupNotificationDispatcher } from './services/notification-dispatcher';
import { getUnreadCount, cleanupExpiredNotifications } from './services/notification.service';
import { sendPushForNotification } from './services/push.service';
import { setupActivityJournal } from './services/activityJournal.service';

// Import Routes
import authRouter from './routes/auth';
import salesRouter from './routes/sales';
import lossesRouter from './routes/losses';
import transfersRouter from './routes/transfers';
import inventoryRouter from './routes/inventory';
import forecastRouter from './routes/forecast';
import agentsRouter from './routes/agents';
import settingsRouter from './routes/settings';
import tenantsRouter from './routes/tenants';
import notificationsRouter from './routes/notifications';
import pushRouter from './routes/push';
import suppliersRouter from './routes/suppliers';
import importRouter from './routes/import';
import mappingsRouter from './routes/mappings';
import purchasesRouter from './routes/purchases';
import receptionsRouter from './routes/receptions';
import batchesRouter from './routes/batches';
import inventoryCountsRouter from './routes/inventory-counts';
import priceHistoryRouter from './routes/price-history';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// ======================================================
// SECURITY MIDDLEWARE
// ======================================================

// Helmet: secure HTTP headers
app.use(helmet());

// CORS: restrict to frontend origin
app.use(cors({
  origin: [FRONTEND_URL, 'http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-KEY']
}));

app.use(bodyParser.json({ limit: '10mb' }));

// Morgan: HTTP request logging
const logDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}
const accessLogStream = fs.createWriteStream(path.join(logDir, 'access.log'), { flags: 'a' });
app.use(morgan('combined', { stream: accessLogStream }));
app.use(morgan('dev'));

// Rate limiting disabled for now
// const globalLimiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 minutes
//   max: 500, // 500 requests per window per IP
//   standardHeaders: true,
//   legacyHeaders: false,
//   message: { status: 'error', message: 'Trop de requêtes. Veuillez réessayer plus tard.' }
// });
// app.use(globalLimiter);

// Stricter rate limit for auth routes
// const authLimiter = rateLimit({
//   windowMs: 15 * 60 * 1000,
//   max: 20, // 20 login attempts per 15 minutes
//   standardHeaders: true,
//   legacyHeaders: false,
//   message: { status: 'error', message: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.' }
// });

// Mount API routes
// Auth routes: login is public, protected routes use tenantContextMiddleware
app.use('/api/v1/auth', authRouter);
// All other routes: auth + tenant context middleware
// authMiddleware extracts user from JWT/API key
// tenantContextMiddleware extracts tenant_id and injects into req.tenantId
app.use('/api/v1/sales', authMiddleware, tenantContextMiddleware, salesRouter);
app.use('/api/v1/losses', authMiddleware, tenantContextMiddleware, lossesRouter);
app.use('/api/v1/transfers', authMiddleware, tenantContextMiddleware, transfersRouter);
app.use('/api/v1', authMiddleware, tenantContextMiddleware, inventoryRouter);
app.use('/api/v1/forecast', authMiddleware, tenantContextMiddleware, forecastRouter);
// Agent routes: /authenticate is public, /heartbeat uses agent JWT, rest uses user JWT
app.use('/api/v1/agents', agentsRouter);
// Tenant management routes (platform admin)
app.use('/api/v1/tenants', authMiddleware, tenantContextMiddleware, tenantsRouter);
// Tenant settings routes
app.use('/api/v1/settings', authMiddleware, tenantContextMiddleware, settingsRouter);
// Notification routes
app.use('/api/v1/notifications', authMiddleware, tenantContextMiddleware, notificationsRouter);
// Push notification subscription routes
app.use('/api/v1/push', authMiddleware, tenantContextMiddleware, pushRouter);

// Supplier routes
app.use('/api/v1/suppliers', authMiddleware, tenantContextMiddleware, suppliersRouter);

// Import routes (CSV product import)
app.use('/api/v1/import/products', authMiddleware, tenantContextMiddleware, importRouter);

// Activity Journal routes
import journalRouter from './routes/journal';
app.use('/api/v1/journal', authMiddleware, tenantContextMiddleware, journalRouter);

// Product mapping routes (POS Product Mapping)
app.use('/api/v1/mappings', authMiddleware, tenantContextMiddleware, mappingsRouter);

// Purchase Order routes
app.use('/api/v1/purchases', authMiddleware, tenantContextMiddleware, purchasesRouter);

// Goods Reception routes
app.use('/api/v1/receptions', authMiddleware, tenantContextMiddleware, receptionsRouter);

// Batch Management routes
app.use('/api/v1/batches', authMiddleware, tenantContextMiddleware, batchesRouter);

// Inventory Count routes
app.use('/api/v1/inventory-counts', authMiddleware, tenantContextMiddleware, inventoryCountsRouter);

// Price History routes
app.use('/api/v1/price-history', authMiddleware, tenantContextMiddleware, priceHistoryRouter);

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    mode: isDemoMode ? 'demo-in-memory' : 'postgres-active',
    version: process.env.npm_package_version || '1.5.0',
    timestamp: new Date()
  });
});

// SSE endpoint for real-time notifications
interface SseClient {
  res: Response;
  userId: number;
  role: string;
}
const sseClients: Map<number, Set<SseClient>> = new Map();

app.get('/api/v1/notifications/stream', authMiddleware, tenantContextMiddleware, (req: Request, res: Response) => {
  const tenantId = (req as any).tenantId;
  const user = (req as any).user;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  if (!user || !user.id) {
    res.status(401).json({ status: 'error', message: 'Authentification requise' });
    return;
  }

  res.write(`data: ${JSON.stringify({ type: 'connected', message: 'Connexion établie.' })}\n\n`);

  if (!sseClients.has(tenantId)) {
    sseClients.set(tenantId, new Set());
  }
  const clientEntry: SseClient = { res, userId: user.id, role: user.role };
  sseClients.get(tenantId)!.add(clientEntry);

  const heartbeat = setInterval(() => {
    res.write(`:heartbeat\n\n`);
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
    const clients = sseClients.get(tenantId);
    if (clients) {
      clients.delete(clientEntry);
      if (clients.size === 0) sseClients.delete(tenantId);
    }
  });
});

const ROLE_HIERARCHY: Record<string, number> = { admin: 3, manager: 2, user: 1 };

function hasMinRole(userRole: string, minRole: string): boolean {
  return (ROLE_HIERARCHY[userRole] || 0) >= (ROLE_HIERARCHY[minRole] || 0);
}

eventBus.on('notification:created', async ({ notification, minRole }: { notification: any; minRole?: string }) => {
  const clients = sseClients.get(notification.tenant_id);
  if (!clients || clients.size === 0) return;

  const unreadCache = new Map<number, number>();

  clients.forEach(async (client) => {
    if (notification.assigned_to && client.userId !== notification.assigned_to) return;
    if (minRole && !hasMinRole(client.role, minRole)) return;
    if (!unreadCache.has(client.userId)) {
      const count = await getUnreadCount(notification.tenant_id, client.userId);
      unreadCache.set(client.userId, count);
    }
    const unreadCount = unreadCache.get(client.userId)!;
    const payload = JSON.stringify({ type: 'notification', notification, unreadCount });
    client.res.write(`data: ${payload}\n\n`);
  });

  sendPushForNotification(notification.tenant_id, notification, minRole);
});

// Config endpoint for frontend (no secrets exposed)
app.get('/api/config', (req, res) => {
  res.json({
    status: 'success',
    data: {
      demoMode: isDemoMode,
      frontendUrl: FRONTEND_URL
    }
  });
});

// Global error handling middleware
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[ERROR]', err.message, err.stack);
  res.status(500).json({
    status: 'error',
    message: process.env.NODE_ENV === 'production' ? 'Erreur interne du serveur.' : err.message
  });
});

async function startServer() {
  // 1. Verify PostgreSQL connection
  await checkConnection();

  // 2. Initialize Database Tables if Postgres is active
  if (!isDemoMode) {
    await initializeDatabase();
  }

  // 3. Set up notification dispatcher
  setupNotificationDispatcher();

  // 3b. Set up Activity Journal (business event logging)
  setupActivityJournal();

  // 4. Schedule notification cleanup (every 15 minutes)
  setInterval(async () => {
    try {
      const count = await cleanupExpiredNotifications();
      if (count > 0) {
        console.log(`[Cleanup] Archived ${count} expired notification(s).`);
      }
    } catch (err: any) {
      console.error('[Cleanup] Error archiving expired notifications:', err.message);
    }
  }, 15 * 60 * 1000);

  // 5. Start listening
  app.listen(PORT, () => {
    console.log(`[mePOS STOCK API] Server is running on port ${PORT} in ${isDemoMode ? 'DEMO' : 'PRODUCTION'} mode.`);
    
    // 5. Start Background Sales Simulator
    startSalesSimulator();
  });
}

startServer().catch(err => {
  console.error('Failed to start mePOS stock backend server:', err);
});
