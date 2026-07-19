import { Decimal } from 'decimal.js';
import { query, isDemoMode, demoDb } from '../database';

// ──────────────────────────────────────────────
// TYPES
// ──────────────────────────────────────────────

export interface IngredientForecast {
  ingredient_id: number;
  ingredient_name: string;
  unit: string;
  current_stock: number;
  avg_daily_usage: number;
  days_until_depletion: number | null;  // null if no usage data
  reorder_quantity: number;             // suggested purchase qty to reach 7-day stock
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

export interface ForecastResponse {
  generated_at: string;
  days_analyzed: number;
  recipes: RecipeForecast[];
  ingredients: IngredientForecast[];
  summary: {
    total_recipes_analyzed: number;
    total_ingredients_analyzed: number;
    critical_ingredients: number;
    total_reorder_cost: number;
    estimated_daily_revenue: number;
  };
}

// ──────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────

function getTodayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function get7DaysAgoStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().split('T')[0];
}

// ──────────────────────────────────────────────
// RECIPE FORECAST (7-day moving average per recipe)
// ──────────────────────────────────────────────

async function computeRecipeForecasts(daysAnalyzed: number): Promise<RecipeForecast[]> {
  const recipeMap: Map<number, {
    name: string;
    sale_price: number;
    total_quantity: number;
    total_revenue: number;
  }> = new Map();

  const startDate = get7DaysAgoStr();
  const endDate = getTodayStr();

  if (isDemoMode) {
    // Get tickets within date range
    const filteredTickets = demoDb.sales_tickets.filter((t: any) => {
      const ticketDate = new Date(t.ticket_date).toISOString().split('T')[0];
      return ticketDate >= startDate && ticketDate <= endDate;
    });

    const ticketIds = new Set(filteredTickets.map((t: any) => t.id));

    for (const item of demoDb.sales_ticket_items) {
      if (!ticketIds.has(item.sales_ticket_id)) continue;

      const recipe = demoDb.recipes.find((r: any) => r.id === item.recipe_id);
      if (!recipe) continue;

      const existing = recipeMap.get(recipe.id);
      const qty = parseFloat(item.quantity);
      const revenue = qty * parseFloat(item.unit_price);

      if (existing) {
        existing.total_quantity += qty;
        existing.total_revenue += revenue;
      } else {
        recipeMap.set(recipe.id, {
          name: recipe.name,
          sale_price: parseFloat(recipe.sale_price),
          total_quantity: qty,
          total_revenue: revenue,
        });
      }
    }
  } else {
    // PG mode: aggregate sales from last 7 days
    const result = await query(`
      SELECT 
        r.id as recipe_id,
        r.name as recipe_name,
        r.sale_price,
        COALESCE(SUM(si.quantity), 0) as total_quantity,
        COALESCE(SUM(si.quantity * si.unit_price), 0) as total_revenue
      FROM sales_tickets t
      JOIN sales_ticket_items si ON t.id = si.sales_ticket_id
      JOIN recipes r ON si.recipe_id = r.id
      WHERE t.ticket_date >= $1::date AND t.ticket_date <= $2::date
        AND t.deleted_at IS NULL
      GROUP BY r.id, r.name, r.sale_price
    `, [startDate, endDate]);

    for (const row of result.rows) {
      recipeMap.set(row.recipe_id, {
        name: row.recipe_name,
        sale_price: parseFloat(row.sale_price),
        total_quantity: parseFloat(row.total_quantity),
        total_revenue: parseFloat(row.total_revenue),
      });
    }
  }

  // Convert to array with daily averages
  const recipes: RecipeForecast[] = [];
  for (const [recipeId, data] of recipeMap) {
    recipes.push({
      recipe_id: recipeId,
      recipe_name: data.name,
      sale_price: data.sale_price,
      total_7day_quantity: data.total_quantity,
      total_7day_revenue: data.total_revenue,
      avg_daily_quantity: data.total_quantity / daysAnalyzed,
      avg_daily_revenue: data.total_revenue / daysAnalyzed,
    });
  }

  // Sort by avg_daily_revenue descending
  recipes.sort((a, b) => b.avg_daily_revenue - a.avg_daily_revenue);
  return recipes;
}

// ──────────────────────────────────────────────
// INGREDIENT FORECAST (depletion & reorder)
// ──────────────────────────────────────────────

async function computeIngredientForecasts(
  recipes: RecipeForecast[],
  daysAnalyzed: number
): Promise<IngredientForecast[]> {
  // Map ingredient_id → total daily usage from recipes
  const usageMap: Map<number, Decimal> = new Map();

  if (isDemoMode) {
    for (const recipe of recipes) {
      const recipeIngs = demoDb.recipe_ingredients.filter(
        (ri: any) => ri.recipe_id === recipe.recipe_id
      );

      for (const ri of recipeIngs) {
        const dailyUsage = new Decimal(ri.quantity_needed).times(recipe.avg_daily_quantity);
        const existing = usageMap.get(ri.ingredient_id) || new Decimal(0);
        usageMap.set(ri.ingredient_id, existing.plus(dailyUsage));
      }
    }
  } else {
    for (const recipe of recipes) {
      const result = await query(
        'SELECT ingredient_id, quantity_needed FROM recipe_ingredients WHERE recipe_id = $1',
        [recipe.recipe_id]
      );

      for (const row of result.rows) {
        const dailyUsage = new Decimal(row.quantity_needed).times(recipe.avg_daily_quantity);
        const existing = usageMap.get(row.ingredient_id) || new Decimal(0);
        usageMap.set(row.ingredient_id, existing.plus(dailyUsage));
      }
    }
  }

  // Combine with current stock levels
  const ingredients: IngredientForecast[] = [];
  const allDepts = isDemoMode
    ? demoDb.departments
    : (await query('SELECT id, name FROM departments')).rows;

  for (const dept of allDepts) {
    let deptStocks: any[];

    if (isDemoMode) {
      deptStocks = demoDb.inventory_stocks.filter(
        (s: any) => s.department_id === dept.id
      );
    } else {
      const result = await query(`
        SELECT is_t.*, i.name as ingredient_name, i.unit, i.alert_threshold
        FROM inventory_stocks is_t
        JOIN ingredients i ON is_t.ingredient_id = i.id
        WHERE is_t.department_id = $1
        ORDER BY i.name
      `, [dept.id]);
      deptStocks = result.rows;
    }

    for (const stock of deptStocks) {
      const ingId = stock.ingredient_id;
      const currentQty = parseFloat(stock.quantity);
      const avgDailyUsage = usageMap.get(ingId);
      const dailyUsageNum = avgDailyUsage ? avgDailyUsage.toNumber() : 0;
      const alertThreshold = parseFloat(stock.alert_threshold || 0);

      // Days until depletion
      let daysUntilDepletion: number | null = null;
      if (dailyUsageNum > 0) {
        daysUntilDepletion = Math.floor(currentQty / dailyUsageNum);
      }

      // Reorder quantity: enough for 7 days at current usage
      const reorderQuantity = dailyUsageNum > 0
        ? Math.max(0, (dailyUsageNum * 7) - currentQty)
        : 0;

      const isCritical = currentQty <= alertThreshold || (daysUntilDepletion !== null && daysUntilDepletion <= 3);

      ingredients.push({
        ingredient_id: ingId,
        ingredient_name: stock.ingredient_name || stock.name || `Ingrédient #${ingId}`,
        unit: stock.unit || '',
        current_stock: currentQty,
        avg_daily_usage: dailyUsageNum,
        days_until_depletion: daysUntilDepletion,
        reorder_quantity: Math.ceil(reorderQuantity * 100) / 100,
        alert_threshold: alertThreshold,
        is_critical: isCritical,
        department_id: dept.id,
        department_name: dept.name,
      });
    }
  }

  // Sort: critical first, then by depletion urgency
  ingredients.sort((a, b) => {
    if (a.is_critical !== b.is_critical) return a.is_critical ? -1 : 1;
    if (a.days_until_depletion !== null && b.days_until_depletion !== null) {
      return a.days_until_depletion - b.days_until_depletion;
    }
    if (a.days_until_depletion === null) return 1;
    if (b.days_until_depletion === null) return -1;
    return 0;
  });

  return ingredients;
}

// ──────────────────────────────────────────────
// MAIN FORECAST ENTRY POINT
// ──────────────────────────────────────────────

export async function getForecast(): Promise<ForecastResponse> {
  const daysAnalyzed = 7;
  const generatedAt = new Date().toISOString();

  // 1. Recipe-level forecast (7-day moving average)
  const recipes = await computeRecipeForecasts(daysAnalyzed);

  // 2. Ingredient-level forecast (depletion + reorder)
  const ingredients = await computeIngredientForecasts(recipes, daysAnalyzed);

  // 3. Summary
  const criticalIngredients = ingredients.filter(i => i.is_critical);

  // Batch-load ingredient prices to avoid O(N) queries
  const priceMap = new Map<number, Decimal>();
  if (isDemoMode) {
    for (const ing of demoDb.ingredients) {
      priceMap.set(ing.id, new Decimal(ing.purchase_price_per_unit));
    }
  } else {
    const priceRes = await query('SELECT id, purchase_price_per_unit FROM ingredients');
    for (const row of priceRes.rows) {
      priceMap.set(row.id, new Decimal(row.purchase_price_per_unit));
    }
  }

  let totalReorderCost = new Decimal(0);
  for (const ing of ingredients) {
    if (ing.reorder_quantity <= 0) continue;
    const unitPrice = priceMap.get(ing.ingredient_id) || new Decimal(0);
    totalReorderCost = totalReorderCost.plus(unitPrice.times(ing.reorder_quantity));
  }

  const estimatedDailyRevenue = recipes.reduce(
    (sum, r) => sum + r.avg_daily_revenue,
    0
  );

  return {
    generated_at: generatedAt,
    days_analyzed: daysAnalyzed,
    recipes,
    ingredients,
    summary: {
      total_recipes_analyzed: recipes.length,
      total_ingredients_analyzed: ingredients.length,
      critical_ingredients: criticalIngredients.length,
      total_reorder_cost: parseFloat(totalReorderCost.toFixed(2)),
      estimated_daily_revenue: parseFloat(estimatedDailyRevenue.toFixed(2)),
    },
  };
}
