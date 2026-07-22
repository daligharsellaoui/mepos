<script setup>
import { onMounted } from 'vue'
import { useAuthStore } from './stores/auth'
import { useAppStore } from './stores/app'
import { useNotificationStore } from './stores/notifications'
import ErrorBoundary from './components/base/ErrorBoundary.vue'
import ToastProvider from './components/notifications/ToastProvider.vue'

const auth = useAuthStore()
const app = useAppStore()
const notifStore = useNotificationStore()

onMounted(() => {
  auth.init()
  if (auth.isLoggedIn) {
    app.setupNetworkListeners()
    app.fetchData(auth.user)
    // Background polling every 30s as fallback (SSE handles real-time, this ensures data freshness)
    window.setInterval(() => app.fetchData(auth.user), 30000)
  }
})
</script>

<template>
  <ErrorBoundary>
    <ToastProvider>
      <router-view />
    </ToastProvider>
  </ErrorBoundary>
</template>
