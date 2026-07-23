<script setup>
import { onMounted, onUnmounted, watch } from 'vue'
import { useAuthStore } from './stores/auth'
import { useAppStore } from './stores/app'
import { useNotificationStore } from './stores/notifications'
import ErrorBoundary from './components/base/ErrorBoundary.vue'
import ToastProvider from './components/notifications/ToastProvider.vue'

const auth = useAuthStore()
const app = useAppStore()
const notifStore = useNotificationStore()

let fallbackInterval = null

function startRealtime(user) {
  if (!user) return
  app.setupNetworkListeners()
  app.fetchData(user)
  app.connectDataStream(user)
  if (!fallbackInterval) {
    fallbackInterval = window.setInterval(() => app.fetchData(user), 300000)
  }
}

function stopRealtime() {
  app.disconnectDataStream()
  if (fallbackInterval) {
    clearInterval(fallbackInterval)
    fallbackInterval = null
  }
}

onMounted(() => {
  auth.init()
  if (auth.isLoggedIn) startRealtime(auth.user)
})

onUnmounted(() => stopRealtime())

// Watch for login AFTER mount (e.g., user logs in from /login page).
// When already logged in at mount, the onMounted handles it — this
// watch only fires on actual changes.
watch(() => auth.isLoggedIn, (loggedIn) => {
  if (!loggedIn) stopRealtime()
  else startRealtime(auth.user)
})
</script>

<template>
  <ErrorBoundary>
    <ToastProvider>
      <router-view />
    </ToastProvider>
  </ErrorBoundary>
</template>
