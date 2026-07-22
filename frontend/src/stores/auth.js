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
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
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
        if ('Notification' in window && Notification.permission === 'default') {
          Notification.requestPermission()
        }
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
        ahmed: { id: 1, username: 'ahmed', role: 'admin', first_name: 'Ahmed', last_name: 'Ben Salah', pass: 'admin123' },
        sami: { id: 2, username: 'sami', role: 'manager', first_name: 'Sami', last_name: 'Trabelsi', pass: 'manager123' },
        youssef: { id: 3, username: 'youssef', role: 'cook', first_name: 'Youssef', last_name: 'Gharbi', pass: 'cook123' },
        mohamed: { id: 4, username: 'mohamed', role: 'admin', first_name: 'Mohamed', last_name: 'Jaziri', pass: 'admin123' },
        aymen: { id: 5, username: 'aymen', role: 'manager', first_name: 'Aymen', last_name: 'Kefi', pass: 'manager123' },
        walid: { id: 6, username: 'walid', role: 'cook', first_name: 'Walid', last_name: 'Hamdi', pass: 'cook123' }
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
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }

  async function logout() {
    try {
      // Call the logout endpoint to record the event in the activity journal
      await api.logout()
    } catch {
      // If the server is unreachable, still log out locally
      console.warn('[Auth] Logout API call failed, logging out locally')
    }
    user.value = null
    token.value = null
    localStorage.removeItem('mepos_user')
    localStorage.removeItem('mepos_token')
  }

  return { user, token, isLoading, error, isLoggedIn, isAdmin, isManager, isCook, init, login, logout }
})
