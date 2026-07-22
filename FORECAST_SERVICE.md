# mePOS STOCK — Forecast Service Documentation

> **Version:** 2.4.0  
> **Module:** `backend/src/services/forecast.service.ts`  
> **Route:** `GET /api/v1/forecast`  
> **Frontend:** `ForecastPanel.vue` component  
> **Access:** Admin only (non-critical, fails silently)

---

## Overview

The Forecast Service provides **demand-driven inventory intelligence** for restaurant managers. It analyzes the last 7 days of sales data to predict:

1. **Which recipes sell the most** (revenue & volume)
2. **Which ingredients will run out first** (depletion timeline)
3. **How much to reorder** (suggested purchase quantities)
4. **The financial impact** (estimated reorder cost)

The system uses a **7-day moving average** as its prediction model — simple, explainable, and effective for restaurants with stable demand patterns.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   DashboardView.vue                  │
│  ┌─────────────────────────────────────────────────┐│
│  │           ForecastPanel.vue (Admin Only)        ││
│  │                                                 ││
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐       ││
│  │  │ Metrics  │ │ Critical │ │ Depletion│       ││
│  │  │   Grid   │ │  Alert   │ │ Timeline │       ││
│  │  └──────────┘ └──────────┘ └──────────┘       ││
│  │  ┌──────────────────┐ ┌──────────────────────┐ ││
│  │  │ Reorder Suggest. │ │ Recipe Forecast Bar  │ ││
│  │  └──────────────────┘ └──────────────────────┘ ││
│  └─────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────┘
                          │
                    GET /api/v1/forecast
                          │
              ┌───────────▼───────────┐
              │   forecast.service.ts │
              │                       │
              │  1. computeRecipe-    │
              │     Forecasts()       │
              │  2. computeIngredient-│
              │     Forecasts()       │
              │  3. Build Summary     │
              └───────────┬───────────┘
                          │
         ┌────────────────┼────────────────┐
         ▼                ▼                ▼
   sales_tickets    recipe_ingredients  inventory_stocks
   sales_ticket_items   ingredients      departments
         └────────────────┼────────────────┘
                          ▼
                    PostgreSQL / DemoDb
```

---

## Data Flow

### Step 1: Recipe Forecast (7-Day Moving Average)

```
Sales Tickets (last 7 days)
    ↓
JOIN sales_ticket_items → recipes
    ↓
GROUP BY recipe_id
    ↓
SUM(quantity) → total_7day_quantity
SUM(quantity × unit_price) → total_7day_revenue
    ↓
÷ 7 days → avg_daily_quantity, avg_daily_revenue
    ↓
Sort by avg_daily_revenue DESC
```

**Example Output:**
```json
{
  "recipe_id": 3,
  "recipe_name": "Burger Classic",
  "sale_price": 13.50,
  "avg_daily_quantity": 12.3,
  "avg_daily_revenue": 166.05,
  "total_7day_quantity": 86.0,
  "total_7day_revenue": 1162.35
}
```

### Step 2: Ingredient Forecast (Depletion + Reorder)

```
Recipe Forecasts (from Step 1)
    ↓
For each recipe → JOIN recipe_ingredients
    ↓
daily_usage_per_ingredient = quantity_needed × avg_daily_quantity
    ↓
Aggregate across all recipes using that ingredient
    ↓
Combine with current stock levels (per department)
    ↓
For each ingredient in each department:
  ├─ days_until_depletion = current_stock / avg_daily_usage
  ├─ reorder_quantity = (avg_daily_usage × 7) - current_stock
  └─ is_critical = (current_stock ≤ alert_threshold) OR (days_until_depletion ≤ 3)
```

**Example Output:**
```json
{
  "ingredient_id": 4,
  "ingredient_name": "Steak de Bœuf",
  "unit": "pcs",
  "current_stock": 30.00,
  "avg_daily_usage": 12.30,
  "days_until_depletion": 2,
  "reorder_quantity": 56.10,
  "alert_threshold": 40.00,
  "is_critical": true,
  "department_id": 2,
  "department_name": "Cuisine"
}
```

### Step 3: Summary

```
total_recipes_analyzed = count(recipes)
total_ingredients_analyzed = count(ingredients across all departments)
critical_ingredients = count(ingredients where is_critical = true)
total_reorder_cost = SUM(reorder_quantity × purchase_price_per_unit) for reorderable items
estimated_daily_revenue = SUM(avg_daily_revenue) across all recipes
```

---

## API Response

### Endpoint
```
GET /api/v1/forecast
Authorization: Bearer <jwt_token>
```

### Response Structure
```json
{
  "status": "success",
  "data": {
    "generated_at": "2026-07-20T12:00:00.000Z",
    "days_analyzed": 7,
    "recipes": [
      {
        "recipe_id": 3,
        "recipe_name": "Burger Classic",
        "sale_price": 13.50,
        "avg_daily_quantity": 12.3,
        "avg_daily_revenue": 166.05,
        "total_7day_quantity": 86.0,
        "total_7day_revenue": 1162.35
      }
    ],
    "ingredients": [
      {
        "ingredient_id": 4,
        "ingredient_name": "Steak de Bœuf",
        "unit": "pcs",
        "current_stock": 30.00,
        "avg_daily_usage": 12.30,
        "days_until_depletion": 2,
        "reorder_quantity": 56.10,
        "alert_threshold": 40.00,
        "is_critical": true,
        "department_id": 2,
        "department_name": "Cuisine"
      }
    ],
    "summary": {
      "total_recipes_analyzed": 9,
      "total_ingredients_analyzed": 24,
      "critical_ingredients": 3,
      "total_reorder_cost": 1850.50,
      "estimated_daily_revenue": 892.30
    }
  }
}
```

---

## Key Algorithms

### Depletion Calculation

```
If avg_daily_usage > 0:
    days_until_depletion = floor(current_stock / avg_daily_usage)
Else:
    days_until_depletion = null (no usage data)
```

### Reorder Quantity

```
reorder_quantity = max(0, (avg_daily_usage × 7) - current_stock)
```

This ensures the restaurant always has **7 days of stock** at current consumption rates.

### Criticality Detection

```
is_critical = (current_stock ≤ alert_threshold)
           OR (days_until_depletion ≤ 3)
```

Two signals combined:
1. **Absolute threshold** — stock is below the configured alert level
2. **Relative urgency** — stock will run out within 3 days at current usage

### Sort Order

Ingredients are sorted by:
1. Critical items first
2. Then by days_until_depletion ascending (most urgent first)

---

## Frontend Components

### ForecastPanel.vue

Located at `frontend/src/components/forecast/ForecastPanel.vue`

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `forecast` | Object | null | Forecast data from API |
| `isLoading` | Boolean | false | Loading state |

**Sections:**
1. **Metrics Grid** — 4 KPI cards (recipes analyzed, ingredients monitored, critical count, daily revenue)
2. **Critical Alert** — Red-bordered panel listing ingredients with ≤3 days stock, with expand/collapse for >5 items
3. **Depletion Timeline** — Progress bars showing days until each ingredient runs out (color-coded: red ≤1d, amber ≤3d, green >3d)
4. **Reorder Suggestions** — Suggested purchase quantities with progress bars relative to max reorder need
5. **Recipe Forecast** — Horizontal bars showing daily revenue per recipe

**States:**
- **Loading** — Skeleton placeholders
- **No Data** — EmptyState component with message
- **With Data** — Full forecast dashboard

### Integration in DashboardView.vue

```vue
<ForecastPanel
  v-if="isAdmin"
  :forecast="app.forecast"
  :is-loading="app.isForecastLoading"
/>
```

- Only shown to **Admin** role
- Data loaded in `app.js` store via `api.getForecast()`
- Refreshed on every `fetchData()` call (8-second polling)

---

## Data Dependencies

The forecast requires the following data to be present:

| Data Source | Required | Purpose |
|-------------|----------|---------|
| `sales_tickets` | Yes | Sales history for 7-day average |
| `sales_ticket_items` | Yes | Item-level sales breakdown |
| `recipes` | Yes | Recipe names and sale prices |
| `recipe_ingredients` | Yes | Ingredient-to-recipe mapping (quantities) |
| `ingredients` | Yes | Ingredient names, units, purchase prices, alert thresholds |
| `inventory_stocks` | Yes | Current stock levels per department |
| `departments` | Yes | Department names for per-department breakdown |

**Without sales data**, the forecast still returns but with:
- `avg_daily_quantity: 0` for all recipes
- `days_until_depletion: null` for all ingredients
- `reorder_quantity: 0` for all ingredients
- Empty recipe forecast list

---

## Demo Mode vs PostgreSQL

The service supports both modes via `isDemoMode`:

| Feature | Demo Mode (In-Memory) | PostgreSQL |
|---------|----------------------|------------|
| Recipe forecast | Filters `demoDb.sales_tickets` by date range | SQL `GROUP BY` with `SUM()` |
| Ingredient usage | Loops `demoDb.recipe_ingredients` | SQL `JOIN` + `GROUP BY` |
| Stock levels | Reads `demoDb.inventory_stocks` | SQL `JOIN` + `ORDER BY` |
| Price lookup | Loops `demoDb.ingredients` | Batch `SELECT id, purchase_price_per_unit` |

---

## Performance Considerations

1. **Batch price loading** — Ingredient prices are loaded in a single query (not per-ingredient) to avoid N+1
2. **Date range filtering** — Only sales from the last 7 days are considered
3. **Per-department breakdown** — Each department's stocks are queried separately (could be optimized with a single JOIN)
4. **No caching** — Forecast is computed fresh on every request (acceptable for admin-only, low-frequency use)
5. **Forecast is non-critical** — API errors in the forecast endpoint are silently caught in the app store; the dashboard continues to load

---

## Access Control

| Role | Can View Forecast? | Notes |
|------|-------------------|-------|
| Admin | ✅ Yes | Full forecast with financial data |
| Manager | ❌ No | Not shown in dashboard |
| Cook | ❌ No | Not shown in dashboard |

The forecast is fetched only when `user.role === 'admin'` in the app store:

```javascript
// In stores/app.js fetchData():
if (user?.role === 'admin') {
  try {
    isForecastLoading.value = true
    const forecastRes = await api.getForecast()
    if (forecastRes.data.status === 'success' && forecastRes.data.data) {
      forecast.value = forecastRes.data.data
    }
  } catch { /* forecast is non-critical */ }
  finally { isForecastLoading.value = false }
}
```

---

## Future Enhancements

1. **Configurable analysis window** — Allow 14-day or 30-day averages
2. **Seasonal adjustment** — Weight recent days more heavily
3. **Trend detection** — Increasing/decreasing demand signals
4. **Auto-reorder integration** — Generate purchase orders from reorder suggestions
5. **Multi-department forecasting** — Per-department consumption patterns
6. **Export to PDF/CSV** — Download forecast reports
7. **Caching layer** — Cache forecast for 5 minutes to reduce DB load
8. **Confidence intervals** — Show prediction uncertainty range
