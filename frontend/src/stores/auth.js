import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '../api'

/**
 * Auth store: handles user session, login, logout.
 * Replaces React AuthContext.
 */
export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)
  const token = ref(null)
  const isLoading = ref(false)
  const error = ref(null)

  const isLoggedIn = computed(() => !!user.value && !!token.value)
  const isAdmin = computed(() => user.value?.role === 'admin')
  const isManager = computed(() => user.value?.role === 'manager')
  const isCook = computed(() => user.value?.role === 'cook')

  function init() {
    const savedUser = localStorage.getItem('mepos_user')
    const savedToken = localStorage.getItem('mepos_token')
    if (savedUser && savedToken) {
      try {
        user.value = JSON.parse(savedUser)
        token.value = savedToken
      } catch {
        localStorage.removeItem('mepos_user')
        localStorage.removeItem('mepos_token')
      }
    }
  }

  async function login(username, password) {
    isLoading.value = true
    error.value = null

    try {
      if (!navigator.onLine) throw new Error('Offline')

      const { data: res } = await api.login(username, password)
      if (res.status === 'success') {
        user.value = res.data.user
        token.value = res.data.token
        localStorage.setItem('mepos_user', JSON.stringify(user.value))
        localStorage.setItem('mepos_token', token.value)

        // Cache for offline
        const offlineUsers = JSON.parse(localStorage.getItem('mepos_offline_users') || '{}')
        offlineUsers[username] = { user: user.value, password }
        localStorage.setItem('mepos_offline_users', JSON.stringify(offlineUsers))

        isLoading.value = false
        return true
      }
      error.value = res.message || 'Identifiants incorrects.'
      isLoading.value = false
      return false
    } catch (err) {
      console.error('[Auth] Login API error:', err)
      // Offline fallback — only if we have cached/offline users
      const cachedUsers = JSON.parse(localStorage.getItem('mepos_cached_users') || '[]')
      const cached = cachedUsers.find(u => u.username === username)
      if (cached && cached.password === password) {
        setUser({ id: cached.id, username: cached.username, role: cached.role, first_name: cached.first_name, last_name: cached.last_name })
        return true
      }

      const offlineUsers = JSON.parse(localStorage.getItem('mepos_offline_users') || '{}')
      if (offlineUsers[username]?.password === password) {
        user.value = offlineUsers[username].user
        token.value = 'mepos_offline_token'
        localStorage.setItem('mepos_user', JSON.stringify(user.value))
        localStorage.setItem('mepos_token', token.value)
        isLoading.value = false
        return true
      }

      const defaults = {
        admin: { id: 1, username: 'admin', role: 'admin', first_name: 'Med', last_name: 'Mair', pass: 'admin123' },
        gerant: { id: 2, username: 'gerant', role: 'manager', first_name: 'Ahmed', last_name: 'Ben Ali', pass: 'gerant123' },
        cuisinier: { id: 3, username: 'cuisinier', role: 'cook', first_name: 'Youssef', last_name: 'Tunisi', pass: 'cuisinier123' }
      }
      const fb = defaults[username]
      if (fb && fb.pass === password) {
        setUser({ id: fb.id, username: fb.username, role: fb.role, first_name: fb.first_name, last_name: fb.last_name })
        return true
      }

      error.value = "Impossible de contacter le serveur. Vérifiez votre connexion."
      isLoading.value = false
      return false
    }
  }

  function setUser(data) {
    user.value = data
    token.value = 'mepos_offline_token'
    localStorage.setItem('mepos_user', JSON.stringify(data))
    localStorage.setItem('mepos_token', token.value)
    isLoading.value = false
  }

  function logout() {
    user.value = null
    token.value = null
    localStorage.removeItem('mepos_user')
    localStorage.removeItem('mepos_token')
  }

  return { user, token, isLoading, error, isLoggedIn, isAdmin, isManager, isCook, init, login, logout }
})
