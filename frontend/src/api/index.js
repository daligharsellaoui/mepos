import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_URL || '/api/v1'

const client = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' }
})

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('mepos_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('mepos_token')
      localStorage.removeItem('mepos_user')
      import('../router/index.js').then(({ default: router }) => {
        router.push('/login')
      }).catch(() => {
        window.location.href = '/login'
      })
    }
    return Promise.reject(error)
  }
)

export const api = {
  // Auth
  login: (username, password) => client.post('/auth/login', { username, password }),
  logout: () => client.post('/auth/logout'),
  getUsers: () => client.get('/auth/users'),
  createUser: (data) => client.post('/auth/users', data),
  updateUser: (id, data) => client.put(`/auth/users/${id}`, data),
  deleteUser: (id) => client.delete(`/auth/users/${id}`),

  // Inventory
  getStocks: () => client.get('/stocks'),
  getDepartments: () => client.get('/departments'),
  createDepartment: (data) => client.post('/departments', data),
  updateDepartment: (id, data) => client.put(`/departments/${id}`, data),
  deleteDepartment: (id, params) => client.delete(`/departments/${id}`, { params }),
  getIngredients: () => client.get('/ingredients'),
  createIngredient: (data) => client.post('/ingredients', data),
  updateIngredient: (id, data) => client.put(`/ingredients/${id}`, data),
  deleteIngredient: (id) => client.delete(`/ingredients/${id}`),
  getRecipes: (params) => client.get('/recipes', { params }),
  createRecipe: (data) => client.post('/recipes', data),
  updateRecipe: (id, data) => client.put(`/recipes/${id}`, data),
  deleteRecipe: (id) => client.delete(`/recipes/${id}`),
  saveRecipeIngredients: (recipeId, ingredients) =>
    client.post(`/recipes/${recipeId}/ingredients`, { ingredients }),
  getRecipeIngredients: (id) => client.get(`/recipes/${id}/ingredients`),
  getMovements: (params) => client.get('/movements', { params }),
  adjustStock: (data) => client.post('/inventory/adjust', data),

  // Losses
  getLosses: () => client.get('/losses'),
  createLoss: (data) => client.post('/losses', data),

  // Sales
  getSalesStats: (params) => client.get('/sales/stats', { params }),
  getSalesHistory: () => client.get('/sales/history'),

  // Transfers
  getTransfers: () => client.get('/transfers'),
  transferStock: (data) => client.post('/transfers', data),
  getTransferRequests: () => client.get('/transfers/requests'),
  createTransferRequest: (data) => client.post('/transfers/requests', data),
  approveTransferRequest: (id, validatedBy) =>
    client.post(`/transfers/requests/${id}/validate`, { validated_by: validatedBy }),
  rejectTransferRequest: (id, validatedBy) =>
    client.post(`/transfers/requests/${id}/reject`, { validated_by: validatedBy }),

  // Forecast
  getForecast: () => client.get('/forecast'),

  // Agents
  getAgents: () => client.get('/agents'),
  getAgent: (id) => client.get(`/agents/${id}`),
  createAgent: (data) => client.post('/agents', data),
  updateAgent: (id, data) => client.put(`/agents/${id}`, data),
  deleteAgent: (id) => client.delete(`/agents/${id}`),
  enableAgent: (id) => client.post(`/agents/${id}/enable`),
  disableAgent: (id) => client.post(`/agents/${id}/disable`),
  rotateAgentSecret: (id) => client.post(`/agents/${id}/rotate-secret`),
  getAgentHeartbeats: (id, limit) => client.get(`/agents/${id}/heartbeats`, { params: { limit } }),
  getAgentSyncStatus: (id) => client.get(`/agents/${id}/sync-status`),
  updateAgentConfig: (id, config) => client.put(`/agents/${id}/config`, config),

  // Tenant Settings
  getSettings: () => client.get('/settings'),
  getSettingsByCategory: (category) => client.get(`/settings/${category}`),
  getSetting: (category, key) => client.get(`/settings/${category}/${key}`),
  updateSettings: (category, settings, encryptKeys) =>
    client.put(`/settings/${category}`, { settings, encrypt_keys: encryptKeys }),
  updateSetting: (category, key, value, encrypt) =>
    client.put(`/settings/${category}/${key}`, { value, encrypt }),
  deleteSetting: (category, key) => client.delete(`/settings/${category}/${key}`),

  // Notifications
  getNotifications: (params) => client.get('/notifications', { params }),
  getUnreadCount: () => client.get('/notifications/unread-count'),
  markAsRead: (id) => client.put(`/notifications/${id}/read`),
  markAllAsRead: () => client.put('/notifications/read-all'),
  archiveNotification: (id) => client.put(`/notifications/${id}/archive`),
  deleteNotification: (id) => client.delete(`/notifications/${id}`),
  getNotificationPreferences: () => client.get('/notifications/preferences'),
  setNotificationPreference: (category, data) => client.put(`/notifications/preferences/${category}`, data),

  // Tenants
  getTenants: () => client.get('/tenants'),
  getTenant: (id) => client.get(`/tenants/${id}`),
  getTenantStats: (id) => client.get(`/tenants/${id}/stats`),
  createTenant: (data) => client.post('/tenants', data),
  updateTenant: (id, data) => client.put(`/tenants/${id}`, data),
  deleteTenant: (id) => client.delete(`/tenants/${id}`),
  suspendTenant: (id) => client.post(`/tenants/${id}/suspend`),
  activateTenant: (id) => client.post(`/tenants/${id}/activate`),
  // Suppliers
  getSuppliers: (params) => client.get('/suppliers', { params }),
  getSupplier: (id) => client.get(`/suppliers/${id}`),
  createSupplier: (data) => client.post('/suppliers', data),
  updateSupplier: (id, data) => client.put(`/suppliers/${id}`, data),
  archiveSupplier: (id) => client.post(`/suppliers/${id}/archive`),
  restoreSupplier: (id) => client.post(`/suppliers/${id}/restore`),
  deleteSupplier: (id) => client.delete(`/suppliers/${id}`),
  getSupplierIngredients: (id) => client.get(`/suppliers/${id}/ingredients`),
  getSupplierScore: (id) => client.get(`/suppliers/${id}/score`),

  getVapidPublicKey: () => client.get('/push/vapid-public-key'),
  pushSubscribe: (sub) => client.post('/push/subscribe', sub),
  pushUnsubscribe: (endpoint) => client.delete('/push/unsubscribe', { data: { endpoint } }),

  // Import (CSV Product Import)
  downloadCsvTemplate: () => client.get('/import/products/csv-template', { responseType: 'blob' }),
  validateCsv: (file) => {
    const fd = new FormData()
    fd.append('file', file)
    return client.post('/import/products/validate', fd, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
  executeImport: (data) => client.post('/import/products/execute', data),

  // Mappings (POS Product Mapping)
  getMappings: (params) => client.get('/mappings', { params }),
  getMapping: (id) => client.get(`/mappings/${id}`),
  createMapping: (data) => client.post('/mappings', data),
  updateMapping: (id, data) => client.put(`/mappings/${id}`, data),
  deleteMapping: (id) => client.delete(`/mappings/${id}`),
  bulkMapMappings: (data) => client.post('/mappings/bulk', data),
  autoMatchMappings: (data) => client.post('/mappings/auto-match', data),
  getUnmappedProducts: (params) => client.get('/mappings/unmapped', { params }),
  getMappingStats: () => client.get('/mappings/stats'),
  validateMappings: () => client.get('/mappings/validate'),
  importPosProducts: (data) => client.post('/mappings/import-pos', data),

  // Activity Journal
  getJournalEntries: (params) => client.get('/journal', { params }),
  getJournalEntry: (id) => client.get(`/journal/${id}`),
  getJournalEventTypes: () => client.get('/journal/event-types'),
  getSaleExpansion: (ticketId) => client.get(`/journal/sale/${ticketId}/expansion`),
  exportJournal: (params) => client.get('/journal/export', { params, responseType: 'blob' }),

  // Purchase Orders
  getPurchaseOrders: (params) => client.get('/purchases', { params }),
  getPurchaseOrder: (id) => client.get(`/purchases/${id}`),
  createPurchaseOrder: (data) => client.post('/purchases', data),
  updatePurchaseOrder: (id, data) => client.put(`/purchases/${id}`, data),
  submitPurchaseOrder: (id) => client.post(`/purchases/${id}/submit`),
  approvePurchaseOrder: (id) => client.post(`/purchases/${id}/approve`),
  rejectPurchaseOrder: (id) => client.post(`/purchases/${id}/reject`),
  cancelPurchaseOrder: (id) => client.post(`/purchases/${id}/cancel`),
  closePurchaseOrder: (id) => client.post(`/purchases/${id}/close`),
  deletePurchaseOrder: (id) => client.delete(`/purchases/${id}`),

  // Goods Receptions
  getReceptions: (params) => client.get('/receptions', { params }),
  getReception: (id) => client.get(`/receptions/${id}`),
  createReception: (data) => client.post('/receptions', data),

  // Batches
  getBatches: (params) => client.get('/batches', { params }),
  getBatch: (id) => client.get(`/batches/${id}`),
  getBatchMovements: (id) => client.get(`/batches/${id}/movements`),
  getExpiringBatches: () => client.get('/batches/expiring'),
  consumeBatch: (id, quantity) => client.post(`/batches/${id}/consume`, { quantity }),
  transferBatch: (id, data) => client.post(`/batches/${id}/transfer`, data),
  splitBatch: (id, quantity) => client.post(`/batches/${id}/split`, { quantity }),
  adjustBatch: (id, data) => client.post(`/batches/${id}/adjust`, data),
  discardBatch: (id, reason) => client.post(`/batches/${id}/discard`, { reason }),
  expireBatches: () => client.post('/batches/expire-now'),

  // Inventory Counts
  getInventoryCounts: (params) => client.get('/inventory-counts', { params }),
  getInventoryCount: (id) => client.get(`/inventory-counts/${id}`),
  getCountDiscrepancies: (id) => client.get(`/inventory-counts/${id}/discrepancies`),
  createInventoryCount: (data) => client.post('/inventory-counts', data),
  updateCountItem: (itemId, data) => client.put(`/inventory-counts/items/${itemId}`, data),
  startInventoryCount: (id) => client.post(`/inventory-counts/${id}/start`),
  completeInventoryCount: (id) => client.post(`/inventory-counts/${id}/complete`),
  approveInventoryCount: (id) => client.post(`/inventory-counts/${id}/approve`),
  cancelInventoryCount: (id) => client.post(`/inventory-counts/${id}/cancel`),

  // Price History
  getPriceHistory: (ingredientId, params) => client.get(`/price-history/ingredients/${ingredientId}/history`, { params }),
  getPriceAnalytics: (ingredientId) => client.get(`/price-history/ingredients/${ingredientId}/analytics`),
  recordPrice: (ingredientId, data) => client.post(`/price-history/ingredients/${ingredientId}/record`, data),
  getSupplierPriceComparison: (supplierId) => client.get(`/price-history/suppliers/${supplierId}/comparison`),
  getSupplierIngredients: (supplierId) => client.get(`/price-history/suppliers/${supplierId}/ingredients`),
  linkSupplierIngredient: (data) => client.post('/price-history/supplier-ingredients', data),
  unlinkSupplierIngredient: (data) => client.delete('/price-history/supplier-ingredients', { data }),
}

export default client
