<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const router = useRouter()

const username = ref('')
const password = ref('')
const logoSrc = `${import.meta.env.BASE_URL}logo.png`

async function handleLogin() {
  if (!username.value || !password.value) return
  const success = await auth.login(username.value, password.value)
  if (success) {
    router.push('/')
  }
}
</script>

<template>
  <div class="login-wrapper">
    <div class="glass-panel login-card">
      <div class="login-header">
        <h1 class="login-title">
          <img :src="logoSrc" alt="mePOS" style="height: 42px; display: block; margin: 0 auto;">
        </h1>
        <p class="login-subtitle">
          Connexion au système de gestion
        </p>
      </div>

      <div
        v-if="auth.error"
        class="alert-banner alert-banner-danger"
        style="margin-bottom: 0;"
      >
        <span>{{ auth.error }}</span>
      </div>

      <form @submit.prevent="handleLogin">
        <div class="form-group">
          <label class="form-label">Nom d'utilisateur</label>
          <input
            v-model="username"
            type="text"
            class="form-input"
            placeholder="ahmed, mohamed, sami, aymen..."
            autocomplete="username"
            required
          >
        </div>

        <div class="form-group">
          <label class="form-label">Mot de passe</label>
          <input
            v-model="password"
            type="password"
            class="form-input"
            placeholder="••••••••"
            autocomplete="current-password"
            required
          >
        </div>

        <button
          type="submit"
          class="touch-btn"
          style="width: 100%; margin-top: 0.5rem;"
          :disabled="auth.isLoading"
        >
          {{ auth.isLoading ? 'Connexion...' : 'Se connecter' }}
        </button>
      </form>

      <div style="text-align: center; margin-top: 0.75rem;">
        <p style="font-size: 0.78rem; color: var(--text-muted); line-height: 1.5;">
          <strong>Burger House</strong> : ahmed/admin123 · sami/manager123 · youssef/cook123<br>
          <strong>Pizza Palace</strong> : mohamed/admin123 · aymen/manager123 · walid/cook123
        </p>
      </div>
    </div>
  </div>
</template>
