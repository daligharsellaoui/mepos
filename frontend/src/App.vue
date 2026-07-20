<script setup>
import { onMounted } from 'vue'
import { useAuthStore } from './stores/auth'
import { useAppStore } from './stores/app'
import ErrorBoundary from './components/base/ErrorBoundary.vue'

const auth = useAuthStore()
const app = useAppStore()

onMounted(() => {
  auth.init()
  if (auth.isLoggedIn) {
    app.setupNetworkListeners()
    app.fetchData(auth.user)
    window.setInterval(() => app.fetchData(auth.user), 8000)
  }
})
</script>

<template>
  <ErrorBoundary>
    <router-view />
  </ErrorBoundary>
</template>
