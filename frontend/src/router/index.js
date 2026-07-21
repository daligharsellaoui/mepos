import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/LoginPage.vue')
  },
  {
    path: '/',
    component: () => import('../layouts/AppShell.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'Dashboard',
        component: () => import('../views/DashboardView.vue')
      },
      {
        path: 'inventory',
        name: 'Inventory',
        component: () => import('../views/InventoryView.vue')
      },
      {
        path: 'losses',
        name: 'Losses',
        component: () => import('../views/LossTrackerView.vue')
      },
      {
        path: 'transfers',
        name: 'Transfers',
        component: () => import('../views/StockTransferView.vue')
      },
      {
        path: 'settings',
        name: 'Settings',
        component: () => import('../views/SettingsView.vue'),
        meta: { requiresAdmin: true }
      },
      {
        path: 'tenant-settings',
        name: 'TenantSettings',
        component: () => import('../views/TenantSettings.vue'),
        meta: { requiresAdmin: true }
      },
      {
        path: 'agents',
        name: 'Agents',
        component: () => import('../views/AgentManagement.vue'),
        meta: { requiresAdmin: true }
      },
      {
        path: 'forecast',
        name: 'Forecast',
        component: () => import('../views/ForecastView.vue'),
        meta: { requiresAdmin: true }
      },
      {
        path: 'sync',
        name: 'SyncDashboard',
        component: () => import('../views/SyncDashboard.vue'),
        meta: { requiresAdmin: true }
      }
    ]
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// Navigation guard: auth check
router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('mepos_token')
  const user = JSON.parse(localStorage.getItem('mepos_user') || 'null')

  if (to.meta.requiresAuth && !token) {
    next('/login')
  } else if (to.path === '/login' && token) {
    next('/')
  } else if (to.meta.requiresAdmin && user?.role !== 'admin') {
    next('/')
  } else {
    next()
  }
})

export default router
