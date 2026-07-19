import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import dotenv from 'dotenv';
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

app.use(cors());
app.use(bodyParser.json());

// Mount API routes
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/sales', salesRouter);
app.use('/api/v1/losses', lossesRouter);
app.use('/api/v1/transfers', transfersRouter);
app.use('/api/v1', inventoryRouter); // /departments, /ingredients, /recipes, /stocks

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    mode: isDemoMode ? 'demo-in-memory' : 'postgres-active',
    timestamp: new Date()
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
