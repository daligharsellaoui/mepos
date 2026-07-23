import { query, isDemoMode, demoDb } from '../database';
import { eventBus, Events } from './event.service';

function resolveTenantFilter(tenantId?: number | null): number | undefined {
  if (tenantId === null) return undefined;
  return tenantId ?? 1;
}

export async function recordPrice(
  data: {
    ingredient_id: number;
    supplier_id?: number;
    purchase_order_id?: number;
    unit_price: number;
    purchase_unit?: string;
    conversion_factor?: number;
    quantity?: number;
    currency?: string;
    source?: string;
    notes?: string;
  },
  tenantId?: number | null
): Promise<any> {
  const filter = resolveTenantFilter(tenantId);
  const tid = filter ?? 1;

  const pricePerUnit = data.unit_price / (data.conversion_factor || 1);

  if (isDemoMode) {
    const newId = demoDb.ingredient_price_history.length > 0
      ? Math.max(...demoDb.ingredient_price_history.map((p: any) => p.id)) + 1
      : 1;

    const entry = {
      id: newId,
      tenant_id: tid,
      ingredient_id: data.ingredient_id,
      supplier_id: data.supplier_id || null,
      purchase_order_id: data.purchase_order_id || null,
      unit_price: data.unit_price,
      purchase_unit: data.purchase_unit || null,
      conversion_factor: data.conversion_factor || 1,
      price_per_unit: pricePerUnit,
      quantity: data.quantity || 0,
      currency: data.currency || 'TND',
      price_date: new Date().toISOString(),
      source: data.source || 'manual',
      notes: data.notes || null,
      created_at: new Date().toISOString(),
    };
    demoDb.ingredient_price_history.push(entry);

    eventBus.emit(Events.PRICE_CHANGED, {
      tenantId: tid,
      ingredientId: data.ingredient_id,
      supplierId: data.supplier_id,
      oldPrice: null,
      newPrice: pricePerUnit,
      source: data.source || 'manual',
    });

    if (data.source !== 'import') {
      await updateIngredientCurrentPrice(data.ingredient_id, pricePerUnit, tid);
    }

    return entry;
  }

  const result = await query(
    `INSERT INTO ingredient_price_history
     (tenant_id, ingredient_id, supplier_id, purchase_order_id, unit_price, purchase_unit,
      conversion_factor, price_per_unit, quantity, currency, source, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [tid, data.ingredient_id, data.supplier_id || null, data.purchase_order_id || null,
     data.unit_price, data.purchase_unit || null, data.conversion_factor || 1,
     pricePerUnit, data.quantity || 0, data.currency || 'TND', data.source || 'manual',
     data.notes || null]
  );

  const entry = result.rows[0];

  eventBus.emit(Events.PRICE_CHANGED, {
    tenantId: tid,
    ingredientId: data.ingredient_id,
    supplierId: data.supplier_id,
    oldPrice: null,
    newPrice: pricePerUnit,
    source: data.source || 'manual',
  });

  if (data.source !== 'import') {
    await updateIngredientCurrentPrice(data.ingredient_id, pricePerUnit, tid);
  }

  return entry;
}

export async function getPriceHistory(
  ingredientId: number,
  tenantId?: number | null,
  filters?: {
    supplier_id?: number;
    date_from?: string;
    date_to?: string;
    limit?: number;
    offset?: number;
  }
): Promise<any[]> {
  const filter = resolveTenantFilter(tenantId);
  const tid = filter ?? 1;
  const limit = filters?.limit || 50;
  const offset = filters?.offset || 0;

  if (isDemoMode) {
    let history = demoDb.ingredient_price_history.filter(
      (p: any) => p.ingredient_id === ingredientId && p.tenant_id === tid
    );

    if (filters?.supplier_id) {
      history = history.filter((p: any) => p.supplier_id === filters.supplier_id);
    }
    if (filters?.date_from) {
      history = history.filter((p: any) => new Date(p.price_date) >= new Date(filters.date_from!));
    }
    if (filters?.date_to) {
      history = history.filter((p: any) => new Date(p.price_date) <= new Date(filters.date_to!));
    }

    history.sort((a: any, b: any) => new Date(b.price_date).getTime() - new Date(a.price_date).getTime());

    return history.slice(offset, offset + limit).map((p: any) => {
      const supplier = p.supplier_id
        ? demoDb.suppliers.find((s: any) => s.id === p.supplier_id)
        : null;
      return { ...p, supplier_name: supplier?.name || null };
    });
  }

  let sql = `SELECT ph.*, s.name as supplier_name
             FROM ingredient_price_history ph
             LEFT JOIN suppliers s ON s.id = ph.supplier_id
             WHERE ph.ingredient_id = $1 AND ph.tenant_id = $2`;
  const params: any[] = [ingredientId, tid];
  let paramIndex = 3;

  if (filters?.supplier_id) {
    sql += ` AND ph.supplier_id = $${paramIndex}`;
    params.push(filters.supplier_id);
    paramIndex++;
  }
  if (filters?.date_from) {
    sql += ` AND ph.price_date >= $${paramIndex}`;
    params.push(filters.date_from);
    paramIndex++;
  }
  if (filters?.date_to) {
    sql += ` AND ph.price_date <= $${paramIndex}`;
    params.push(filters.date_to);
    paramIndex++;
  }

  sql += ` ORDER BY ph.price_date DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(limit, offset);

  const result = await query(sql, params);
  return result.rows;
}

export async function getPriceAnalytics(
  ingredientId: number,
  tenantId?: number | null
): Promise<any> {
  const filter = resolveTenantFilter(tenantId);
  const tid = filter ?? 1;

  if (isDemoMode) {
    const ingredient = demoDb.ingredients.find(
      (i: any) => i.id === ingredientId && i.tenant_id === tid
    );
    if (!ingredient) return null;

    const history = demoDb.ingredient_price_history
      .filter((p: any) => p.ingredient_id === ingredientId && p.tenant_id === tid)
      .sort((a: any, b: any) => new Date(b.price_date).getTime() - new Date(a.price_date).getTime());

    if (history.length === 0) {
      return {
        current_cost: ingredient.purchase_price_per_unit || 0,
        average_cost: ingredient.purchase_price_per_unit || 0,
        last_purchase: null,
        previous_purchase: null,
        min_cost: ingredient.purchase_price_per_unit || 0,
        max_cost: ingredient.purchase_price_per_unit || 0,
        cost_evolution: [],
        supplier_comparison: [],
        purchase_timeline: [],
      };
    }

    const prices = history.map((p: any) => p.price_per_unit);
    const currentCost = history[0].price_per_unit;
    const averageCost = prices.reduce((s: number, v: number) => s + v, 0) / prices.length;
    const minCost = Math.min(...prices);
    const maxCost = Math.max(...prices);

    const lastPurchaseEntry = history[0];
    const lastPurchase = {
      price: lastPurchaseEntry.price_per_unit,
      supplier_name: lastPurchaseEntry.supplier_id
        ? demoDb.suppliers.find((s: any) => s.id === lastPurchaseEntry.supplier_id)?.name || null
        : null,
      date: lastPurchaseEntry.price_date,
    };

    const previousPurchaseEntry = history[1] || null;
    const previousPurchase = previousPurchaseEntry
      ? {
          price: previousPurchaseEntry.price_per_unit,
          supplier_name: previousPurchaseEntry.supplier_id
            ? demoDb.suppliers.find((s: any) => s.id === previousPurchaseEntry.supplier_id)?.name || null
            : null,
          date: previousPurchaseEntry.price_date,
        }
      : null;

    const costEvolution = history.slice(0, 12).reverse().map((p: any) => ({
      date: p.price_date,
      price: p.price_per_unit,
    }));

    const supplierMap: Record<number, { supplier_id: number; supplier_name: string; prices: number[]; count: number }> = {};
    for (const p of history) {
      if (p.supplier_id) {
        if (!supplierMap[p.supplier_id]) {
          const supplier = demoDb.suppliers.find((s: any) => s.id === p.supplier_id);
          supplierMap[p.supplier_id] = {
            supplier_id: p.supplier_id,
            supplier_name: supplier?.name || 'Unknown',
            prices: [],
            count: 0,
          };
        }
        supplierMap[p.supplier_id].prices.push(p.price_per_unit);
        supplierMap[p.supplier_id].count++;
      }
    }
    const supplierComparison = Object.values(supplierMap).map((s) => ({
      supplier_id: s.supplier_id,
      supplier_name: s.supplier_name,
      avg_price: s.prices.reduce((a: number, b: number) => a + b, 0) / s.prices.length,
      last_price: s.prices[s.prices.length - 1],
      count: s.count,
    }));

    const purchaseTimeline = history.slice(0, 20).map((p: any) => ({
      date: p.price_date,
      price: p.price_per_unit,
      quantity: p.quantity,
      supplier_name: p.supplier_id
        ? demoDb.suppliers.find((s: any) => s.id === p.supplier_id)?.name || null
        : null,
    }));

    return {
      current_cost: currentCost,
      average_cost: parseFloat(averageCost.toFixed(4)),
      last_purchase: lastPurchase,
      previous_purchase: previousPurchase,
      min_cost: minCost,
      max_cost: maxCost,
      cost_evolution: costEvolution,
      supplier_comparison: supplierComparison,
      purchase_timeline: purchaseTimeline,
    };
  }

  const result = await query(
    `WITH price_data AS (
       SELECT * FROM ingredient_price_history
       WHERE ingredient_id = $1 AND tenant_id = $2
       ORDER BY price_date DESC
     ),
     stats AS (
       SELECT
         COALESCE(AVG(price_per_unit), 0) as average_cost,
         COALESCE(MIN(price_per_unit), 0) as min_cost,
         COALESCE(MAX(price_per_unit), 0) as max_cost
       FROM price_data
     ),
     last_purchase_raw AS (
       SELECT price_per_unit, supplier_id, price_date
       FROM price_data
       LIMIT 1
     ),
     previous_purchase_raw AS (
       SELECT price_per_unit, supplier_id, price_date
       FROM price_data
       OFFSET 1 LIMIT 1
     ),
     evolution AS (
       SELECT price_date as date, price_per_unit as price
       FROM price_data
       LIMIT 12
     ),
     supplier_agg AS (
       SELECT
         ph.supplier_id,
         s.name as supplier_name,
         AVG(ph.price_per_unit) as avg_price,
         LAST(ph.price_per_unit ORDER BY ph.price_date DESC) as last_price,
         COUNT(*) as count
       FROM ingredient_price_history ph
       JOIN suppliers s ON s.id = ph.supplier_id
       WHERE ph.ingredient_id = $1 AND ph.tenant_id = $2
       GROUP BY ph.supplier_id, s.name
     ),
     timeline AS (
       SELECT price_date as date, price_per_unit as price, quantity, supplier_id
       FROM price_data
       LIMIT 20
     )
     SELECT
       (SELECT purchase_price_per_unit FROM ingredients WHERE id = $1 AND tenant_id = $2) as current_cost,
       (SELECT average_cost FROM stats) as average_cost,
       (SELECT row_to_json(lp) FROM (SELECT lpr.price_per_unit as price, s.name as supplier_name, lpr.price_date as date FROM last_purchase_raw lpr LEFT JOIN suppliers s ON s.id = lpr.supplier_id) lp) as last_purchase,
       (SELECT row_to_json(pp) FROM (SELECT ppr.price_per_unit as price, s.name as supplier_name, ppr.price_date as date FROM previous_purchase_raw ppr LEFT JOIN suppliers s ON s.id = ppr.supplier_id) pp) as previous_purchase,
       (SELECT min_cost FROM stats) as min_cost,
       (SELECT max_cost FROM stats) as max_cost,
       (SELECT json_agg(row_to_json(e)) FROM evolution e) as cost_evolution,
       (SELECT json_agg(row_to_json(sa)) FROM supplier_agg sa) as supplier_comparison,
       (SELECT json_agg(row_to_json(t)) FROM (SELECT t.date, t.price, t.quantity, s.name as supplier_name FROM timeline t LEFT JOIN suppliers s ON s.id = t.supplier_id) t) as purchase_timeline`,
    [ingredientId, tid]
  );

  if (result.rows.length === 0) return null;
  const row = result.rows[0];

  return {
    current_cost: parseFloat(row.current_cost) || 0,
    average_cost: parseFloat(row.average_cost) || 0,
    last_purchase: row.last_purchase,
    previous_purchase: row.previous_purchase,
    min_cost: parseFloat(row.min_cost) || 0,
    max_cost: parseFloat(row.max_cost) || 0,
    cost_evolution: row.cost_evolution || [],
    supplier_comparison: row.supplier_comparison || [],
    purchase_timeline: row.purchase_timeline || [],
  };
}

export async function getSupplierPriceComparison(
  supplierId: number,
  tenantId?: number | null
): Promise<any[]> {
  const filter = resolveTenantFilter(tenantId);
  const tid = filter ?? 1;

  if (isDemoMode) {
    const history = demoDb.ingredient_price_history.filter(
      (p: any) => p.supplier_id === supplierId && p.tenant_id === tid
    );

    const ingredientMap: Record<number, { ingredient_id: number; ingredient_name: string; prices: number[]; count: number }> = {};
    for (const p of history) {
      if (!ingredientMap[p.ingredient_id]) {
        const ing = demoDb.ingredients.find((i: any) => i.id === p.ingredient_id);
        ingredientMap[p.ingredient_id] = {
          ingredient_id: p.ingredient_id,
          ingredient_name: ing?.name || 'Unknown',
          prices: [],
          count: 0,
        };
      }
      ingredientMap[p.ingredient_id].prices.push(p.price_per_unit);
      ingredientMap[p.ingredient_id].count++;
    }

    return Object.values(ingredientMap).map((item) => ({
      ingredient_id: item.ingredient_id,
      ingredient_name: item.ingredient_name,
      avg_price: item.prices.reduce((a: number, b: number) => a + b, 0) / item.prices.length,
      last_price: item.prices[item.prices.length - 1],
      count: item.count,
    }));
  }

  const result = await query(
    `SELECT
       ph.ingredient_id,
       i.name as ingredient_name,
       AVG(ph.price_per_unit) as avg_price,
       LAST(ph.price_per_unit ORDER BY ph.price_date DESC) as last_price,
       COUNT(*) as count
     FROM ingredient_price_history ph
     JOIN ingredients i ON i.id = ph.ingredient_id
     WHERE ph.supplier_id = $1 AND ph.tenant_id = $2
     GROUP BY ph.ingredient_id, i.name`,
    [supplierId, tid]
  );

  return result.rows.map((r: any) => ({
    ingredient_id: r.ingredient_id,
    ingredient_name: r.ingredient_name,
    avg_price: parseFloat(r.avg_price),
    last_price: parseFloat(r.last_price),
    count: parseInt(r.count, 10),
  }));
}

export async function updateIngredientCurrentPrice(
  ingredientId: number,
  price: number,
  tenantId?: number | null
): Promise<void> {
  const filter = resolveTenantFilter(tenantId);
  const tid = filter ?? 1;

  if (isDemoMode) {
    const ingredient = demoDb.ingredients.find(
      (i: any) => i.id === ingredientId && i.tenant_id === tid
    );
    if (!ingredient) return;
    if (ingredient.purchase_price_per_unit !== price) {
      ingredient.purchase_price_per_unit = price;
    }
    return;
  }

  await query(
    `UPDATE ingredients SET purchase_price_per_unit = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2 AND tenant_id = $3 AND purchase_price_per_unit IS DISTINCT FROM $1`,
    [price, ingredientId, tid]
  );
}

export async function getSupplierIngredients(
  supplierId: number,
  tenantId?: number | null
): Promise<any[]> {
  const filter = resolveTenantFilter(tenantId);
  const tid = filter ?? 1;

  if (isDemoMode) {
    return demoDb.supplier_ingredients
      .filter((si: any) => si.supplier_id === supplierId && si.tenant_id === tid)
      .map((si: any) => {
        const ingredient = demoDb.ingredients.find((i: any) => i.id === si.ingredient_id);
        return {
          ...si,
          ingredient_name: ingredient?.name || 'Unknown',
          ingredient_unit: ingredient?.unit || null,
        };
      });
  }

  const result = await query(
    `SELECT si.*, i.name as ingredient_name, i.unit as ingredient_unit
     FROM supplier_ingredients si
     JOIN ingredients i ON i.id = si.ingredient_id
     WHERE si.supplier_id = $1 AND si.tenant_id = $2`,
    [supplierId, tid]
  );

  return result.rows;
}

export async function linkSupplierIngredient(
  data: {
    supplier_id: number;
    ingredient_id: number;
    supplier_sku?: string;
    unit_price?: number;
    purchase_unit?: string;
    conversion_factor?: number;
    minimum_order_quantity?: number;
    lead_time_days?: number;
    is_preferred?: boolean;
  },
  tenantId?: number | null
): Promise<any> {
  const filter = resolveTenantFilter(tenantId);
  const tid = filter ?? 1;

  if (isDemoMode) {
    const existingIdx = demoDb.supplier_ingredients.findIndex(
      (si: any) => si.supplier_id === data.supplier_id && si.ingredient_id === data.ingredient_id && si.tenant_id === tid
    );

    if (existingIdx !== -1) {
      const updated = {
        ...demoDb.supplier_ingredients[existingIdx],
        supplier_sku: data.supplier_sku ?? demoDb.supplier_ingredients[existingIdx].supplier_sku,
        unit_price: data.unit_price ?? demoDb.supplier_ingredients[existingIdx].unit_price,
        purchase_unit: data.purchase_unit ?? demoDb.supplier_ingredients[existingIdx].purchase_unit,
        conversion_factor: data.conversion_factor ?? demoDb.supplier_ingredients[existingIdx].conversion_factor,
        minimum_order_quantity: data.minimum_order_quantity ?? demoDb.supplier_ingredients[existingIdx].minimum_order_quantity,
        lead_time_days: data.lead_time_days ?? demoDb.supplier_ingredients[existingIdx].lead_time_days,
        is_preferred: data.is_preferred ?? demoDb.supplier_ingredients[existingIdx].is_preferred,
        updated_at: new Date().toISOString(),
      };
      demoDb.supplier_ingredients[existingIdx] = updated;
      return updated;
    }

    const newId = demoDb.supplier_ingredients.length > 0
      ? Math.max(...demoDb.supplier_ingredients.map((si: any) => si.id)) + 1
      : 1;

    const entry = {
      id: newId,
      tenant_id: tid,
      supplier_id: data.supplier_id,
      ingredient_id: data.ingredient_id,
      supplier_sku: data.supplier_sku || null,
      unit_price: data.unit_price || null,
      purchase_unit: data.purchase_unit || null,
      conversion_factor: data.conversion_factor || 1,
      minimum_order_quantity: data.minimum_order_quantity || 0,
      lead_time_days: data.lead_time_days || 0,
      is_preferred: data.is_preferred || false,
      notes: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    demoDb.supplier_ingredients.push(entry);

    eventBus.emit(Events.SUPPLIER_UPDATED, {
      tenantId: tid,
      id: data.supplier_id,
      ingredientId: data.ingredient_id,
    });

    return entry;
  }

  const result = await query(
    `INSERT INTO supplier_ingredients
     (tenant_id, supplier_id, ingredient_id, supplier_sku, unit_price, purchase_unit,
      conversion_factor, minimum_order_quantity, lead_time_days, is_preferred)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (tenant_id, supplier_id, ingredient_id)
     DO UPDATE SET
       supplier_sku = COALESCE($4, supplier_ingredients.supplier_sku),
       unit_price = COALESCE($5, supplier_ingredients.unit_price),
       purchase_unit = COALESCE($6, supplier_ingredients.purchase_unit),
       conversion_factor = COALESCE($7, supplier_ingredients.conversion_factor),
       minimum_order_quantity = COALESCE($8, supplier_ingredients.minimum_order_quantity),
       lead_time_days = COALESCE($9, supplier_ingredients.lead_time_days),
       is_preferred = COALESCE($10, supplier_ingredients.is_preferred),
       updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [tid, data.supplier_id, data.ingredient_id, data.supplier_sku || null,
     data.unit_price || null, data.purchase_unit || null, data.conversion_factor || 1,
     data.minimum_order_quantity || 0, data.lead_time_days || 0, data.is_preferred || false]
  );

  eventBus.emit(Events.SUPPLIER_UPDATED, {
    tenantId: tid,
    id: data.supplier_id,
    ingredientId: data.ingredient_id,
  });

  return result.rows[0];
}

export async function unlinkSupplierIngredient(
  supplierId: number,
  ingredientId: number,
  tenantId?: number | null
): Promise<{ success: boolean }> {
  const filter = resolveTenantFilter(tenantId);
  const tid = filter ?? 1;

  if (isDemoMode) {
    const idx = demoDb.supplier_ingredients.findIndex(
      (si: any) => si.supplier_id === supplierId && si.ingredient_id === ingredientId && si.tenant_id === tid
    );
    if (idx !== -1) {
      demoDb.supplier_ingredients.splice(idx, 1);
    }

    eventBus.emit(Events.SUPPLIER_UPDATED, {
      tenantId: tid,
      id: supplierId,
      ingredientId,
    });

    return { success: true };
  }

  await query(
    `DELETE FROM supplier_ingredients
     WHERE supplier_id = $1 AND ingredient_id = $2 AND tenant_id = $3`,
    [supplierId, ingredientId, tid]
  );

  eventBus.emit(Events.SUPPLIER_UPDATED, {
    tenantId: tid,
    id: supplierId,
    ingredientId,
  });

  return { success: true };
}
