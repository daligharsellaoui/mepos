<script setup>
import { useAuthStore } from '../stores/auth'
import { useAppStore } from '../stores/app'
import Sidebar from '../components/layout/Sidebar.vue'
import MobileNav from '../components/layout/MobileNav.vue'
import logoSrc from '../assets/sidelogo.png'

const auth = useAuthStore()
const app = useAppStore()


const getRoleText = (role) => {
  switch (role) {
    case 'admin': return 'Administrateur'
    case 'manager': return 'Gérant'
    case 'cook': return 'Cuisinier'
    default: return role
  }
}
</script>

<template>
  <div class="app-container">
    <Sidebar />

    <!-- Mobile Top Header -->
    <header class="mobile-header-bar">
      <div
        class="brand-section"
        style="display: flex; align-items: center; gap: 0.75rem;"
      >
        <img :src="logoSrc" alt="mePOS" style="height: 28px;">
        <div
          v-if="app.isOffline"
          style="display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.15rem 0.45rem; border-radius: 12px; font-size: 0.65rem; font-weight: 600; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.25); color: #ef4444;"
        >
          <span
            class="status-dot-pulse"
            style="width: 6px; height: 6px; border-radius: 50%; background: #ef4444; display: inline-block;"
          />
          <span>Hors ligne</span>
        </div>
        <div
          v-else
          style="display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.15rem 0.45rem; border-radius: 12px; font-size: 0.65rem; font-weight: 600; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.25); color: #10b981;"
        >
          <span style="width: 6px; height: 6px; border-radius: 50%; background: #10b981; display: inline-block;" />
          <span>En ligne</span>
        </div>
      </div>
      <div class="user-profile">
        <span
          :class="['user-role', `user-role-${auth.user?.role}`]"
          style="margin-right: 0.25rem;"
        >
          {{ getRoleText(auth.user?.role) }}
        </span>
        <button
          class="btn-logout"
          title="Se déconnecter"
          @click="auth.logout(); $router.push('/login')"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line
              x1="21"
              y1="12"
              x2="9"
              y2="12"
            />
          </svg>
        </button>
      </div>
    </header>

    <main class="main-content">
      <div class="page-enter">
        <router-view />
      </div>
    </main>

    <MobileNav />

    <!-- Real-time Loss Notifications -->
    <div
      v-if="app.alerts.length > 0"
      class="notification-container"
    >
      <div
        v-for="alert in app.alerts"
        :key="alert.id"
        class="notification-toast"
      >
        <div class="notification-icon">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><line
              x1="12"
              y1="9"
              x2="12"
              y2="13"
            /><line
              x1="12"
              y1="17"
              x2="12.01"
              y2="17"
            />
          </svg>
        </div>
        <div class="notification-content">
          <div class="notification-title">
            <span>⚠️ ALERTE : Perte Détectée</span>
            <span class="notification-time">
              {{ alert.timestamp?.toLocaleTimeString('fr-TN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }}
            </span>
          </div>
          <div class="notification-body">
            Une perte de <strong>{{ alert.quantity?.toFixed(2) }} {{ alert.unit }}</strong> de <strong>{{ alert.ingredientName }}</strong> a été enregistrée pour : <strong>{{ alert.departmentName }}</strong>.<br>
            <span style="font-size: 0.75rem; color: var(--text-muted);">Motif : {{ alert.reason }}</span>
          </div>
          <div
            v-if="auth.isAdmin"
            class="notification-financials"
          >
            <span style="color: var(--coral); font-weight: 600;">
              Perte Sèche : -{{ alert.costLoss?.toFixed(3) }} TND
            </span>
            <span style="color: var(--amber); font-weight: 600;">
              Manque à Gagner : -{{ alert.opportunityLoss?.toFixed(3) }} TND
            </span>
          </div>
        </div>
        <button
          class="notification-close-btn"
          title="Fermer"
          @click="app.closeAlert(alert.id)"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <line
              x1="18"
              y1="6"
              x2="6"
              y2="18"
            /><line
              x1="6"
              y1="6"
              x2="18"
              y2="18"
            />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>
