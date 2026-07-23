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
  { path: '/app', label: 'Tableau de Bord', icon: 'dashboard' },
  { path: '/app/notifications', label: 'Notifications', icon: 'notifications' },
  { path: '/app/journal', label: 'Journal d\'Activité', icon: 'journal', adminOnly: true },
  { path: '/app/inventory', label: 'Inventaire', icon: 'inventory' },
  { path: '/app/suppliers', label: 'Fournisseurs', icon: 'suppliers', notForCook: true },
  { path: '/app/recipes', label: 'Recettes', icon: 'recipes', cookOnly: true },
  { path: '/app/losses', label: 'Pertes & Gâche', icon: 'losses' },
  { path: '/app/forecast', label: 'Prévisions', icon: 'forecast', adminOnly: true },
  { path: '/app/transfers', label: 'Transfert Dépôt', icon: 'transfers' },
  { path: '/app/purchases', label: 'Achats', icon: 'purchases', notForCook: true },
  //{ path: '/app/batches', label: 'Gestion des Lots', icon: 'batches' },
  //{ path: '/app/inventory-counts', label: 'Inventaire Physique', icon: 'counts', notForCook: true },
  { path: '/app/settings', label: 'Paramétrage', icon: 'settings', adminOnly: true },
  { path: '/app/agents', label: 'Agents Sync', icon: 'agents', adminOnly: true },
  { path: '/app/mappings', label: 'Mappings', icon: 'mappings', adminOnly: true },
  { path: '/app/sync', label: 'Sync Dashboard', icon: 'sync', adminOnly: true },
  { path: '/app/tenant-settings', label: 'Paramètres Restaurant', icon: 'tenant', adminOnly: true },
]

const visibleItems = computed(() =>
  navItems.filter(item => {
    if (item.adminOnly) return auth.user?.role === 'admin'
    if (item.cookOnly) return auth.user?.role === 'cook'
    if (item.notForCook) return auth.user?.role !== 'cook'
    return true
  })
)

const isActive = (path) => {
  if (path === '/app') return route.path === '/app'
  return route.path === path || route.path.startsWith(path + '/')
}

const handleLogout = async () => {
  await auth.logout()
  window.location.href = '/login'
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
            v-else-if="item.icon === 'notifications'"
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
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
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
            v-else-if="item.icon === 'suppliers'"
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
            <rect x="1" y="3" width="15" height="13" rx="2" />
            <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
            <circle cx="5.5" cy="18.5" r="2.5" />
            <circle cx="18.5" cy="18.5" r="2.5" />
          </svg>
          <svg
            v-else-if="item.icon === 'recipes'"
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
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
          </svg>
          <svg
            v-else-if="item.icon === 'journal'"
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
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
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
            v-else-if="item.icon === 'purchases'"
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
            <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" />
          </svg>
          <svg
            v-else-if="item.icon === 'batches'"
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
            v-else-if="item.icon === 'counts'"
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
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
          </svg>
          <svg
            v-else-if="item.icon === 'mappings'"
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
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" />
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
          @click="handleLogout"
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
