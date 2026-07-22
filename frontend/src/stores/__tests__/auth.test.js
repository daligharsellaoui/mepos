import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '../auth'

// Mock the api module
vi.mock('../../api', () => ({
  api: {
    login: vi.fn()
  }
}))

import { api } from '../../api'

describe('Auth Store', () => {
  let store

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useAuthStore()
    localStorage.clear()
    vi.clearAllMocks()
  })

  describe('Initial state', () => {
    it('starts with null user and token', () => {
      expect(store.user).toBeNull()
      expect(store.token).toBeNull()
      expect(store.isLoading).toBe(false)
      expect(store.error).toBeNull()
    })

    it('isLoggedIn is false initially', () => {
      expect(store.isLoggedIn).toBe(false)
    })

    it('isAdmin is false initially', () => {
      expect(store.isAdmin).toBe(false)
    })

    it('isManager is false initially', () => {
      expect(store.isManager).toBe(false)
    })

    it('isCook is false initially', () => {
      expect(store.isCook).toBe(false)
    })
  })

  describe('init()', () => {
    it('restores user from localStorage', () => {
      const mockUser = { id: 1, username: 'admin', role: 'admin', first_name: 'Med' }
      localStorage.setItem('mepos_user', JSON.stringify(mockUser))
      localStorage.setItem('mepos_token', 'test-token-123')

      store.init()

      expect(store.user).toEqual(mockUser)
      expect(store.token).toBe('test-token-123')
      expect(store.isLoggedIn).toBe(true)
    })

    it('handles invalid JSON in localStorage gracefully', () => {
      localStorage.setItem('mepos_user', 'invalid-json{')
      localStorage.setItem('mepos_token', 'test-token')

      store.init()

      expect(store.user).toBeNull()
      expect(store.token).toBeNull()
      expect(localStorage.getItem('mepos_user')).toBeNull()
      expect(localStorage.getItem('mepos_token')).toBeNull()
    })

    it('does nothing when no saved data', () => {
      store.init()

      expect(store.user).toBeNull()
      expect(store.token).toBeNull()
    })
  })

  describe('login() - online success', () => {
    it('sets user and token on successful API login', async () => {
      const mockResponse = {
        data: {
          status: 'success',
          data: {
            user: { id: 1, username: 'admin', role: 'admin', first_name: 'Med' },
            token: 'jwt-token-abc'
          }
        }
      }
      api.login.mockResolvedValue(mockResponse)

      const result = await store.login('admin', 'admin123')

      expect(result).toBe(true)
      expect(store.user).toEqual(mockResponse.data.data.user)
      expect(store.token).toBe('jwt-token-abc')
      expect(store.isLoggedIn).toBe(true)
      expect(store.isAdmin).toBe(true)
      expect(store.error).toBeNull()
      expect(localStorage.getItem('mepos_token')).toBe('jwt-token-abc')
    })

    it('sets error on failed API login', async () => {
      const mockResponse = {
        data: {
          status: 'error',
          message: 'Identifiants incorrects.'
        }
      }
      api.login.mockResolvedValue(mockResponse)

      const result = await store.login('wrong', 'wrong')

      expect(result).toBe(false)
      expect(store.user).toBeNull()
      expect(store.token).toBeNull()
      expect(store.error).toBe('Identifiants incorrects.')
    })

    it('uses default error message when API returns no message', async () => {
      const mockResponse = {
        data: {
          status: 'error'
          // no message field
        }
      }
      api.login.mockResolvedValue(mockResponse)

      const result = await store.login('wrong', 'wrong')

      expect(result).toBe(false)
      expect(store.error).toBe('Identifiants incorrects.')
    })

    it('saves user to offline cache after successful login', async () => {
      const mockResponse = {
        data: {
          status: 'success',
          data: {
            user: { id: 1, username: 'admin', role: 'admin', first_name: 'Med' },
            token: 'jwt-token-abc'
          }
        }
      }
      api.login.mockResolvedValue(mockResponse)

      await store.login('admin', 'admin123')

      const offlineUsers = JSON.parse(localStorage.getItem('mepos_offline_users') || '{}')
      expect(offlineUsers['admin']).toBeDefined()
      expect(offlineUsers['admin'].password).toBe('admin123')
      expect(offlineUsers['admin'].user.username).toBe('admin')
    })
  })

  describe('login() - offline fallback', () => {
    it('falls back to default admin credentials when offline', async () => {
      api.login.mockRejectedValue(new Error('Network Error'))

      const result = await store.login('admin', 'admin123')

      expect(result).toBe(true)
      expect(store.user).toMatchObject({
        username: 'admin',
        role: 'admin',
        first_name: 'Med'
      })
      expect(store.token).toBe('mepos_offline_token')
      expect(store.isLoggedIn).toBe(true)
    })

    it('falls back to default gerant credentials when offline', async () => {
      api.login.mockRejectedValue(new Error('Network Error'))

      const result = await store.login('gerant', 'gerant123')

      expect(result).toBe(true)
      expect(store.user).toMatchObject({
        username: 'gerant',
        role: 'manager'
      })
      expect(store.isManager).toBe(true)
    })

    it('falls back to default cuisinier credentials when offline', async () => {
      api.login.mockRejectedValue(new Error('Network Error'))

      const result = await store.login('cuisinier', 'cuisinier123')

      expect(result).toBe(true)
      expect(store.user).toMatchObject({
        username: 'cuisinier',
        role: 'cook'
      })
      expect(store.isCook).toBe(true)
    })

    it('returns false for wrong credentials when offline', async () => {
      api.login.mockRejectedValue(new Error('Network Error'))

      const result = await store.login('wrong', 'wrong')

      expect(result).toBe(false)
      expect(store.user).toBeNull()
      expect(store.error).toContain('serveur')
    })

    it('uses cached offline users if available', async () => {
      const cachedUsers = {
        'custom_user': {
          user: { id: 99, username: 'custom_user', role: 'cook', first_name: 'Custom' },
          password: 'pass123'
        }
      }
      localStorage.setItem('mepos_offline_users', JSON.stringify(cachedUsers))
      api.login.mockRejectedValue(new Error('Network Error'))

      const result = await store.login('custom_user', 'pass123')

      expect(result).toBe(true)
      expect(store.user.username).toBe('custom_user')
    })
  })

  describe('logout()', () => {
    it('clears user, token, and localStorage', () => {
      store.user = { id: 1, username: 'admin' }
      store.token = 'test-token'
      localStorage.setItem('mepos_user', JSON.stringify(store.user))
      localStorage.setItem('mepos_token', store.token)

      store.logout()

      expect(store.user).toBeNull()
      expect(store.token).toBeNull()
      expect(store.isLoggedIn).toBe(false)
      expect(localStorage.getItem('mepos_user')).toBeNull()
      expect(localStorage.getItem('mepos_token')).toBeNull()
    })
  })

  describe('Computed role properties', () => {
    it('isAdmin returns true for admin role', () => {
      store.user = { role: 'admin' }
      expect(store.isAdmin).toBe(true)
      expect(store.isManager).toBe(false)
      expect(store.isCook).toBe(false)
    })

    it('isManager returns true for manager role', () => {
      store.user = { role: 'manager' }
      expect(store.isManager).toBe(true)
      expect(store.isAdmin).toBe(false)
      expect(store.isCook).toBe(false)
    })

    it('isCook returns true for cook role', () => {
      store.user = { role: 'cook' }
      expect(store.isCook).toBe(true)
      expect(store.isAdmin).toBe(false)
      expect(store.isManager).toBe(false)
    })
  })
})
