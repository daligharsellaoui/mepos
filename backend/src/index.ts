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

// Import Routes
import authRouter from './routes/auth';
import salesRouter from './routes/sales';
import lossesRouter from './routes/losses';
import transfersRouter from './routes/transfers';
import inventoryRouter from './routes/inventory';

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

// Rate limiting: global
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // 500 requests per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', message: 'Trop de requêtes. Veuillez réessayer plus tard.' }
});
app.use(globalLimiter);

// Stricter rate limit for auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, // 20 login attempts per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', message: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.' }
});

// Mount API routes
app.use('/api/v1/auth', authLimiter, authRouter);
app.use('/api/v1/sales', salesRouter);
app.use('/api/v1/losses', lossesRouter);
app.use('/api/v1/transfers', transfersRouter);
app.use('/api/v1', inventoryRouter); // /departments, /ingredients, /recipes, /stocks

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    mode: isDemoMode ? 'demo-in-memory' : 'postgres-active',
    version: process.env.npm_package_version || '1.5.0',
    timestamp: new Date()
  });
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

  // 3. Start listening
  app.listen(PORT, () => {
    console.log(`[mePOS STOCK API] Server is running on port ${PORT} in ${isDemoMode ? 'DEMO' : 'PRODUCTION'} mode.`);
    
    // 4. Start Background Sales Simulator
    startSalesSimulator();
  });
}

startServer().catch(err => {
  console.error('Failed to start mePOS stock backend server:', err);
});
