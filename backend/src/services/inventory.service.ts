import { Decimal } from 'decimal.js';
import { query, isDemoMode, demoDb, getClient } from '../database';
import { getEffectiveDepartmentId } from './stock.service';

// ======================================================
// INVENTORY SERVICE
// Departments, Ingredients, Recipes, and Stock management
// ======================================================

/**
 * Resolve tenant ID for queries.
 * null = platform admin (no filtering)
 * undefined = no context (default to 1)
 * number = specific tenant
 */
function resolveTenantFilter(tenantId?: number | null): number | undefined {
  if (tenantId === null) return undefined; // platform admin: no filter
  return tenantId ?? 1; // default to tenant 1
}

// ──────────────────────────────────────────────
// DEPARTMENTS
// ──────────────────────────────────────────────

export async function getAllDepartments(tenantId?: number | null): Promise<any[]> {
  const filter = resolveTenantFilter(tenantId);
  if (isDemoMode) {
    return filter
      ? demoDb.departments.filter((d: any) => d.tenant_id === filter)
      : demoDb.departments;
  }
  if (filter) {
    const result = await query('SELECT * FROM departments WHERE tenant_id = $1 ORDER BY id', [filter]);
    return result.rows;
  }
  const result = await query('SELECT * FROM departments ORDER BY id');
  return result.rows;
}

export async function createDepartment(data: {
  name: string;
  stock_type: string;
  description?: string;
}, tenantId?: number | null): Promise<any> {
  const { name, stock_type, description } = data;
  const tid = tenantId ?? 1;

  if (stock_type !== 'isolated' && stock_type !== 'inherited') {
    throw new Error('Politique de stock invalide.');
  }

  if (isDemoMode) {
    const nameExists = demoDb.departments.some(
      (d: any) => d.name.toLowerCase() === name.toLowerCase() && d.tenant_id === tid
    );
    if (nameExists) {
      throw new Error('Un dépôt avec ce nom existe déjà.');
    }

    const newId =
      demoDb.departments.length > 0
        ? Math.max(...demoDb.departments.map((d: any) => d.id)) + 1
        : 1;

    const newDept = { id: newId, name, stock_type, description: description || '', tenant_id: tid };
    demoDb.departments.push(newDept);

    demoDb.ingredients.forEach((ing: any) => {
      const stockId =
        demoDb.inventory_stocks.length > 0
          ? Math.max(...demoDb.inventory_stocks.map((s: any) => s.id)) + 1
          : 1;
      demoDb.inventory_stocks.push({
        id: stockId,
        department_id: newId,
        ingredient_id: ing.id,
        quantity: 0.0,
      });
    });

    return newDept;
  }

  const nameCheck = await query(
    'SELECT id FROM departments WHERE tenant_id = $1 AND LOWER(name) = LOWER($2)',
    [tid, name]
  );
  if (nameCheck.rows.length > 0) {
    throw new Error('Un dépôt avec ce nom existe déjà.');
  }

  const { client, release } = await getClient();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO departments (name, stock_type, description, tenant_id)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, stock_type, description || null, tid]
    );
    const newDept = result.rows[0];

    await client.query(
      `INSERT INTO inventory_stocks (department_id, ingredient_id, quantity, tenant_id)
       SELECT $1, id, 0.0000, $2 FROM ingredients WHERE tenant_id = $2
       ON CONFLICT (department_id, ingredient_id) DO NOTHING`,
      [newDept.id, tid]
    );

    await client.query('COMMIT');
    return newDept;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    release();
  }
}

export async function updateDepartment(
  deptId: number,
  data: { name: string; stock_type: string; description?: string },
  tenantId?: number | null
): Promise<any> {
  const { name, stock_type, description } = data;
  const tid = tenantId ?? 1;

  if (stock_type !== 'isolated' && stock_type !== 'inherited') {
    throw new Error('Politique de stock invalide.');
  }

  if (isDemoMode) {
    const deptIndex = demoDb.departments.findIndex((d: any) => d.id === deptId && d.tenant_id === tid);
    if (deptIndex === -1) {
      throw new Error('Dépôt introuvable.');
    }

    const nameExists = demoDb.departments.some(
      (d: any) => d.id !== deptId && d.tenant_id === tid && d.name.toLowerCase() === name.toLowerCase()
    );
    if (nameExists) {
      throw new Error('Un dépôt avec ce nom existe déjà.');
    }

    const updatedDept = {
      ...demoDb.departments[deptIndex],
      name,
      stock_type,
      description: description || '',
    };
    demoDb.departments[deptIndex] = updatedDept;
    return updatedDept;
  }

  const nameCheck = await query(
    'SELECT id FROM departments WHERE tenant_id = $1 AND id != $2 AND LOWER(name) = LOWER($3)',
    [tid, deptId, name]
  );
  if (nameCheck.rows.length > 0) {
    throw new Error('Un dépôt avec ce nom existe déjà.');
  }

  const result = await query(
    `UPDATE departments
     SET name = $1, stock_type = $2, description = $3
     WHERE id = $4 AND tenant_id = $5 RETURNING *`,
    [name, stock_type, description || null, deptId, tid]
  );

  if (result.rows.length === 0) {
    throw new Error('Dépôt introuvable.');
  }

  return result.rows[0];
}

export async function deleteDepartment(
  deptId: number,
  transferToId?: number | null,
  tenantId?: number | null
): Promise<{ success: boolean; requiresTransfer?: boolean; message: string }> {
  if (isNaN(deptId)) {
    throw new Error('ID de dépôt invalide.');
  }
  const tid = tenantId ?? 1;

  if (isDemoMode) {
    const deptIndex = demoDb.departments.findIndex((d: any) => d.id === deptId && d.tenant_id === tid);
    if (deptIndex === -1) {
      throw new Error('Dépôt introuvable.');
    }
    const dept = demoDb.departments[deptIndex];
    const isCentral = /central|principal|main/i.test(dept.name);
    if (isCentral) {
      throw new Error('Le dépôt principal ne peut pas être supprimé.');
    }

    const hasSales = demoDb.sales_tickets.some((t: any) => t.department_id === deptId && t.tenant_id === tid);
    const hasLosses = demoDb.ingredient_losses.some((l: any) => l.department_id === deptId && l.tenant_id === tid);
    if (hasSales || hasLosses) {
      throw new Error(
        'Ce dépôt est lié à des transactions historiques (ventes ou pertes) et ne peut pas être supprimé.'
      );
    }

    const nonZeroStocks = demoDb.inventory_stocks.filter(
      (s: any) => s.department_id === deptId && parseFloat(s.quantity) > 0
    );

    if (nonZeroStocks.length > 0) {
      if (!transferToId || isNaN(transferToId)) {
        return {
          success: false,
          requiresTransfer: true,
          message:
            'Ce dépôt contient du stock. Veuillez choisir un dépôt de destination pour y transférer les stocks restants.',
        };
      }

      const targetDept = demoDb.departments.find((d: any) => d.id === transferToId && d.tenant_id === tid);
      if (!targetDept) {
        throw new Error('Dépôt de destination introuvable.');
      }
      if (targetDept.id === deptId) {
        throw new Error('Le dépôt de destination doit être différent du dépôt à supprimer.');
      }

      nonZeroStocks.forEach((s: any) => {
        let targetStock = demoDb.inventory_stocks.find(
          (ts: any) => ts.department_id === targetDept.id && ts.ingredient_id === s.ingredient_id
        );
        if (!targetStock) {
          targetStock = {
            id: demoDb.inventory_stocks.length + 1,
            department_id: targetDept.id,
            ingredient_id: s.ingredient_id,
            quantity: 0.0,
          };
          demoDb.inventory_stocks.push(targetStock);
        }
        const movedQty = parseFloat(s.quantity);
        targetStock.quantity = new Decimal(targetStock.quantity).plus(movedQty).toNumber();
        s.quantity = 0.0;

        const ref = `deletion-transfer-from-${deptId}-to-${targetDept.id}`;
        demoDb.stock_movements.push({
          id: demoDb.stock_movements.length + 1,
          department_id: deptId,
          ingredient_id: s.ingredient_id,
          quantity: -movedQty,
          type: 'transfer_out',
          reference_id: ref,
          created_at: new Date(),
          tenant_id: tid,
        });
        demoDb.stock_movements.push({
          id: demoDb.stock_movements.length + 1,
          department_id: targetDept.id,
          ingredient_id: s.ingredient_id,
          quantity: movedQty,
          type: 'transfer_in',
          reference_id: ref,
          created_at: new Date(),
          tenant_id: tid,
        });
      });
    }

    demoDb.departments.splice(deptIndex, 1);
    demoDb.inventory_stocks = demoDb.inventory_stocks.filter(
      (s: any) => s.department_id !== deptId
    );
    demoDb.transfer_requests = demoDb.transfer_requests.filter(
      (r: any) =>
        r.source_department_id !== deptId && r.destination_department_id !== deptId
    );

    return { success: true, message: 'Dépôt supprimé avec succès.' };
  }

  const deptCheck = await query('SELECT name FROM departments WHERE id = $1 AND tenant_id = $2', [deptId, tid]);
  if (deptCheck.rows.length === 0) {
    throw new Error('Dépôt introuvable.');
  }
  const deptName = deptCheck.rows[0].name;
  if (/central|principal|main/i.test(deptName)) {
    throw new Error('Le dépôt principal ne peut pas être supprimé.');
  }

  const stockCheck = await query(
    'SELECT COUNT(*) FROM inventory_stocks WHERE department_id = $1 AND quantity > 0 AND tenant_id = $2',
    [deptId, tid]
  );
  const hasStock = parseInt(stockCheck.rows[0].count, 10) > 0;

  if (hasStock) {
    if (!transferToId || isNaN(transferToId)) {
      return {
        success: false,
        requiresTransfer: true,
        message:
          'Ce dépôt contient du stock. Veuillez choisir un dépôt de destination pour y transférer les stocks restants.',
      };
    }

    const targetCheck = await query('SELECT id FROM departments WHERE id = $1 AND tenant_id = $2', [transferToId, tid]);
    if (targetCheck.rows.length === 0) {
      throw new Error('Dépôt de destination introuvable.');
    }
    if (transferToId === deptId) {
      throw new Error('Le dépôt de destination doit être différent du dépôt à supprimer.');
    }

    const { client, release } = await getClient();
    try {
      await client.query('BEGIN');

      const stocksToTransfer = await client.query(
        'SELECT ingredient_id, quantity FROM inventory_stocks WHERE department_id = $1 AND quantity > 0 AND tenant_id = $2 FOR UPDATE',
        [deptId, tid]
      );

      for (const row of stocksToTransfer.rows) {
        const ingId = row.ingredient_id;
        const qty = new Decimal(row.quantity);

        await client.query(
          `INSERT INTO inventory_stocks (department_id, ingredient_id, quantity, tenant_id)
           VALUES ($1, $2, 0.0000, $3)
           ON CONFLICT (department_id, ingredient_id) DO NOTHING`,
          [transferToId, ingId, tid]
        );

        await client.query(
          `UPDATE inventory_stocks
           SET quantity = quantity + $1, updated_at = CURRENT_TIMESTAMP
           WHERE department_id = $2 AND ingredient_id = $3 AND tenant_id = $4`,
          [qty.toString(), transferToId, ingId, tid]
        );

        await client.query(
          'UPDATE inventory_stocks SET quantity = 0.0000, updated_at = CURRENT_TIMESTAMP WHERE department_id = $1 AND ingredient_id = $2 AND tenant_id = $3',
          [deptId, ingId, tid]
        );

        const ref = `deletion-transfer-from-${deptId}-to-${transferToId}`;
        await client.query(
          `INSERT INTO stock_movements (department_id, ingredient_id, quantity, type, reference_id, tenant_id)
           VALUES ($1, $2, $3, 'transfer_out', $4, $5)`,
          [deptId, ingId, qty.times(-1).toString(), ref, tid]
        );
        await client.query(
          `INSERT INTO stock_movements (department_id, ingredient_id, quantity, type, reference_id, tenant_id)
           VALUES ($1, $2, $3, 'transfer_in', $4, $5)`,
          [transferToId, ingId, qty.toString(), ref, tid]
        );
      }

      await client.query('DELETE FROM departments WHERE id = $1 AND tenant_id = $2', [deptId, tid]);
      await client.query('COMMIT');

      return { success: true, message: 'Stocks transférés et dépôt supprimé avec succès.' };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      release();
    }
  }

  const result = await query('DELETE FROM departments WHERE id = $1 AND tenant_id = $2 RETURNING id', [deptId, tid]);
  if (result.rows.length === 0) {
    throw new Error('Dépôt introuvable.');
  }

  return { success: true, message: 'Dépôt supprimé avec succès.' };
}

// ──────────────────────────────────────────────
// INGREDIENTS
// ──────────────────────────────────────────────

export async function getAllIngredients(tenantId?: number | null): Promise<any[]> {
  const filter = resolveTenantFilter(tenantId);
  if (isDemoMode) {
    return filter
      ? demoDb.ingredients.filter((i: any) => i.tenant_id === filter)
      : demoDb.ingredients;
  }
  if (filter) {
    const result = await query('SELECT * FROM ingredients WHERE tenant_id = $1 ORDER BY id', [filter]);
    return result.rows;
  }
  const result = await query('SELECT * FROM ingredients ORDER BY id');
  return result.rows;
}

export async function createIngredient(data: {
  name: string;
  unit: string;
  purchase_unit: string;
  purchase_unit_price: number;
  conversion_factor: number;
  alert_threshold?: number;
}, tenantId?: number | null): Promise<any> {
  const {
    name, unit, purchase_unit, purchase_unit_price, conversion_factor, alert_threshold,
  } = data;
  const tid = tenantId ?? 1;

  const basePrice = purchase_unit_price / conversion_factor;

  if (isDemoMode) {
    const newIng = {
      id: demoDb.ingredients.length + 1,
      name, unit,
      purchase_price_per_unit: basePrice,
      alert_threshold: alert_threshold || 0.0,
      purchase_unit: purchase_unit || 'paquet',
      purchase_unit_price, conversion_factor,
      tenant_id: tid,
    };
    demoDb.ingredients.push(newIng);

    demoDb.departments.forEach((d: any) => {
      if (d.stock_type === 'isolated' && d.tenant_id === tid) {
        demoDb.inventory_stocks.push({
          id: demoDb.inventory_stocks.length + 1,
          department_id: d.id,
          ingredient_id: newIng.id,
          quantity: 0.0,
        });
      }
    });

    return newIng;
  }

  const result = await query(
    `INSERT INTO ingredients (name, unit, purchase_price_per_unit, alert_threshold, purchase_unit, purchase_unit_price, conversion_factor, tenant_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [name, unit, basePrice, alert_threshold || 0, purchase_unit || 'paquet', purchase_unit_price, conversion_factor, tid]
  );

  const newIngId = result.rows[0].id;
  const depts = await query("SELECT id FROM departments WHERE stock_type = 'isolated' AND tenant_id = $1", [tid]);
  for (const d of depts.rows) {
    await query(
      `INSERT INTO inventory_stocks (department_id, ingredient_id, quantity, tenant_id)
       VALUES ($1, $2, 0.0000, $3) ON CONFLICT DO NOTHING`,
      [d.id, newIngId, tid]
    );
  }

  return result.rows[0];
}

export async function updateIngredient(
  id: number,
  data: {
    name?: string; unit?: string; purchase_unit?: string;
    purchase_unit_price?: number; conversion_factor?: number; alert_threshold?: number;
  },
  tenantId?: number | null
): Promise<any> {
  const { name, unit, purchase_unit, purchase_unit_price, conversion_factor, alert_threshold } = data;
  const tid = tenantId ?? 1;
  const basePrice = purchase_unit_price ? purchase_unit_price / (conversion_factor || 1) : 0;

  if (isDemoMode) {
    const idx = demoDb.ingredients.findIndex((i: any) => i.id === id && i.tenant_id === tid);
    if (idx === -1) throw new Error('Ingredient not found');
    demoDb.ingredients[idx] = {
      ...demoDb.ingredients[idx],
      name: name || demoDb.ingredients[idx].name,
      unit: unit || demoDb.ingredients[idx].unit,
      purchase_price_per_unit: basePrice || demoDb.ingredients[idx].purchase_price_per_unit,
      alert_threshold: alert_threshold !== undefined ? alert_threshold : demoDb.ingredients[idx].alert_threshold,
      purchase_unit: purchase_unit || demoDb.ingredients[idx].purchase_unit,
      purchase_unit_price: purchase_unit_price !== undefined ? purchase_unit_price : demoDb.ingredients[idx].purchase_unit_price,
      conversion_factor: conversion_factor || demoDb.ingredients[idx].conversion_factor,
    };
    return demoDb.ingredients[idx];
  }

  const result = await query(
    `UPDATE ingredients
     SET name = $1, unit = $2, purchase_price_per_unit = $3, alert_threshold = $4,
         purchase_unit = $5, purchase_unit_price = $6, conversion_factor = $7, updated_at = CURRENT_TIMESTAMP
     WHERE id = $8 AND tenant_id = $9 RETURNING *`,
    [name, unit, basePrice, alert_threshold, purchase_unit, purchase_unit_price, conversion_factor, id, tid]
  );

  if (result.rows.length === 0) throw new Error('Ingredient not found');
  return result.rows[0];
}

export async function deleteIngredient(
  id: number,
  tenantId?: number | null
): Promise<{ success: boolean; message: string; dependencies?: { recipes: string[]; stocks: number } }> {
  const tid = tenantId ?? 1;

  if (isDemoMode) {
    const idx = demoDb.ingredients.findIndex((i: any) => i.id === id && i.tenant_id === tid);
    if (idx === -1) throw new Error('Ingredient not found');

    const relatedRecipes = demoDb.recipe_ingredients
      .filter((ri: any) => ri.ingredient_id === id)
      .map((ri: any) => {
        const recipe = demoDb.recipes.find((r: any) => r.id === ri.recipe_id);
        return recipe ? recipe.name : 'Unknown';
      });

    const relatedStocks = demoDb.inventory_stocks.filter(
      (s: any) => s.ingredient_id === id && parseFloat(s.quantity) > 0
    ).length;

    if (relatedRecipes.length > 0) {
      return {
        success: false,
        message: 'Cet ingrédient est utilisé dans des recettes.',
        dependencies: { recipes: [...new Set(relatedRecipes)], stocks: relatedStocks },
      };
    }

    if (relatedStocks > 0) {
      return {
        success: false,
        message: 'Cet ingrédient a du stock restant dans les dépôts.',
        dependencies: { recipes: [], stocks: relatedStocks },
      };
    }

    demoDb.ingredients.splice(idx, 1);
    demoDb.inventory_stocks = demoDb.inventory_stocks.filter((s: any) => s.ingredient_id !== id);
    return { success: true, message: 'Ingrédient supprimé avec succès.' };
  }

  const recipeCheck = await query(
    `SELECT r.name FROM recipes r
     JOIN recipe_ingredients ri ON r.id = ri.recipe_id
     WHERE ri.ingredient_id = $1 AND r.tenant_id = $2`,
    [id, tid]
  );

  const stockCheck = await query(
    'SELECT COUNT(*) FROM inventory_stocks WHERE ingredient_id = $1 AND tenant_id = $2 AND quantity > 0',
    [id, tid]
  );

  const relatedRecipes = recipeCheck.rows.map((r: any) => r.name);
  const relatedStocks = parseInt(stockCheck.rows[0]?.count || '0', 10);

  if (relatedRecipes.length > 0) {
    return {
      success: false,
      message: 'Cet ingrédient est utilisé dans des recettes.',
      dependencies: { recipes: relatedRecipes, stocks: relatedStocks },
    };
  }

  if (relatedStocks > 0) {
    return {
      success: false,
      message: 'Cet ingrédient a du stock restant dans les dépôts.',
      dependencies: { recipes: [], stocks: relatedStocks },
    };
  }

  const result = await query(
    'DELETE FROM ingredients WHERE id = $1 AND tenant_id = $2 RETURNING id',
    [id, tid]
  );

  if (result.rows.length === 0) throw new Error('Ingredient not found');
  return { success: true, message: 'Ingrédient supprimé avec succès.' };
}

// ──────────────────────────────────────────────
// RECIPES
// ──────────────────────────────────────────────

export async function getAllRecipes(tenantId?: number | null): Promise<any[]> {
  const filter = resolveTenantFilter(tenantId);
  if (isDemoMode) {
    const recipes = filter
      ? demoDb.recipes.filter((r: any) => r.tenant_id === filter)
      : demoDb.recipes;

    return recipes.map((r: any) => {
      const ingredients = demoDb.recipe_ingredients
        .filter((ri: any) => ri.recipe_id === r.id)
        .map((ri: any) => {
          const ing = demoDb.ingredients.find((i: any) => i.id === ri.ingredient_id);
          return {
            ingredient_id: ri.ingredient_id,
            name: ing ? ing.name : 'Unknown',
            quantity_needed: ri.quantity_needed,
            unit: ing ? ing.unit : '',
          };
        });
      return { ...r, ingredients };
    });
  }

  if (filter) {
    const result = await query(`
      SELECT r.*,
             COALESCE(
               json_agg(
                 json_build_object(
                   'ingredient_id', ri.ingredient_id, 'name', i.name,
                   'quantity_needed', ri.quantity_needed, 'unit', i.unit
                 )
               ) FILTER (WHERE ri.id IS NOT NULL), '[]'
             ) as ingredients
      FROM recipes r
      LEFT JOIN recipe_ingredients ri ON r.id = ri.recipe_id
      LEFT JOIN ingredients i ON ri.ingredient_id = i.id
      WHERE r.tenant_id = $1
      GROUP BY r.id ORDER BY r.id
    `, [filter]);
    return result.rows;
  }

  const result = await query(`
    SELECT r.*,
           COALESCE(
             json_agg(
               json_build_object(
                 'ingredient_id', ri.ingredient_id, 'name', i.name,
                 'quantity_needed', ri.quantity_needed, 'unit', i.unit
               )
             ) FILTER (WHERE ri.id IS NOT NULL), '[]'
           ) as ingredients
    FROM recipes r
    LEFT JOIN recipe_ingredients ri ON r.id = ri.recipe_id
    LEFT JOIN ingredients i ON ri.ingredient_id = i.id
    GROUP BY r.id ORDER BY r.id
  `);
  return result.rows;
}

export async function createRecipe(data: { name: string; sale_price: number }, tenantId?: number | null): Promise<any> {
  const { name, sale_price } = data;
  const tid = tenantId ?? 1;

  if (isDemoMode) {
    const newRec = { id: demoDb.recipes.length + 1, name, sale_price, is_active: true, tenant_id: tid };
    demoDb.recipes.push(newRec);
    return newRec;
  }

  const result = await query(
    'INSERT INTO recipes (name, sale_price, tenant_id) VALUES ($1, $2, $3) RETURNING *',
    [name, sale_price, tid]
  );
  return result.rows[0];
}

export async function updateRecipe(
  id: number,
  data: { name?: string; sale_price?: number },
  tenantId?: number | null
): Promise<any> {
  const { name, sale_price } = data;
  const tid = tenantId ?? 1;

  if (isDemoMode) {
    const idx = demoDb.recipes.findIndex((r: any) => r.id === id && r.tenant_id === tid);
    if (idx === -1) throw new Error('Recipe not found');
    demoDb.recipes[idx] = {
      ...demoDb.recipes[idx],
      name: name || demoDb.recipes[idx].name,
      sale_price: sale_price !== undefined ? sale_price : demoDb.recipes[idx].sale_price,
    };
    return demoDb.recipes[idx];
  }

  const result = await query(
    `UPDATE recipes
     SET name = COALESCE($1, name), sale_price = COALESCE($2, sale_price), updated_at = CURRENT_TIMESTAMP
     WHERE id = $3 AND tenant_id = $4 RETURNING *`,
    [name, sale_price, id, tid]
  );

  if (result.rows.length === 0) throw new Error('Recipe not found');
  return result.rows[0];
}

export async function saveRecipeIngredients(
  recipeId: number,
  ingredients: Array<{ ingredient_id: number; quantity_needed: number }>,
  tenantId?: number | null
): Promise<void> {
  if (!ingredients || !Array.isArray(ingredients)) {
    throw new Error('Missing ingredients array');
  }

  const tid = tenantId ?? 1;

  if (isDemoMode) {
    demoDb.recipe_ingredients = demoDb.recipe_ingredients.filter(
      (ri: any) => ri.recipe_id !== recipeId
    );
    ingredients.forEach((item) => {
      demoDb.recipe_ingredients.push({
        id: demoDb.recipe_ingredients.length + 1,
        recipe_id: recipeId,
        ingredient_id: parseInt(item.ingredient_id as any, 10),
        quantity_needed: parseFloat(item.quantity_needed as any),
        tenant_id: tid,
      });
    });
    return;
  }

  const recipeCheck = await query('SELECT id FROM recipes WHERE id = $1 AND tenant_id = $2', [recipeId, tid]);
  if (recipeCheck.rows.length === 0) {
    throw new Error('Recipe not found for this tenant');
  }

  await query('DELETE FROM recipe_ingredients WHERE recipe_id = $1 AND tenant_id = $2', [recipeId, tid]);
  for (const item of ingredients) {
    await query(
      `INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity_needed, tenant_id) VALUES ($1, $2, $3, $4)`,
      [recipeId, item.ingredient_id, item.quantity_needed, tid]
    );
  }
}

// ──────────────────────────────────────────────
// STOCKS
// ──────────────────────────────────────────────

export async function getAllStocks(tenantId?: number | null): Promise<any[]> {
  const filter = resolveTenantFilter(tenantId);
  if (isDemoMode) {
    return demoDb.inventory_stocks.map((st: any) => {
      const ing = demoDb.ingredients.find((i: any) => i.id === st.ingredient_id);
      const dept = demoDb.departments.find((d: any) => d.id === st.department_id);
      return {
        ...st,
        ingredient_name: ing ? ing.name : 'Unknown',
        unit: ing ? ing.unit : '',
        purchase_price_per_unit: ing ? ing.purchase_price_per_unit : 0,
        alert_threshold: ing ? ing.alert_threshold : 0,
        purchase_unit: ing ? ing.purchase_unit : 'paquet',
        conversion_factor: ing ? ing.conversion_factor : 1,
        department_name: dept ? dept.name : 'Unknown',
        stock_type: dept ? dept.stock_type : 'isolated',
      };
    }).filter((st: any) => {
      if (!filter) return true;
      const dept = demoDb.departments.find((d: any) => d.id === st.department_id);
      return dept && dept.tenant_id === filter;
    });
  }

  if (filter) {
    const result = await query(`
      SELECT is_t.*, i.name as ingredient_name, i.unit, i.purchase_price_per_unit,
             i.alert_threshold, i.purchase_unit, i.conversion_factor,
             d.name as department_name, d.stock_type
      FROM inventory_stocks is_t
      JOIN ingredients i ON is_t.ingredient_id = i.id
      JOIN departments d ON is_t.department_id = d.id
      WHERE d.tenant_id = $1
      ORDER BY d.id, i.id
    `, [filter]);
    return result.rows;
  }

  const result = await query(`
    SELECT is_t.*, i.name as ingredient_name, i.unit, i.purchase_price_per_unit,
           i.alert_threshold, i.purchase_unit, i.conversion_factor,
           d.name as department_name, d.stock_type
    FROM inventory_stocks is_t
    JOIN ingredients i ON is_t.ingredient_id = i.id
    JOIN departments d ON is_t.department_id = d.id
    ORDER BY d.id, i.id
  `);
  return result.rows;
}

// ──────────────────────────────────────────────
// MOVEMENTS
// ──────────────────────────────────────────────

export async function getAllMovements(tenantId?: number | null): Promise<any[]> {
  const filter = resolveTenantFilter(tenantId);
  if (isDemoMode) {
    const movements = demoDb.stock_movements.map((sm: any) => {
      const ing = demoDb.ingredients.find((i: any) => i.id === sm.ingredient_id);
      const dept = demoDb.departments.find((d: any) => d.id === sm.department_id);
      return {
        ...sm,
        ingredient_name: ing ? ing.name : 'Unknown',
        unit: ing ? ing.unit : '',
        department_name: dept ? dept.name : 'Unknown',
      };
    }).filter((m: any) => {
      if (!filter) return true;
      const dept = demoDb.departments.find((d: any) => d.id === m.department_id);
      return dept && dept.tenant_id === filter;
    });
    movements.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return movements;
  }

  if (filter) {
    const result = await query(`
      SELECT sm.*, i.name as ingredient_name, i.unit, d.name as department_name
      FROM stock_movements sm
      JOIN ingredients i ON sm.ingredient_id = i.id
      JOIN departments d ON sm.department_id = d.id
      WHERE sm.tenant_id = $1
      ORDER BY sm.created_at DESC
    `, [filter]);
    return result.rows;
  }

  const result = await query(`
    SELECT sm.*, i.name as ingredient_name, i.unit, d.name as department_name
    FROM stock_movements sm
    JOIN ingredients i ON sm.ingredient_id = i.id
    JOIN departments d ON sm.department_id = d.id
    ORDER BY sm.created_at DESC
  `);
  return result.rows;
}

// ──────────────────────────────────────────────
// ADJUSTMENTS (purchase / reconciliation)
// ──────────────────────────────────────────────

export async function adjustStock(data: {
  department_id: number;
  ingredient_id: number;
  quantity: number;
  type: 'purchase' | 'reconciliation';
  reference_id?: string;
}, tenantId?: number | null): Promise<{ new_quantity: number; movement: any }> {
  const { department_id, ingredient_id, quantity, type, reference_id } = data;
  const tid = tenantId ?? 1;

  const deptId = typeof department_id === 'string' ? parseInt(department_id, 10) : department_id;
  const ingId = typeof ingredient_id === 'string' ? parseInt(ingredient_id, 10) : ingredient_id;
  const qtyVal = typeof quantity === 'string' ? parseFloat(quantity) : quantity;

  if (type !== 'purchase' && type !== 'reconciliation') {
    throw new Error('Invalid adjustment type. Must be reconciliation or purchase.');
  }

  if (isDemoMode) {
    const department = demoDb.departments.find((d: any) => d.id === deptId && d.tenant_id === tid);
    if (!department) throw new Error('Department not found');

    const targetDeptId = await getEffectiveDepartmentId(deptId);

    let stock = demoDb.inventory_stocks.find(
      (s: any) => s.department_id === targetDeptId && s.ingredient_id === ingId
    );

    if (!stock) {
      stock = { id: demoDb.inventory_stocks.length + 1, department_id: targetDeptId, ingredient_id: ingId, quantity: 0 };
      demoDb.inventory_stocks.push(stock);
    }

    const currentQty = stock.quantity;
    const newQty = type === 'reconciliation' ? Math.max(0, qtyVal) : Math.max(0, currentQty + qtyVal);
    const delta = newQty - currentQty;
    stock.quantity = newQty;

    const ref = reference_id || (type === 'purchase' ? 'Approvisionnement manuel' : 'Réajustement manuel');
    const movement = {
      id: demoDb.stock_movements.length + 1,
      department_id: targetDeptId, ingredient_id: ingId,
      quantity: delta, type, reference_id: ref,
      created_at: new Date().toISOString(), tenant_id: tid,
    };
    demoDb.stock_movements.push(movement);

    return { new_quantity: newQty, movement };
  }

  const { client, release } = await getClient();
  try {
    await client.query('BEGIN');

    const deptRes = await client.query('SELECT stock_type FROM departments WHERE id = $1 AND tenant_id = $2', [deptId, tid]);
    if (deptRes.rows.length === 0) throw new Error('Department not found');

    let effectiveDeptId = deptId;
    if (deptRes.rows[0].stock_type === 'inherited') {
      const centralDeptRes = await client.query(
        `SELECT id FROM departments WHERE tenant_id = $1 AND (LOWER(name) LIKE '%central%' OR LOWER(name) LIKE '%principal%' OR LOWER(name) LIKE '%main%') LIMIT 1`, [tid]
      );
      if (centralDeptRes.rows.length > 0) {
        effectiveDeptId = centralDeptRes.rows[0].id;
      } else {
        const firstDeptRes = await client.query('SELECT id FROM departments WHERE tenant_id = $1 ORDER BY id LIMIT 1', [tid]);
        effectiveDeptId = firstDeptRes.rows.length > 0 ? firstDeptRes.rows[0].id : 1;
      }
    }

    let stockRes = await client.query(
      'SELECT quantity FROM inventory_stocks WHERE department_id = $1 AND ingredient_id = $2 AND tenant_id = $3 FOR UPDATE',
      [effectiveDeptId, ingId, tid]
    );

    let currentQty = 0;
    if (stockRes.rows.length === 0) {
      await client.query(
        'INSERT INTO inventory_stocks (department_id, ingredient_id, quantity, tenant_id) VALUES ($1, $2, 0.0000, $3)',
        [effectiveDeptId, ingId, tid]
      );
    } else {
      currentQty = parseFloat(stockRes.rows[0].quantity);
    }

    const newQty = type === 'reconciliation' ? Math.max(0, qtyVal) : Math.max(0, currentQty + qtyVal);
    const delta = newQty - currentQty;

    await client.query(
      'UPDATE inventory_stocks SET quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE department_id = $2 AND ingredient_id = $3 AND tenant_id = $4',
      [newQty, effectiveDeptId, ingId, tid]
    );

    const ref = reference_id || (type === 'purchase' ? 'Approvisionnement manuel' : 'Réajustement manuel');
    const movementInsert = await client.query(
      `INSERT INTO stock_movements (department_id, ingredient_id, quantity, type, reference_id, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [effectiveDeptId, ingId, delta, type, ref, tid]
    );

    await client.query('COMMIT');
    return { new_quantity: newQty, movement: movementInsert.rows[0] };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    release();
  }
}
