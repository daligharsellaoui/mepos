<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import { useAppStore } from '../../stores/app'
import logoSrc from '../../assets/sidelogo.png'

const route = useRoute()
const router = useRouter()
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

const navItems = [
  { path: '/', label: 'Tableau de Bord', icon: 'dashboard' },
  { path: '/inventory', label: 'Inventaire', icon: 'inventory' },
  { path: '/losses', label: 'Pertes & Gâche', icon: 'losses' },
  { path: '/forecast', label: 'Prévisions', icon: 'forecast', adminOnly: true },
  { path: '/transfers', label: 'Transfert Dépôt', icon: 'transfers' },
  { path: '/settings', label: 'Paramétrage', icon: 'settings', adminOnly: true },
  { path: '/agents', label: 'Agents Sync', icon: 'agents', adminOnly: true },
  { path: '/sync', label: 'Sync Dashboard', icon: 'sync', adminOnly: true },
  { path: '/tenant-settings', label: 'Paramètres Restaurant', icon: 'tenant', adminOnly: true },
]

const visibleItems = computed(() =>
  navItems.filter(item => !item.adminOnly || auth.user?.role === 'admin')
)

const isActive = (path) => path === '/' ? route.path === '/' : route.path === path || route.path.startsWith(path + '/')

const toggleOffline = () => {
  app.isOffline = !app.isOffline
}
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar-top">
      <div
        class="brand-section"
        style="display: flex; flex-direction: column; gap: 0.4rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border-color);"
      >
        <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
          <img :src="logoSrc" alt="mePOS" style="height: 45px;">
          <span class="brand-badge">v2.0</span>
        </div>
        <div
          style="cursor: pointer;"
          title="Double-cliquer pour simuler hors-ligne"
          @dblclick="toggleOffline"
        >
          <div
            v-if="app.isOffline"
            style="display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.25rem 0.6rem; border-radius: 12px; font-size: 0.75rem; font-weight: 600; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.25); color: #ef4444;"
          >
            <span
              class="status-dot-pulse"
              style="width: 8px; height: 8px; border-radius: 50%; background: #ef4444; display: inline-block;"
            />
            <span>Hors ligne (Local)</span>
          </div>
          <div
            v-else
            style="display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.25rem 0.6rem; border-radius: 12px; font-size: 0.75rem; font-weight: 600; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.25); color: #10b981;"
          >
            <span style="width: 8px; height: 8px; border-radius: 50%; background: #10b981; display: inline-block;" />
            <span>En ligne {{ app.isSyncing ? '· Sync...' : '' }}</span>
          </div>
        </div>
      </div>

      <nav class="nav-links">
        <router-link
          v-for="item in visibleItems"
          :key="item.path"
          :to="item.path"
          :class="['nav-btn', { active: isActive(item.path) }]"
        >
          <svg
            v-if="item.icon === 'dashboard'"
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
            <rect
              x="3"
              y="3"
              width="7"
              height="9"
            /><rect
              x="14"
              y="3"
              width="7"
              height="5"
            /><rect
              x="14"
              y="12"
              width="7"
              height="9"
            /><rect
              x="3"
              y="16"
              width="7"
              height="5"
            />
          </svg>
          <svg
            v-else-if="item.icon === 'inventory'"
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
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line
              x1="12"
              y1="22.08"
              x2="12"
              y2="12"
            />
          </svg>
          <svg
            v-else-if="item.icon === 'losses'"
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
          <svg
            v-else-if="item.icon === 'transfers'"
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
            <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
          </svg>
          <svg
            v-else-if="item.icon === 'agents'"
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
            <rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
          </svg>
          <svg
            v-else-if="item.icon === 'forecast'"
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
            <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
          <svg
            v-else-if="item.icon === 'sync'"
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
            <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          <svg
            v-else-if="item.icon === 'tenant'"
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
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          <svg
            v-else-if="item.icon === 'settings'"
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
            <circle
              cx="12"
              cy="12"
              r="3"
            /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          <span>{{ item.label }}</span>
        </router-link>
      </nav>
    </div>

    <div class="sidebar-footer">
      <div class="user-profile">
        <div class="user-badge">
          <span class="user-name">{{ auth.user?.first_name }}</span>
          <span :class="['user-role', `user-role-${auth.user?.role}`]">{{ getRoleText(auth.user?.role) }}</span>
        </div>
        <button
          class="btn-logout"
          title="Se déconnecter"
          @click="auth.logout(); router.push('/login')"
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
    </div>
  </aside>
</template>
