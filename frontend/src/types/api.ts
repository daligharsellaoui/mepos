// ======================================================
// API Response Types
// ======================================================

export interface ApiResponse<T> {
  status: 'success' | 'error';
  data?: T;
  message?: string;
}

export interface User {
  id: number;
  username: string;
  role: 'admin' | 'manager' | 'cook';
  first_name: string;
  last_name: string;
}

export interface Department {
  id: number;
  name: string;
  stock_type: 'isolated' | 'inherited';
  description?: string;
}

export interface Ingredient {
  id: number;
  name: string;
  unit: string;
  purchase_price_per_unit: number;
  alert_threshold: number;
  purchase_unit: string;
  purchase_unit_price: number;
  conversion_factor: number;
}

export interface InventoryStock {
  id: number;
  department_id: number;
  ingredient_id: number;
  quantity: number;
  ingredient_name: string;
  unit: string;
  purchase_price_per_unit: number;
  alert_threshold: number;
  purchase_unit: string;
  conversion_factor: number;
  department_name: string;
  stock_type: string;
}

export interface Recipe {
  id: number;
  name: string;
  sale_price: number;
  is_active: boolean;
  ingredients?: RecipeIngredient[];
}

export interface RecipeIngredient {
  ingredient_id: number;
  name: string;
  quantity_needed: number;
  unit: string;
}

export interface SalesTicket {
  id: number;
  external_ticket_id: string;
  department_id: number;
  ticket_date: string;
  total_amount: number;
}

export interface IngredientLoss {
  id: number;
  department_id: number;
  ingredient_id: number;
  quantity: number;
  loss_reason: string;
  cost_loss: number;
  opportunity_loss: number;
  reported_by: number | null;
  created_at: string;
  ingredient_name: string;
  unit: string;
  department_name: string;
  reported_by_username: string;
}

export interface TransferRequest {
  id: number;
  source_department_id: number;
  destination_department_id: number;
  ingredient_id: number;
  quantity: number;
  status: 'pending' | 'approved' | 'rejected';
  requested_by: number | null;
  validated_by: number | null;
  created_at: string;
  ingredient_name: string;
  ingredient_unit: string;
  source_department_name: string;
  destination_department_name: string;
  requested_by_username: string;
  validated_by_username: string | null;
}

export interface StockMovement {
  id: number;
  department_id: number;
  ingredient_id: number;
  quantity: number;
  type: string;
  reference_id: string;
  created_at: string;
  ingredient_name: string;
  unit: string;
  department_name: string;
}

export interface SalesStats {
  total_revenue: number;
  total_items_sold: number;
  items: {
    recipe_id: number;
    recipe_name: string;
    quantity: number;
    unit_price: number;
    total_revenue: number;
  }[];
}

export interface SalesHistory {
  date: string;
  revenue: number;
}

export interface LossAlert {
  id: number;
  ingredientName: string;
  quantity: number;
  unit: string;
  departmentName: string;
  reason: string;
  costLoss: number;
  opportunityLoss: number;
  timestamp: Date;
}

export interface IngredientForecast {
  ingredient_id: number;
  ingredient_name: string;
  unit: string;
  current_stock: number;
  avg_daily_usage: number;
  days_until_depletion: number | null;
  reorder_quantity: number;
  alert_threshold: number;
  is_critical: boolean;
  department_id: number;
  department_name: string;
}

export interface RecipeForecast {
  recipe_id: number;
  recipe_name: string;
  sale_price: number;
  avg_daily_quantity: number;
  avg_daily_revenue: number;
  total_7day_quantity: number;
  total_7day_revenue: number;
}

export interface ForecastSummary {
  total_recipes_analyzed: number;
  total_ingredients_analyzed: number;
  critical_ingredients: number;
  total_reorder_cost: number;
  estimated_daily_revenue: number;
}

export interface ForecastData {
  generated_at: string;
  days_analyzed: number;
  recipes: RecipeForecast[];
  ingredients: IngredientForecast[];
  summary: ForecastSummary;
}

export type TabRoute = 'dashboard' | 'inventory' | 'losses' | 'transfers' | 'settings';
