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
  saveRecipeIngredients: (recipeId, ingredients) =>
    client.post(`/recipes/${recipeId}/ingredients`, { ingredients }),
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

  // Tenants
  getTenants: () => client.get('/tenants'),
  getTenant: (id) => client.get(`/tenants/${id}`),
  getTenantStats: (id) => client.get(`/tenants/${id}/stats`),
  createTenant: (data) => client.post('/tenants', data),
  updateTenant: (id, data) => client.put(`/tenants/${id}`, data),
  deleteTenant: (id) => client.delete(`/tenants/${id}`),
  suspendTenant: (id) => client.post(`/tenants/${id}/suspend`),
  activateTenant: (id) => client.post(`/tenants/${id}/activate`),
}

export default client
