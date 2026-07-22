import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'Landing',
    component: () => import('../views/LandingPage.vue')
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/LoginPage.vue')
  },
  {
    path: '/app',
    component: () => import('../layouts/AppShell.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'Dashboard',
        component: () => import('../views/DashboardView.vue')
      },
      {
        path: 'suppliers',
        name: 'Suppliers',
        component: () => import('../views/SuppliersView.vue'),
        meta: { requiresAuth: true }
      },
      {
        path: 'suppliers/:id',
        name: 'SupplierDetails',
        component: () => import('../views/SupplierDetailsView.vue'),
        meta: { requiresAuth: true }
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
      },
      {
        path: 'recipes',
        name: 'Recipes',
        component: () => import('../views/RecipesView.vue'),
        meta: { cookOnly: true }
      },
      {
        path: 'notifications',
        name: 'NotificationCenter',
        component: () => import('../views/NotificationCenter.vue')
      },
      {
        path: 'notifications/preferences',
        name: 'NotificationPreferences',
        component: () => import('../views/NotificationPreferences.vue')
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
    next('/app')
  } else if (to.meta.requiresAdmin && user?.role !== 'admin') {
    next('/app')
  } else if (to.meta.cookOnly && user?.role !== 'cook') {
    next('/app')
  } else {
    next()
  }
})

export default router
