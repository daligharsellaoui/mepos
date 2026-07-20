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
      // Use Vue Router instead of window.location.href to avoid full page reload
      // Import router lazily to avoid circular dependency
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
  getRecipes: () => client.get('/recipes'),
  createRecipe: (data) => client.post('/recipes', data),
  saveRecipeIngredients: (recipeId, ingredients) =>
    client.post(`/recipes/${recipeId}/ingredients`, { ingredients }),
  getMovements: () => client.get('/movements'),
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
  getForecast: () => client.get('/forecast')
}

export default client
