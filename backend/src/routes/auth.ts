import { Router, Request, Response, NextFunction } from 'express';
import { query, isDemoMode, demoDb } from '../database';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const router = Router();

// ======================================================
// HELPERS
// ======================================================

const JWT_SECRET = process.env.JWT_SECRET || 'mepos_jwt_dev_secret_change_in_production';
const JWT_EXPIRES_IN = '24h';

const SALT_ROUNDS = 12;

/** Hash a plaintext password */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/** Verify a plaintext password against a hash */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Sign a JWT token for a user */
export function signToken(user: { id: number; username: string; role: string }): string {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/** Verify and decode a JWT token */
export function verifyToken(token: string): any {
  return jwt.verify(token, JWT_SECRET);
}

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

/**
 * POST /api/v1/auth/login
 * Authenticate with username and password, returns JWT
 */
router.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ status: 'error', message: 'Missing username or password' });
  }

  try {
    if (isDemoMode) {
      // Demo mode: use stored hash (or fallback to plaintext for legacy demo users)
      const user = demoDb.users.find(u => u.username === username);
      if (!user) {
        return res.status(401).json({ status: 'error', message: 'Invalid username or password' });
      }

      // Demo users may have plaintext passwords for simplicity
      const isValid = user.password_hash.startsWith('$2a$') || user.password_hash.startsWith('$2b$')
        ? await verifyPassword(password, user.password_hash)
        : user.password_hash === password;

      if (!isValid) {
        return res.status(401).json({ status: 'error', message: 'Invalid username or password' });
      }

      const safeUser = { id: user.id, username: user.username, role: user.role, first_name: user.first_name, last_name: user.last_name };
      const token = signToken(safeUser);

      return res.json({
        status: 'success',
        data: { user: safeUser, token }
      });
    }

    // PostgreSQL mode
    const result = await query(
      'SELECT id, username, role, first_name, last_name, password_hash FROM users WHERE username = $1',
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ status: 'error', message: 'Invalid username or password' });
    }

    const dbUser = result.rows[0];
    const isValid = await verifyPassword(password, dbUser.password_hash);
    if (!isValid) {
      return res.status(401).json({ status: 'error', message: 'Invalid username or password' });
    }

    const safeUser = { id: dbUser.id, username: dbUser.username, role: dbUser.role, first_name: dbUser.first_name, last_name: dbUser.last_name };
    const token = signToken(safeUser);

    res.json({
      status: 'success',
      data: { user: safeUser, token }
    });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * GET /api/v1/auth/users
 * Retrieve list of all users (JWT required)
 */
router.get('/users', jwtAuthMiddleware, async (req: Request, res: Response) => {
  try {
    if (isDemoMode) {
      const users = demoDb.users.map(u => ({
        id: u.id,
        username: u.username,
        role: u.role,
        first_name: u.first_name,
        last_name: u.last_name
      }));
      return res.json({ status: 'success', data: users });
    }

    const result = await query(
      'SELECT id, username, role, first_name, last_name FROM users ORDER BY id'
    );
    res.json({ status: 'success', data: result.rows });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * POST /api/v1/auth/users
 * Create a new user (JWT required, admin only via RBAC)
 */
router.post('/users', jwtAuthMiddleware, async (req: Request, res: Response) => {
  const { username, password, role, first_name, last_name } = req.body;

  if (!username || !password || !role) {
    return res.status(400).json({ status: 'error', message: 'Missing username, password, or role' });
  }

  if (!['admin', 'manager', 'cook'].includes(role)) {
    return res.status(400).json({ status: 'error', message: 'Invalid role' });
  }

  try {
    const hashedPassword = await hashPassword(password);

    if (isDemoMode) {
      const exists = demoDb.users.some(u => u.username === username);
      if (exists) {
        return res.status(400).json({ status: 'error', message: "Le nom d'utilisateur existe déjà" });
      }

      const newUser = {
        id: demoDb.users.length + 1,
        username,
        password_hash: hashedPassword,
        role,
        first_name: first_name || '',
        last_name: last_name || ''
      };
      demoDb.users.push(newUser);
      return res.json({ status: 'success', data: { id: newUser.id, username, role, first_name, last_name } });
    }

    const existsRes = await query('SELECT id FROM users WHERE username = $1', [username]);
    if (existsRes.rows.length > 0) {
      return res.status(400).json({ status: 'error', message: "Le nom d'utilisateur existe déjà" });
    }

    const result = await query(
      `INSERT INTO users (username, password_hash, role, first_name, last_name)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, username, role, first_name, last_name`,
      [username, hashedPassword, role, first_name || '', last_name || '']
    );

    res.json({ status: 'success', data: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * PUT /api/v1/auth/users/:id
 * Update an existing user (JWT required)
 */
router.put('/users/:id', jwtAuthMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { username, password, role, first_name, last_name } = req.body;

  if (!username || !role) {
    return res.status(400).json({ status: 'error', message: 'Missing username or role' });
  }

  if (!['admin', 'manager', 'cook'].includes(role)) {
    return res.status(400).json({ status: 'error', message: 'Invalid role' });
  }

  const userId = parseInt(id, 10);

  try {
    if (isDemoMode) {
      const idx = demoDb.users.findIndex(u => u.id === userId);
      if (idx === -1) {
        return res.status(404).json({ status: 'error', message: 'Utilisateur non trouvé' });
      }

      const exists = demoDb.users.some(u => u.username === username && u.id !== userId);
      if (exists) {
        return res.status(400).json({ status: 'error', message: "Le nom d'utilisateur existe déjà" });
      }

      demoDb.users[idx] = {
        ...demoDb.users[idx],
        username,
        role,
        first_name: first_name || demoDb.users[idx].first_name,
        last_name: last_name || demoDb.users[idx].last_name
      };

      if (password) {
        demoDb.users[idx].password_hash = await hashPassword(password);
      }

      return res.json({ status: 'success', data: { id: userId, username, role, first_name, last_name } });
    }

    const existsRes = await query('SELECT id FROM users WHERE username = $1 AND id != $2', [username, userId]);
    if (existsRes.rows.length > 0) {
      return res.status(400).json({ status: 'error', message: "Le nom d'utilisateur existe déjà" });
    }

    let result;
    if (password) {
      const hashedPassword = await hashPassword(password);
      result = await query(
        `UPDATE users
         SET username = $1, password_hash = $2, role = $3, first_name = $4, last_name = $5, updated_at = CURRENT_TIMESTAMP
         WHERE id = $6 RETURNING id, username, role, first_name, last_name`,
        [username, hashedPassword, role, first_name || '', last_name || '', userId]
      );
    } else {
      result = await query(
        `UPDATE users
         SET username = $1, role = $2, first_name = $3, last_name = $4, updated_at = CURRENT_TIMESTAMP
         WHERE id = $5 RETURNING id, username, role, first_name, last_name`,
        [username, role, first_name || '', last_name || '', userId]
      );
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Utilisateur non trouvé' });
    }

    res.json({ status: 'success', data: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * DELETE /api/v1/auth/users/:id
 * Delete a user (preventing primary admin deletion) — JWT required
 */
router.delete('/users/:id', jwtAuthMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = parseInt(id, 10);

  try {
    if (isDemoMode) {
      const user = demoDb.users.find(u => u.id === userId);
      if (!user) {
        return res.status(404).json({ status: 'error', message: 'Utilisateur non trouvé' });
      }
      if (user.username === 'admin') {
        return res.status(400).json({ status: 'error', message: 'Impossible de supprimer le compte administrateur principal' });
      }
      demoDb.users = demoDb.users.filter(u => u.id !== userId);
      return res.json({ status: 'success', message: 'Utilisateur supprimé avec succès' });
    }

    const checkUser = await query('SELECT username FROM users WHERE id = $1', [userId]);
    if (checkUser.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Utilisateur non trouvé' });
    }
    if (checkUser.rows[0].username === 'admin') {
      return res.status(400).json({ status: 'error', message: 'Impossible de supprimer le compte administrateur principal' });
    }

    await query('DELETE FROM users WHERE id = $1', [userId]);
    res.json({ status: 'success', message: 'Utilisateur supprimé avec succès' });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

export default router;
