import { Router, Request, Response } from 'express';
import { query, isDemoMode, demoDb } from '../database';

const router = Router();

/**
 * POST /api/v1/auth/login
 * Simple mock login for demonstration purposes
 */
router.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ status: 'error', message: 'Missing username or password' });
  }

  try {
    let user: any = null;

    if (isDemoMode) {
      user = demoDb.users.find(u => u.username === username);
      if (!user || user.password_hash !== password) {
        return res.status(401).json({ status: 'error', message: 'Invalid username or password' });
      }
      // Shallow copy and remove hash
      user = { ...user };
      delete user.password_hash;
    } else {
      const result = await query(
        'SELECT id, username, role, first_name, last_name, password_hash FROM users WHERE username = $1',
        [username]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ status: 'error', message: 'Invalid username or password' });
      }

      user = result.rows[0];
      if (user.password_hash !== password) {
        return res.status(401).json({ status: 'error', message: 'Invalid username or password' });
      }
      delete user.password_hash;
    }

    res.json({
      status: 'success',
      data: {
        user,
        token: 'mepos_session_token_mock_123'
      }
    });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Middleware to check API key
const apiKeyMiddleware = (req: Request, res: Response, next: () => void) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({ status: 'error', message: 'Invalid or missing API key' });
  }
  next();
};

/**
 * GET /api/v1/auth/users
 * Retrieve list of all users
 */
router.get('/users', apiKeyMiddleware, async (req: Request, res: Response) => {
  try {
    if (isDemoMode) {
      const users = demoDb.users.map(u => ({
        id: u.id,
        username: u.username,
        role: u.role,
        first_name: u.first_name,
        last_name: u.last_name,
        password: u.password_hash
      }));
      return res.json({ status: 'success', data: users });
    }

    const result = await query(
      'SELECT id, username, role, first_name, last_name, password_hash as password FROM users ORDER BY id'
    );
    res.json({ status: 'success', data: result.rows });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * POST /api/v1/auth/users
 * Create a new user
 */
router.post('/users', apiKeyMiddleware, async (req: Request, res: Response) => {
  const { username, password, role, first_name, last_name } = req.body;

  if (!username || !password || !role) {
    return res.status(400).json({ status: 'error', message: 'Missing username, password, or role' });
  }

  if (!['admin', 'manager', 'cook'].includes(role)) {
    return res.status(400).json({ status: 'error', message: 'Invalid role' });
  }

  try {
    if (isDemoMode) {
      const exists = demoDb.users.some(u => u.username === username);
      if (exists) {
        return res.status(400).json({ status: 'error', message: "Le nom d'utilisateur existe déjà" });
      }

      const newUser = {
        id: demoDb.users.length + 1,
        username,
        password_hash: password,
        role,
        first_name: first_name || '',
        last_name: last_name || ''
      };
      demoDb.users.push(newUser);
      return res.json({ status: 'success', data: { id: newUser.id, username, role, first_name, last_name, password } });
    }

    const existsRes = await query('SELECT id FROM users WHERE username = $1', [username]);
    if (existsRes.rows.length > 0) {
      return res.status(400).json({ status: 'error', message: "Le nom d'utilisateur existe déjà" });
    }

    const result = await query(
      `INSERT INTO users (username, password_hash, role, first_name, last_name)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, username, role, first_name, last_name, password_hash as password`,
      [username, password, role, first_name || '', last_name || '']
    );

    res.json({ status: 'success', data: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * PUT /api/v1/auth/users/:id
 * Update an existing user
 */
router.put('/users/:id', apiKeyMiddleware, async (req: Request, res: Response) => {
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
        demoDb.users[idx].password_hash = password;
      }

      return res.json({ status: 'success', data: { id: userId, username, role, first_name, last_name, password: demoDb.users[idx].password_hash } });
    }

    const existsRes = await query('SELECT id FROM users WHERE username = $1 AND id != $2', [username, userId]);
    if (existsRes.rows.length > 0) {
      return res.status(400).json({ status: 'error', message: "Le nom d'utilisateur existe déjà" });
    }

    let result;
    if (password) {
      result = await query(
        `UPDATE users
         SET username = $1, password_hash = $2, role = $3, first_name = $4, last_name = $5, updated_at = CURRENT_TIMESTAMP
         WHERE id = $6 RETURNING id, username, role, first_name, last_name, password_hash as password`,
        [username, password, role, first_name || '', last_name || '', userId]
      );
    } else {
      result = await query(
        `UPDATE users
         SET username = $1, role = $2, first_name = $3, last_name = $4, updated_at = CURRENT_TIMESTAMP
         WHERE id = $5 RETURNING id, username, role, first_name, last_name, password_hash as password`,
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
 * Delete a user (preventing primary admin deletion)
 */
router.delete('/users/:id', apiKeyMiddleware, async (req: Request, res: Response) => {
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
