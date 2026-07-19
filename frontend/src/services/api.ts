// ======================================================
// API Service — Centralized fetch wrapper with JWT auth
// ======================================================

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';

/** Get auth headers from stored token */
function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem('mepos_token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/** Generic fetch wrapper */
async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<{ status: string; data?: T; message?: string; [key: string]: any }> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...getAuthHeaders(), ...(options.headers || {}) },
  });
  return response.json();
}

/** GET request */
export function get<T>(path: string, params?: Record<string, string>) {
  const query = params ? '?' + new URLSearchParams(params).toString() : '';
  return request<T>(`${path}${query}`);
}

/** POST request */
export function post<T>(path: string, body?: any) {
  return request<T>(path, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
}

/** PUT request */
export function put<T>(path: string, body?: any) {
  return request<T>(path, {
    method: 'PUT',
    body: body ? JSON.stringify(body) : undefined,
  });
}

/** DELETE request */
export function del<T>(path: string) {
  return request<T>(path, { method: 'DELETE' });
}

// ======================================================
// Typed API Endpoints
// ======================================================

import type {
  InventoryStock, Ingredient, Department, Recipe, IngredientLoss,
  TransferRequest, StockMovement, SalesStats, SalesHistory, User
} from '../types/api';

export const api = {
  // Auth
  login: (username: string, password: string) =>
    post<{ user: User; token: string }>('/auth/login', { username, password }),

  getUsers: () => get<User[]>('/auth/users'),

  // Inventory
  getStocks: () => get<InventoryStock[]>('/stocks'),
  getDepartments: () => get<Department[]>('/departments'),
  getIngredients: () => get<Ingredient[]>('/ingredients'),
  getRecipes: () => get<Recipe[]>('/recipes'),
  getMovements: () => get<StockMovement[]>('/movements'),

  createIngredient: (data: any) => post('/ingredients', data),
  createRecipe: (data: any) => post('/recipes', data),
  saveRecipeIngredients: (recipeId: number, ingredients: any[]) =>
    post(`/recipes/${recipeId}/ingredients`, { ingredients }),

  adjustStock: (data: any) => post('/inventory/adjust', data),

  // Losses
  getLosses: () => get<IngredientLoss[]>('/losses'),
  createLoss: (data: any) => post('/losses', data),

  // Sales
  syncSales: (data: any) => post('/sales/sync', data),
  getSalesStats: (params: Record<string, string>) =>
    get<SalesStats>('/sales/stats', params),
  getSalesHistory: () => get<SalesHistory[]>('/sales/history'),

  // Transfers
  transferStock: (data: any) => post('/transfers', data),
  getTransferRequests: () => get<TransferRequest[]>('/transfers/requests'),
  createTransferRequest: (data: any) => post('/transfers/requests', data),
  approveTransferRequest: (id: number, validatedBy: number) =>
    post(`/transfers/requests/${id}/validate`, { validated_by: validatedBy }),
  rejectTransferRequest: (id: number, validatedBy: number) =>
    post(`/transfers/requests/${id}/reject`, { validated_by: validatedBy }),
};
