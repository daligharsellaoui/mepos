import { describe, it, expect, afterEach } from 'vitest';

// We test the functions exported from auth.service.ts
// The service uses demoDb which is populated during import
import { authenticateUser, createUser, updateUser, deleteUser, getAllUsers, hashPassword, verifyPassword } from '../auth.service';
import { demoDb } from '../../database';

// Track created users so we can clean up
const createdUsers: number[] = [];

afterEach(async () => {
  // Clean up any users created during tests to keep demoDb pristine
  // Use .filter to rebuild the array since deleteUser mutates demoDb
  for (const userId of createdUsers) {
    const user = demoDb.users.find((u: any) => u.id === userId);
    if (user && user.username !== 'ahmed') {
      try { await deleteUser(userId); } catch { /* already deleted */ }
    }
  }
  createdUsers.length = 0;

  // Reset admin user back to original state
  const admin = demoDb.users.find((u: any) => u.id === 1);
  if (admin) {
    admin.role = 'admin';
  }
});

describe('Auth Service (Demo Mode)', () => {
  describe('hashPassword / verifyPassword', () => {
    it('should hash a password', async () => {
      const hash = await hashPassword('test123');
      expect(hash).toBeDefined();
      expect(hash.startsWith('$2a$') || hash.startsWith('$2b$')).toBe(true);
    });

    it('should verify correct password', async () => {
      const hash = await hashPassword('test123');
      const valid = await verifyPassword('test123', hash);
      expect(valid).toBe(true);
    });

    it('should reject wrong password', async () => {
      const hash = await hashPassword('test123');
      const valid = await verifyPassword('wrong', hash);
      expect(valid).toBe(false);
    });
  });

  describe('authenticateUser', () => {
    it('should authenticate admin user with correct credentials', async () => {
      const user = await authenticateUser('ahmed', 'admin123');
      expect(user).toBeDefined();
      expect(user.username).toBe('ahmed');
      expect(user.role).toBe('admin');
      expect((user as any).password_hash).toBeUndefined(); // no password leaked
    });

    it('should throw for wrong password', async () => {
      await expect(authenticateUser('ahmed', 'wrong'))
        .rejects.toThrow('Invalid username or password');
    });

    it('should throw for non-existent user', async () => {
      await expect(authenticateUser('nonexistent', 'pass'))
        .rejects.toThrow('Invalid username or password');
    });
  });

  describe('getAllUsers', () => {
    it('should return all users without password hashes', async () => {
      const users = await getAllUsers();
      expect(users.length).toBeGreaterThanOrEqual(3);
      users.forEach(u => {
        expect(u.username).toBeDefined();
        expect(u.role).toBeDefined();
        expect((u as any).password_hash).toBeUndefined();
      });
    });
  });

  describe('createUser', () => {
    it('should create a new user', async () => {
      const user = await createUser({
        username: 'test_create',
        password: 'test123',
        role: 'cook',
        first_name: 'Test',
        last_name: 'User',
      });
      createdUsers.push(user.id);
      expect(user.username).toBe('test_create');
      expect(user.role).toBe('cook');

      // Verify we can login with the new user
      const authUser = await authenticateUser('test_create', 'test123');
      expect(authUser.username).toBe('test_create');
    });

    it('should reject duplicate username', async () => {
      await expect(createUser({
        username: 'ahmed',
        password: 'test123',
        role: 'cook',
      })).rejects.toThrow('existe déjà');
    });

    it('should reject invalid role', async () => {
      await expect(createUser({
        username: 'invalid_role',
        password: 'test123',
        role: 'superadmin' as any,
      })).rejects.toThrow('Invalid role');
    });
  });

  describe('updateUser', () => {
    it('should update user role', async () => {
      const updated = await updateUser(1, { role: 'manager' });
      expect(updated.role).toBe('manager');

      // Verify the change persisted in demo mode
      const users = await getAllUsers();
      const admin = users.find(u => u.id === 1);
      expect(admin?.role).toBe('manager');
    });

    it('should throw for non-existent user', async () => {
      await expect(updateUser(9999, { username: 'ghost' }))
        .rejects.toThrow('non trouvé');
    });
  });

  describe('deleteUser', () => {
    it('should throw when deleting primary admin', async () => {
      await expect(deleteUser(1)).rejects
        .toThrow('administrateur principal');
    });

    it('should create and delete a user', async () => {
      const user = await createUser({
        username: 'todelete',
        password: 'pass123',
        role: 'cook',
      });

      await deleteUser(user.id);

      // Verify login fails
      await expect(authenticateUser('todelete', 'pass123'))
        .rejects.toThrow('Invalid username or password');
    });

    it('should restore admin user role after update test', async () => {
      // Verify the admin role was reset by afterEach
      const admin = await getAllUsers();
      const adminUser = admin.find(u => u.id === 1);
      expect(adminUser?.role).toBe('admin');
    });
  });
});
