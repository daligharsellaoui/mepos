import { Decimal } from 'decimal.js';
import { query, isDemoMode, demoDb, getClient } from '../database';
import { eventBus, Events } from './event.service';
import { getTenantSetting } from './tenant.service';

// ======================================================
// STOCK SERVICE
// Centralized stock operations for all business logic
// ======================================================

/**
 * Resolve the effective department ID for stock operations.
 * If department has 'inherited' stock type, route to central department.
 */
export async function getEffectiveDepartmentId(departmentId: number, tenantId?: number): Promise<number> {
  if (isDemoMode) {
    const department = demoDb.departments.find(d => d.id === departmentId);
    if (!department) return departmentId;
    if (department.stock_type !== 'inherited') return department.id;

    const centralDept = demoDb.departments.find(d =>
      d.name.toLowerCase().includes('central') ||
      d.name.toLowerCase().includes('principal') ||
      d.name.toLowerCase().includes('main')
    ) || demoDb.departments[0];
    return centralDept ? centralDept.id : 1;
  }

  const deptResult = tenantId
    ? await query('SELECT stock_type FROM departments WHERE id = $1 AND tenant_id = $2', [departmentId, tenantId])
    : await query('SELECT stock_type FROM departments WHERE id = $1', [departmentId]);
  if (deptResult.rows.length === 0) return departmentId;
  if (deptResult.rows[0].stock_type !== 'inherited') return departmentId;

  const centralDeptRes = tenantId
    ? await query(
        `SELECT id FROM departments
         WHERE (LOWER(name) LIKE '%central%' OR LOWER(name) LIKE '%principal%' OR LOWER(name) LIKE '%main%')
         AND tenant_id = $1 LIMIT 1`,
        [tenantId]
      )
    : await query(
        `SELECT id FROM departments
         WHERE LOWER(name) LIKE '%central%' OR LOWER(name) LIKE '%principal%' OR LOWER(name) LIKE '%main%'
         LIMIT 1`
      );
  if (centralDeptRes.rows.length > 0) return centralDeptRes.rows[0].id;

  const firstDeptRes = tenantId
    ? await query('SELECT id FROM departments WHERE tenant_id = $1 ORDER BY id LIMIT 1', [tenantId])
    : await query('SELECT id FROM departments ORDER BY id LIMIT 1');
  return firstDeptRes.rows.length > 0 ? firstDeptRes.rows[0].id : 1;
}

/**
 * Ensure a stock row exists for (department_id, ingredient_id), creating with 0 if not.
 */
export async function ensureStockRow(
  clientOrDb: any,
  departmentId: number,
  ingredientId: number,
  tenantId?: number
): Promise<void> {
  if (isDemoMode) {
    const exists = demoDb.inventory_stocks.find(
      (s: any) => s.department_id === departmentId && s.ingredient_id === ingredientId
    );
    if (!exists) {
      demoDb.inventory_stocks.push({
        id: demoDb.inventory_stocks.length + 1,
        department_id: departmentId,
        ingredient_id: ingredientId,
        quantity: 0.0
      });
    }
    return;
  }

  const tid = tenantId || 1;
  await clientOrDb.query(
    `INSERT INTO inventory_stocks (department_id, ingredient_id, quantity, tenant_id)
     VALUES ($1, $2, 0.0000, $3)
     ON CONFLICT (tenant_id, department_id, ingredient_id) DO NOTHING`,
    [departmentId, ingredientId, tid]
  );
}

/**
 * Get current stock quantity for a department+ingredient.
 * Accepts optional transaction client for PG mode to maintain transaction isolation.
 */
export async function getStockQuantity(
  departmentId: number,
  ingredientId: number,
  client?: any,
  tenantId?: number
): Promise<Decimal> {
  if (isDemoMode) {
    const stock = demoDb.inventory_stocks.find(
      (s: any) => s.department_id === departmentId && s.ingredient_id === ingredientId
    );
    return new Decimal(stock ? stock.quantity : 0);
  }

  const db = typeof client === 'function' ? client : (client ? client.query.bind(client) : query);
  const tid = tenantId || 1;
  const result = await db(
    'SELECT quantity FROM inventory_stocks WHERE department_id = $1 AND ingredient_id = $2 AND tenant_id = $3',
    [departmentId, ingredientId, tid]
  );
  if (result.rows.length === 0) return new Decimal(0);
  return new Decimal(result.rows[0].quantity);
}

/**
 * Update stock quantity by a delta (+ or -).
 */
export async function updateStockQuantity(
  clientOrDb: any,
  departmentId: number,
  ingredientId: number,
  delta: Decimal,
  tenantId?: number,
  correlationId?: string
): Promise<Decimal> {
  const tid = tenantId || 1;

  if (isDemoMode) {
    const stock = demoDb.inventory_stocks.find(
      (s: any) => s.department_id === departmentId && s.ingredient_id === ingredientId
    );
    if (stock) {
      const newQty = new Decimal(stock.quantity).plus(delta);
      stock.quantity = Math.max(0, newQty.toNumber());
      const finalQty = new Decimal(stock.quantity);
      await getStockWarning(departmentId, ingredientId, undefined, null, tid, correlationId);
      return finalQty;
    }
    await getStockWarning(departmentId, ingredientId, undefined, null, tid, correlationId);
    return new Decimal(0);
  }

  await clientOrDb.query(
    'UPDATE inventory_stocks SET quantity = GREATEST(0, quantity + $1), updated_at = CURRENT_TIMESTAMP WHERE department_id = $2 AND ingredient_id = $3 AND tenant_id = $4',
    [delta.toString(), departmentId, ingredientId, tid]
  );

  const result = await clientOrDb.query(
    'SELECT quantity FROM inventory_stocks WHERE department_id = $1 AND ingredient_id = $2 AND tenant_id = $3',
    [departmentId, ingredientId, tid]
  );
  const finalQty = new Decimal(result.rows[0]?.quantity || 0);
  await getStockWarning(departmentId, ingredientId, undefined, clientOrDb, tid, correlationId);
  return finalQty;
}

/**
 * Log a stock movement (audit trail).
 */
export async function logMovement(
  clientOrDb: any,
  departmentId: number,
  ingredientId: number,
  quantity: Decimal,
  type: string,
  referenceId: string,
  tenantId?: number
): Promise<void> {
  const timestamp = isDemoMode ? new Date() : undefined;

  if (isDemoMode) {
    demoDb.stock_movements.push({
      id: demoDb.stock_movements.length + 1,
      department_id: departmentId,
      ingredient_id: ingredientId,
      quantity: quantity.toNumber(),
      type,
      reference_id: referenceId,
      created_at: timestamp
    });
    return;
  }

  const tid = tenantId || 1;
  await clientOrDb.query(
    `INSERT INTO stock_movements (department_id, ingredient_id, quantity, type, reference_id, tenant_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [departmentId, ingredientId, quantity.toString(), type, referenceId, tid]
  );
}

/**
 * Check if stock is below alert threshold and return warning message.
 * Falls back to tenant setting stock_alert_threshold, then default 10.
 */
export async function getStockWarning(
  departmentId: number,
  ingredientId: number,
  departmentName?: string,
  client?: any,
  tenantId?: number,
  correlationId?: string
): Promise<string | null> {
  let ingredientInfo: any = null;
  let newQty: Decimal;
  const db = typeof client === 'function' ? client : (client ? client.query.bind(client) : query);
  const tid = tenantId || 1;

  if (isDemoMode) {
    ingredientInfo = demoDb.ingredients.find((i: any) => i.id === ingredientId && i.tenant_id === tid);
    if (!ingredientInfo) return null;

    if (!departmentName) {
      const dept = demoDb.departments.find((d: any) => d.id === departmentId);
      departmentName = dept?.name || 'Inconnu';
    }

    const stock = demoDb.inventory_stocks.find(
      (s: any) => s.department_id === departmentId && s.ingredient_id === ingredientId
    );
    newQty = new Decimal(stock ? stock.quantity : 0);
  } else {
    const ingRes = await db(
      'SELECT name, unit, alert_threshold FROM ingredients WHERE id = $1 AND tenant_id = $2',
      [ingredientId, tid]
    );
    if (ingRes.rows.length === 0) return null;
    ingredientInfo = ingRes.rows[0];

    if (!departmentName) {
      const deptRes = await db('SELECT name FROM departments WHERE id = $1 AND tenant_id = $2', [departmentId, tid]);
      departmentName = deptRes.rows[0]?.name || 'Inconnu';
    }

    const stockRes = await db(
      'SELECT quantity FROM inventory_stocks WHERE department_id = $1 AND ingredient_id = $2 AND tenant_id = $3',
      [departmentId, ingredientId, tid]
    );
    newQty = stockRes.rows.length > 0 ? new Decimal(stockRes.rows[0].quantity) : new Decimal(0);
  }

  const ingredientThreshold = new Decimal(ingredientInfo.alert_threshold || 0);
  let effectiveThreshold: Decimal;

  if (ingredientThreshold.greaterThan(0)) {
    effectiveThreshold = ingredientThreshold;
  } else {
    const settingVal = await getTenantSetting(tid, 'notifications', 'stock_alert_threshold');
    effectiveThreshold = new Decimal(settingVal ? parseFloat(settingVal) : 10);
  }    if (newQty.lessThanOrEqualTo(effectiveThreshold)) {
    if (newQty.lessThanOrEqualTo(0)) {
      eventBus.emit(Events.STOCK_OUT, {
        tenantId: tid, ingredientId, ingredientName: ingredientInfo.name,
        remainingQty: newQty.toString(), departmentName, departmentId,
        correlationId,
      });
    } else if (newQty.lessThanOrEqualTo(effectiveThreshold.dividedBy(2))) {
      eventBus.emit(Events.STOCK_CRITICAL, {
        tenantId: tid, ingredientId, ingredientName: ingredientInfo.name,
        remainingQty: newQty.toString(), departmentName, departmentId,
        correlationId,
      });
    } else {
      eventBus.emit(Events.STOCK_LOW, {
        tenantId: tid, ingredientId, ingredientName: ingredientInfo.name,
        remainingQty: newQty.toString(), unit: ingredientInfo.unit || '', departmentName, departmentId,
        correlationId,
      });
    }

    return `Stock critique pour l'ingrédient '${ingredientInfo.name}' dans le département '${departmentName}' (Stock restant : ${newQty.toString()})`;
  }

  // Stock has recovered above threshold — emit recovery event to deactivate old notifications
  if (newQty.greaterThan(effectiveThreshold)) {
    eventBus.emit(Events.STOCK_RECOVERED, {
      tenantId: tid, ingredientId, ingredientName: ingredientInfo.name,
      remainingQty: newQty.toString(), unit: ingredientInfo.unit || '', departmentName, departmentId,
      correlationId,
    });

    // Also emit FORECAST_RESOLVED when stock recovers above threshold
    // (indicates a previously critical forecast alert is now resolved)
    eventBus.emit(Events.FORECAST_RESOLVED, {
      tenantId: tid,
      ingredientId,
      ingredientName: ingredientInfo.name,
      departmentId,
      currentStock: newQty.toNumber(),
      unit: ingredientInfo.unit || '',
    });
  }

  return null;
}

/**
 * Perform a stock deduction for sale (handles theoretical vs served logic).
 * Returns the deducted items and warnings.
 */
export async function processSaleDeduction(
  clientOrDb: any,
  departmentId: number,
  stockDeptId: number,
  departmentName: string,
  items: any[],
  ticketId: number | string,
  tenantId?: number,
  correlationId?: string
): Promise<{ deductedStocks: any[]; warnings: string[] }> {
  if (!tenantId) tenantId = 1;
  const deductedStocks: any[] = [];
  const warnings: string[] = [];
  const tid = tenantId;

  for (const item of items) {
    const { recipe_id, quantity: itemQty } = item;
    const qtySold = new Decimal(itemQty);
    const qtyServedVal = item.quantity_served !== undefined ? new Decimal(item.quantity_served) : qtySold;

    // Fetch recipe ingredients
    let recipeIngs: any[];

    if (isDemoMode) {
      recipeIngs = demoDb.recipe_ingredients.filter((ri: any) => ri.recipe_id === recipe_id);
    } else {
      const ingRes = await clientOrDb.query(
        'SELECT ingredient_id, quantity_needed FROM recipe_ingredients WHERE recipe_id = $1 AND tenant_id = $2',
        [recipe_id, tid]
      );
      recipeIngs = ingRes.rows;
    }

    for (const recipeIng of recipeIngs) {
      const ingredientId = recipeIng.ingredient_id;
      const recipeQtyNeeded = new Decimal(recipeIng.quantity_needed);

      const qtyNeeded = qtySold.times(recipeQtyNeeded);
      const qtyServed = qtyServedVal.times(recipeQtyNeeded);

      let finalSaleDeduction = qtyNeeded;
      let excessQty = new Decimal(0);

      if (qtyServed.greaterThan(qtyNeeded)) {
        excessQty = qtyServed.minus(qtyNeeded);
        finalSaleDeduction = qtyNeeded;
      } else {
        finalSaleDeduction = qtyServed;
      }

      // Handle excess (preparation loss)
      if (excessQty.greaterThan(0)) {
        const { costLoss, opportunityLoss } = await calculateLossCosts(ingredientId, excessQty, tid);

        if (isDemoMode) {
          demoDb.ingredient_losses.push({
            id: demoDb.ingredient_losses.length + 1,
            department_id: departmentId,
            ingredient_id: ingredientId,
            quantity: excessQty.toNumber(),
            loss_reason: 'Écart de préparation (Caisse Tactile)',
            cost_loss: costLoss.toNumber(),
            opportunity_loss: opportunityLoss.toNumber(),
            reported_by: null,
            created_at: new Date()
          });
        } else {
          await clientOrDb.query(
            `INSERT INTO ingredient_losses (department_id, ingredient_id, quantity, loss_reason, cost_loss, opportunity_loss, reported_by, tenant_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [departmentId, ingredientId, excessQty.toString(), 'Écart de préparation (Caisse Tactile)',
             costLoss.toFixed(2), opportunityLoss.toFixed(2), null, tid]
          );
        }

        await ensureStockRow(clientOrDb, stockDeptId, ingredientId, tid);
        await logMovement(clientOrDb, stockDeptId, ingredientId, excessQty.times(-1), 'loss', `ticket-loss-${ticketId}`, tid);
      }

      // Standard deduction
      await ensureStockRow(clientOrDb, stockDeptId, ingredientId, tid);
      await updateStockQuantity(clientOrDb, stockDeptId, ingredientId, finalSaleDeduction.times(-1), tid, correlationId);
      await logMovement(clientOrDb, stockDeptId, ingredientId, finalSaleDeduction.times(-1), 'sale_deduction', `ticket-${ticketId}`, tid);

      // Get ingredient info for response
      let ingredientInfo: any;
      if (isDemoMode) {
        ingredientInfo = demoDb.ingredients.find((i: any) => i.id === ingredientId);
      } else {
        const ingRes = await clientOrDb.query(
          'SELECT name, alert_threshold FROM ingredients WHERE id = $1 AND tenant_id = $2',
          [ingredientId, tid]
        );
        ingredientInfo = ingRes.rows[0];
      }

      const newQty = await getStockQuantity(stockDeptId, ingredientId, clientOrDb, tid);

      if (ingredientInfo) {
        if (newQty.lessThanOrEqualTo(new Decimal(ingredientInfo.alert_threshold))) {
          warnings.push(
            `Stock critique pour l'ingrédient '${ingredientInfo.name}' dans le département '${departmentName}' (Stock restant : ${newQty.toString()})`
          );
        }

        deductedStocks.push({
          ingredient_id: ingredientId,
          name: ingredientInfo.name,
          deducted_quantity: qtyServed.toNumber(),
          remaining_quantity: newQty.toNumber(),
          department_id: stockDeptId
        });
      }
    }
  }

  // Emit SALE_INVENTORY_DEDUCTED to link sale deduction to the activity journal chain
  if (correlationId) {
    eventBus.emit(Events.SALE_INVENTORY_DEDUCTED, {
      tenantId: tid,
      ticketId,
      departmentId,
      correlationId,
      itemsCount: items.length,
      deductedStocks: deductedStocks.length,
    });
  }

  return { deductedStocks, warnings };
}

/**
 * Calculate the double-loss (cost loss + opportunity loss) for a quantity of an ingredient.
 */
export async function calculateLossCosts(
  ingredientId: number,
  quantity: Decimal,
  tenantId?: number
): Promise<{ costLoss: Decimal; opportunityLoss: Decimal }> {
  let purchasePrice: Decimal;
  let bestRecipe: { sale_price: number; quantity_needed: number } | null = null;
  const tid = tenantId || 1;

  if (isDemoMode) {
    const ing = demoDb.ingredients.find((i: any) => i.id === ingredientId && i.tenant_id === tid);
    purchasePrice = ing ? new Decimal(ing.purchase_price_per_unit) : new Decimal(0);

    const recipesUsingIng = demoDb.recipe_ingredients
      .filter((ri: any) => ri.ingredient_id === ingredientId && ri.tenant_id === tid)
      .map((ri: any) => {
        const rec = demoDb.recipes.find((r: any) => r.id === ri.recipe_id && r.tenant_id === tid);
        return { ...ri, sale_price: rec ? rec.sale_price : 0 };
      })
      .sort((a: any, b: any) => b.sale_price - a.sale_price);

    if (recipesUsingIng.length > 0) {
      bestRecipe = { sale_price: recipesUsingIng[0].sale_price, quantity_needed: recipesUsingIng[0].quantity_needed };
    }
  } else {
    const ingRes = await query('SELECT purchase_price_per_unit FROM ingredients WHERE id = $1 AND tenant_id = $2', [ingredientId, tid]);
    purchasePrice = ingRes.rows.length > 0 ? new Decimal(ingRes.rows[0].purchase_price_per_unit) : new Decimal(0);

    const recipeResult = await query(
      `SELECT r.sale_price, ri.quantity_needed
       FROM recipe_ingredients ri
       JOIN recipes r ON ri.recipe_id = r.id
       WHERE ri.ingredient_id = $1 AND r.tenant_id = $2
       ORDER BY r.sale_price DESC
       LIMIT 1`,
      [ingredientId, tid]
    );
    if (recipeResult.rows.length > 0) {
      bestRecipe = recipeResult.rows[0];
    }
  }

  const costLoss = quantity.times(purchasePrice);

  let opportunityLoss = new Decimal(0);
  if (bestRecipe && bestRecipe.quantity_needed > 0) {
    const recipesCount = quantity.dividedBy(bestRecipe.quantity_needed);
    opportunityLoss = recipesCount.times(bestRecipe.sale_price);
  }

  return { costLoss, opportunityLoss };
}
