import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import {
  hashPassword,
  verifyPassword,
  authenticateUser,
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
} from '../services/auth.service';
import { tenantContextMiddleware } from '../middleware/tenantContext';

const router = Router();

// ======================================================
// JWT HELPERS
// ======================================================

const JWT_SECRET = process.env.JWT_SECRET || 'mepos_jwt_dev_secret_change_in_production';
const JWT_EXPIRES_IN = '24h';
/** Sign a JWT token for a user */
export function signToken(user: { id: number; username: string; role: string; tenantId?: number }): string {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, tenantId: user.tenantId },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/** Verify and decode a JWT token */
export function verifyToken(token: string): any {
  return jwt.verify(token, JWT_SECRET);
}

// ======================================================
// MIDDLEWARE
// ======================================================

/**
 * Middleware: authenticate via JWT Bearer token
 */
export const jwtAuthMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ status: 'error', message: 'Authentification requise. Token manquant.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = verifyToken(token);
    (req as any).user = decoded;
    next();
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ status: 'error', message: 'Session expirée. Veuillez vous reconnecter.' });
    }
    return res.status(401).json({ status: 'error', message: 'Token invalide.' });
  }
};

/**
 * Middleware: check API key (for machine-to-machine communication)
 */
export const apiKeyMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({ status: 'error', message: 'Invalid or missing API key' });
  }
  next();
};

/**
 * Combined middleware: accepts EITHER JWT Bearer token OR X-API-KEY.
 * Frontend uses JWT; agents/simulators use API key.
 */
export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const apiKey = req.headers['x-api-key'];

  // Try JWT first
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = verifyToken(token);
      (req as any).user = decoded;
      return next();
    } catch (err: any) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ status: 'error', message: 'Session expirée. Veuillez vous reconnecter.' });
      }
      // If JWT fails, fall through to try API key
    }
  }

  // Fallback: API key (for agents, simulator)
  if (apiKey && apiKey === process.env.API_KEY) {
    return next();
  }

  return res.status(401).json({ status: 'error', message: 'Authentification requise. Fournissez un token JWT ou une clé API.' });
};

// ======================================================
// ROUTES
// ======================================================

/**
 * POST /api/v1/auth/login
 * Authenticate with username and password, returns JWT
 */
router.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ status: 'error', message: 'Nom d\'utilisateur et mot de passe requis.' });
  }

  try {
    const user = await authenticateUser(username, password);
    const token = signToken(user);

    res.json({
      status: 'success',
      data: { user, token }
    });
  } catch (error: any) {
    res.status(401).json({ status: 'error', message: error.message });
  }
});

/**
 * GET /api/v1/auth/users
 * Retrieve list of all users for the current tenant (JWT required)
 */
router.get('/users', jwtAuthMiddleware, tenantContextMiddleware, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId ?? 1;
    const users = await getAllUsers(tenantId);
    res.json({ status: 'success', data: users });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * POST /api/v1/auth/users
 * Create a new user for the current tenant (JWT required, admin only via RBAC)
 */
router.post('/users', jwtAuthMiddleware, tenantContextMiddleware, async (req: Request, res: Response) => {
  const { username, password, role, first_name, last_name } = req.body;

  if (!username || !password || !role) {
    return res.status(400).json({ status: 'error', message: 'Nom d\'utilisateur, mot de passe et rôle requis.' });
  }

  try {
    const tenantId = req.tenantId ?? 1;
    const user = await createUser({ username, password, role, first_name, last_name, tenantId });
    res.json({ status: 'success', data: user });
  } catch (error: any) {
    const status = error.message.includes('existe déjà') || error.message.includes('Invalid role') ? 400 : 500;
    res.status(status).json({ status: 'error', message: error.message });
  }
});

/**
 * PUT /api/v1/auth/users/:id
 * Update an existing user (JWT required)
 */
router.put('/users/:id', jwtAuthMiddleware, tenantContextMiddleware, async (req: Request, res: Response) => {
  const userId = parseInt(req.params.id, 10);
  const { username, password, role, first_name, last_name } = req.body;

  try {
    const user = await updateUser(userId, { username, password, role, first_name, last_name });
    res.json({ status: 'success', data: user });
  } catch (error: any) {
    const status = error.message.includes('non trouvé') ? 404 : 400;
    res.status(status).json({ status: 'error', message: error.message });
  }
});

/**
 * DELETE /api/v1/auth/users/:id
 * Delete a user (preventing primary admin deletion) — JWT required
 */
router.delete('/users/:id', jwtAuthMiddleware, tenantContextMiddleware, async (req: Request, res: Response) => {
  const userId = parseInt(req.params.id, 10);

  try {
    await deleteUser(userId);
    res.json({ status: 'success', message: 'Utilisateur supprimé avec succès' });
  } catch (error: any) {
    const status = error.message.includes('non trouvé') ? 404 : 400;
    res.status(status).json({ status: 'error', message: error.message });
  }
});

export default router;
