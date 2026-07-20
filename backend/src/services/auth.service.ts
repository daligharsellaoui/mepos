import bcrypt from 'bcryptjs';
import { query, isDemoMode, demoDb } from '../database';

const SALT_ROUNDS = 12;

/** Hash a plaintext password */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/** Verify a plaintext password against a hash */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ======================================================
// AUTH SERVICE
// User management and authentication business logic
// ======================================================

export interface SafeUser {
  id: number;
  username: string;
  role: string;
  first_name: string;
  last_name: string;
  tenantId?: number;
}

/** Strip password_hash from user object */
function safeUser(user: any): SafeUser {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    first_name: user.first_name || '',
    last_name: user.last_name || '',
    tenantId: user.tenant_id || undefined,
  };
}

// ──────────────────────────────────────────────
// LOGIN
// ──────────────────────────────────────────────

export async function authenticateUser(
  username: string,
  password: string,
  tenantId?: number
): Promise<SafeUser> {
  const tid = tenantId || 1;

  if (isDemoMode) {
    const user = demoDb.users.find((u: any) => u.username === username && u.tenant_id === tid);
    if (!user) {
      throw new Error('Invalid username or password');
    }

    const isHashed =
      user.password_hash.startsWith('$2a$') ||
      user.password_hash.startsWith('$2b$');
    const isValid = isHashed
      ? await verifyPassword(password, user.password_hash)
      : user.password_hash === password;

    if (!isValid) {
      throw new Error('Invalid username or password');
    }

    return safeUser(user);
  }

  const result = await query(
    'SELECT id, username, role, first_name, last_name, password_hash, tenant_id FROM users WHERE username = $1 AND tenant_id = $2',
    [username, tid]
  );

  if (result.rows.length === 0) {
    throw new Error('Invalid username or password');
  }

  const dbUser = result.rows[0];
  const isValid = await verifyPassword(password, dbUser.password_hash);
  if (!isValid) {
    throw new Error('Invalid username or password');
  }

  return safeUser(dbUser);
}

// ──────────────────────────────────────────────
// LIST USERS
// ──────────────────────────────────────────────

export async function getAllUsers(tenantId?: number): Promise<SafeUser[]> {
  if (isDemoMode) {
    let users = demoDb.users;
    if (tenantId !== undefined) {
      users = users.filter((u: any) => u.tenant_id === tenantId);
    }
    return users.map((u: any) => safeUser(u));
  }

  let sql = 'SELECT id, username, role, first_name, last_name, tenant_id FROM users';
  const params: any[] = [];
  if (tenantId !== undefined) {
    sql += ' WHERE tenant_id = $1';
    params.push(tenantId);
  }
  sql += ' ORDER BY id';

  const result = await query(sql, params);
  return result.rows.map((u: any) => safeUser(u));
}

// ──────────────────────────────────────────────
// CREATE USER
// ──────────────────────────────────────────────

export async function createUser(data: {
  username: string;
  password: string;
  role: string;
  first_name?: string;
  last_name?: string;
  tenantId?: number;
}): Promise<SafeUser> {
  const { username, password, role, first_name, last_name, tenantId } = data;

  if (!['admin', 'manager', 'cook'].includes(role)) {
    throw new Error('Invalid role');
  }

  const hashed = await hashPassword(password);

  if (isDemoMode) {
    const exists = demoDb.users.some((u: any) => u.username === username && u.tenant_id === (tenantId || 1));
    if (exists) {
      throw new Error("Le nom d'utilisateur existe déjà");
    }

    const newUser = {
      id: demoDb.users.length + 1,
      tenant_id: tenantId || 1,
      username,
      password_hash: hashed,
      role,
      first_name: first_name || '',
      last_name: last_name || '',
    };
    demoDb.users.push(newUser);
    return safeUser(newUser);
  }

  const resolvedTenantId = tenantId || 1;
  const existsRes = await query(
    'SELECT id FROM users WHERE username = $1 AND tenant_id = $2',
    [username, resolvedTenantId]
  );
  if (existsRes.rows.length > 0) {
    throw new Error("Le nom d'utilisateur existe déjà");
  }

  const result = await query(
    `INSERT INTO users (username, password_hash, role, first_name, last_name, tenant_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, username, role, first_name, last_name, tenant_id`,
    [username, hashed, role, first_name || '', last_name || '', resolvedTenantId]
  );

  return safeUser(result.rows[0]);
}

// ──────────────────────────────────────────────
// UPDATE USER
// ──────────────────────────────────────────────

export async function updateUser(
  userId: number,
  data: {
    username?: string;
    password?: string;
    role?: string;
    first_name?: string;
    last_name?: string;
  },
  tenantId?: number
): Promise<SafeUser> {
  const { username, password, role, first_name, last_name } = data;
  const tid = tenantId || 1;

  if (role && !['admin', 'manager', 'cook'].includes(role)) {
    throw new Error('Invalid role');
  }

  if (isDemoMode) {
    const idx = demoDb.users.findIndex((u: any) => u.id === userId && u.tenant_id === tid);
    if (idx === -1) {
      throw new Error('Utilisateur non trouvé');
    }

    const exists = demoDb.users.some(
      (u: any) => u.username === username && u.id !== userId && u.tenant_id === tid
    );
    if (exists) {
      throw new Error("Le nom d'utilisateur existe déjà");
    }

    demoDb.users[idx] = {
      ...demoDb.users[idx],
      username: username || demoDb.users[idx].username,
      role: role || demoDb.users[idx].role,
      first_name: first_name || demoDb.users[idx].first_name,
      last_name: last_name || demoDb.users[idx].last_name,
    };

    if (password) {
      demoDb.users[idx].password_hash = await hashPassword(password);
    }

    return safeUser(demoDb.users[idx]);
  }

  if (username) {
    const existsRes = await query(
      'SELECT id FROM users WHERE username = $1 AND tenant_id = $2 AND id != $3',
      [username, tid, userId]
    );
    if (existsRes.rows.length > 0) {
      throw new Error("Le nom d'utilisateur existe déjà");
    }
  }

  let result;
  if (password) {
    const hashed = await hashPassword(password);
    result = await query(
      `UPDATE users
       SET username = COALESCE($1, username),
           password_hash = $2,
           role = COALESCE($3, role),
           first_name = COALESCE($4, first_name),
           last_name = COALESCE($5, last_name),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6 AND tenant_id = $7 RETURNING id, username, role, first_name, last_name`,
      [
        username || null,
        hashed,
        role || null,
        first_name || null,
        last_name || null,
        userId,
        tid,
      ]
    );
  } else {
    result = await query(
      `UPDATE users
       SET username = COALESCE($1, username),
           role = COALESCE($2, role),
           first_name = COALESCE($3, first_name),
           last_name = COALESCE($4, last_name),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5 AND tenant_id = $6 RETURNING id, username, role, first_name, last_name`,
      [username || null, role || null, first_name || null, last_name || null, userId, tid]
    );
  }

  if (result.rows.length === 0) {
    throw new Error('Utilisateur non trouvé');
  }

  return safeUser(result.rows[0]);
}

// ──────────────────────────────────────────────
// DELETE USER
// ──────────────────────────────────────────────

export async function deleteUser(userId: number, tenantId?: number): Promise<void> {
  const tid = tenantId || 1;

  if (isDemoMode) {
    const user = demoDb.users.find((u: any) => u.id === userId && u.tenant_id === tid);
    if (!user) {
      throw new Error('Utilisateur non trouvé');
    }
    if (user.username === 'admin') {
      throw new Error('Impossible de supprimer le compte administrateur principal');
    }
    demoDb.users = demoDb.users.filter((u: any) => u.id !== userId);
    return;
  }

  const checkUser = await query('SELECT username FROM users WHERE id = $1 AND tenant_id = $2', [userId, tid]);
  if (checkUser.rows.length === 0) {
    throw new Error('Utilisateur non trouvé');
  }
  if (checkUser.rows[0].username === 'admin') {
    throw new Error('Impossible de supprimer le compte administrateur principal');
  }

  await query('DELETE FROM users WHERE id = $1 AND tenant_id = $2', [userId, tid]);
}
