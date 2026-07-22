import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '../api'

export const useNotificationStore = defineStore('notifications', () => {
  const items = ref([])
  const unreadCount = ref(0)
  const isLoading = ref(false)
  const hasMore = ref(true)
  const total = ref(0)
  const limit = 30
  const offset = ref(0)
  const filters = ref({
    types: [],
    categories: [],
    priorities: [],
    read: undefined,
    search: '',
  })

  const unreadNotifications = computed(() => items.value.filter(n => !n.read))
  const sortedByPriority = computed(() => {
    const priorityWeight = { critical: 0, high: 1, medium: 2, low: 3 }
    return [...items.value].sort((a, b) => {
      const pwA = priorityWeight[a.priority] ?? 99
      const pwB = priorityWeight[b.priority] ?? 99
      if (pwA !== pwB) return pwA - pwB
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
  })

  let eventSource = null
  let pushSubscription = null

  async function fetchNotifications(reset = false) {
    if (isLoading.value) return
    isLoading.value = true

    try {
      if (reset) {
        offset.value = 0
        hasMore.value = true
      }

      const params = {
        limit,
        offset: offset.value,
        sort_by: 'created_at',
        sort_order: 'desc',
        archived: false,
      }

      if (filters.value.types.length > 0) params.types = filters.value.types.join(',')
      if (filters.value.categories.length > 0) params.categories = filters.value.categories.join(',')
      if (filters.value.priorities.length > 0) params.priorities = filters.value.priorities.join(',')
      if (filters.value.read !== undefined) params.read = filters.value.read
      if (filters.value.search) params.search = filters.value.search

      const { data: res } = await api.getNotifications(params)

      if (res.status === 'success') {
        if (reset) {
          items.value = res.data
        } else {
          items.value = [...items.value, ...res.data]
        }
        total.value = res.total
        hasMore.value = offset.value + limit < total.value
        offset.value += limit
      }
    } catch (err) {
      console.error('[Notifications] fetch error:', err)
    } finally {
      isLoading.value = false
    }
  }

  async function fetchUnreadCount() {
    try {
      const { data: res } = await api.getUnreadCount()
      if (res.status === 'success') {
        unreadCount.value = res.data.count
      }
    } catch (_) { /* noop */ }
  }

  async function markAsRead(notifId) {
    try {
      await api.markAsRead(notifId)
      items.value = items.value.map(n =>
        n.id === notifId ? { ...n, read: true, read_at: new Date().toISOString() } : n
      )
      unreadCount.value = Math.max(0, unreadCount.value - 1)
    } catch (err) {
      console.error('[Notifications] mark read error:', err)
    }
  }

  async function markAllAsRead() {
    try {
      await api.markAllAsRead()
      items.value = items.value.map(n => ({ ...n, read: true, read_at: n.read_at || new Date().toISOString() }))
      unreadCount.value = 0
    } catch (err) {
      console.error('[Notifications] mark all read error:', err)
    }
  }

  async function archiveNotification(notifId) {
    try {
      await api.archiveNotification(notifId)
      items.value = items.value.filter(n => n.id !== notifId)
      if (!items.value.find(n => n.id === notifId)?.read) {
        unreadCount.value = Math.max(0, unreadCount.value - 1)
      }
    } catch (err) {
      console.error('[Notifications] archive error:', err)
    }
  }

  async function deleteNotification(notifId) {
    try {
      await api.deleteNotification(notifId)
      const notif = items.value.find(n => n.id === notifId)
      items.value = items.value.filter(n => n.id !== notifId)
      if (notif && !notif.read) {
        unreadCount.value = Math.max(0, unreadCount.value - 1)
      }
    } catch (err) {
      console.error('[Notifications] delete error:', err)
    }
  }

  function setFilters(newFilters) {
    Object.assign(filters.value, newFilters)
    return fetchNotifications(true)
  }

  function requestDesktopPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    if (!('Notification' in window) || Notification.permission === 'denied') return
    if (Notification.permission === 'default') {
      const result = await Notification.requestPermission()
      if (result !== 'granted') return
    }

    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      await navigator.serviceWorker.ready

      const existingSub = await reg.pushManager.getSubscription()
      if (existingSub) {
        pushSubscription = existingSub
        return
      }

      const { data: keyRes } = await api.getVapidPublicKey()
      if (keyRes.status !== 'success') return
      const vapidKey = keyRes.data.publicKey
      if (!vapidKey) return

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      })

      pushSubscription = sub

      await api.pushSubscribe({
        endpoint: sub.endpoint,
        keys: sub.toJSON().keys,
      })
    } catch (err) {
      console.warn('[Push] registration error:', err)
    }
  }

  async function unregisterPush() {
    if (pushSubscription) {
      try {
        await api.pushUnsubscribe(pushSubscription.endpoint)
        await pushSubscription.unsubscribe()
      } catch (_) { /* noop */ }
      pushSubscription = null
    }
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
    const rawData = atob(base64)
    return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
  }

  function showDesktopNotification(notif) {
    if ('Notification' in window && Notification.permission === 'granted' && !document.hasFocus()) {
      try {
        new Notification(notif.title || 'Notification', {
          body: notif.message || '',
          icon: '/favicon.ico',
          tag: `notif-${notif.id}`,
        })
      } catch (_) { /* noop */ }
    }
  }

  function playNotificationSound() {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
      const osc = audioCtx.createOscillator()
      const gain = audioCtx.createGain()
      osc.connect(gain)
      gain.connect(audioCtx.destination)
      osc.frequency.value = 880
      osc.type = 'sine'
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3)
      osc.start(audioCtx.currentTime)
      osc.stop(audioCtx.currentTime + 0.3)
    } catch (_) { /* noop */ }
  }

  function connectSSE() {
    const token = localStorage.getItem('mepos_token')
    if (!token) return

    if (eventSource) {
      eventSource.close()
    }

    const base = import.meta.env.VITE_API_URL || '/api/v1'
    const baseOrigin = base.replace('/api/v1', '').replace(/\/+$/, '') || ''
    const url = `${baseOrigin}/api/v1/notifications/stream?token=${encodeURIComponent(token)}`
    console.debug('[Notifications] SSE connecting to:', url)

    eventSource = new EventSource(url)

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'notification') {
          items.value = [data.notification, ...items.value]
          if (data.unreadCount !== undefined) {
            unreadCount.value = data.unreadCount
          }
          showDesktopNotification(data.notification)
          playNotificationSound()
        }
      } catch (_) { /* noop */ }
    }

    eventSource.onerror = () => {
      eventSource.close()
      setTimeout(() => connectSSE(), 5000)
    }
  }

  function disconnectSSE() {
    if (eventSource) {
      eventSource.close()
      eventSource = null
    }
  }

  return {
    items, unreadCount, isLoading, hasMore, total,
    limit, offset,
    filters, unreadNotifications, sortedByPriority,
    fetchNotifications, fetchUnreadCount, markAsRead,
    markAllAsRead, archiveNotification, deleteNotification,
    setFilters, connectSSE, disconnectSSE,
    requestDesktopPermission, registerServiceWorker, registerPush: registerServiceWorker,
    unregisterPush,
  }
})
