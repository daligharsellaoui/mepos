<script setup>
import { ref, onMounted, onUnmounted, inject } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useAppStore } from '../stores/app'
import { useNotificationStore } from '../stores/notifications'
import Sidebar from '../components/layout/Sidebar.vue'
import MobileNav from '../components/layout/MobileNav.vue'
import NotificationBell from '../components/notifications/NotificationBell.vue'
import NotificationDropdown from '../components/notifications/NotificationDropdown.vue'
import logoSrc from '../assets/sidelogo.png'

const auth = useAuthStore()
const app = useAppStore()
const notifStore = useNotificationStore()

const showDropdown = ref(false)
const addToast = inject('addToast')

let pollInterval = null

onMounted(() => {
  notifStore.fetchUnreadCount()
  notifStore.connectSSE()

  pollInterval = setInterval(() => {
    notifStore.fetchUnreadCount()
  }, 15000)

  if (auth.isLoggedIn) {
    app.setupNetworkListeners()
    app.fetchData(auth.user)
  }

  notifStore.registerPush()
})

onUnmounted(() => {
  if (pollInterval) clearInterval(pollInterval)
  notifStore.disconnectSSE()
  notifStore.unregisterPush()
})

const getRoleText = (role) => {
  switch (role) {
    case 'admin': return 'Administrateur'
    case 'manager': return 'Gérant'
    case 'cook': return 'Cuisinier'
    default: return role
  }
}

function toggleDropdown() {
  showDropdown.value = !showDropdown.value
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
        <img :src="logoSrc" alt="mePOS" style="height: 24px;">
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
      <div style="display: flex; align-items: center; gap: 0.5rem;">
        <NotificationBell @click="toggleDropdown" />
        <div class="user-profile">
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
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </div>
    </header>

    <!-- Desktop Top Bar -->
    <div class="desktop-topbar">
      <div class="topbar-left">
        <div
          v-if="app.isOffline"
          class="topbar-status topbar-status-offline"
        >
          <span class="status-dot-pulse" style="width: 6px; height: 6px; border-radius: 50%; background: #ef4444; display: inline-block;" />
          <span>Hors ligne</span>
        </div>
        <div
          v-else
          class="topbar-status topbar-status-online"
        >
          <span style="width: 6px; height: 6px; border-radius: 50%; background: #10b981; display: inline-block;" />
          <span>En ligne</span>
        </div>
      </div>
      <div class="topbar-right">
        <NotificationBell @click="toggleDropdown" />
      </div>
    </div>

    <main class="main-content">
      <div class="page-enter">
        <router-view />
      </div>
    </main>

    <MobileNav />

    <!-- Notification Dropdown (shared, teleported to body) -->
    <NotificationDropdown v-if="showDropdown" @close="showDropdown = false" />

    <!-- Toast loss alerts (kept for backward compatibility) -->
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
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>
        <div class="notification-content">
          <div class="notification-title">
            <span>&#9888;&#65039; ALERTE : Perte Détectée</span>
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
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
@media (min-width: 901px) {
  .mobile-header-bar {
    display: none !important;
  }
}

/* Desktop Top Bar */
.desktop-topbar {
  display: none;
}
@media (min-width: 901px) {
  .desktop-topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: fixed;
    top: 0;
    left: 260px;
    right: 0;
    height: 56px;
    padding: 0 1.5rem;
    background: var(--bg-sidebar);
    border-bottom: 1px solid var(--border-color);
    z-index: 5;
  }
}
.topbar-left {
  display: flex;
  align-items: center;
  gap: 1rem;
}
.topbar-right {
  display: flex;
  align-items: center;
  gap: 1rem;
}
.topbar-status {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.15rem 0.5rem;
  border-radius: 12px;
  font-size: 0.7rem;
  font-weight: 600;
}
.topbar-status-offline {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.25);
  color: #ef4444;
}
.topbar-status-online {
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.25);
  color: #10b981;
}
</style>
