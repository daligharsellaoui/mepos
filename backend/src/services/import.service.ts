import { query, getClient, isDemoMode, demoDb } from '../database';
import { eventBus, Events } from './event.service';

const UNITS = ['kg', 'g', 'l', 'cl', 'ml', 'piece', 'tranche', 'verre', 'pince', 'cuillère', 'sachet'];

/**
 * Generate CSV template for product import
 */
export function generateCsvTemplate(): string {
  const headers = [
    'Product Name',
    'Category',
    'Selling Price',
    'Preparation Time',
    'Ingredient 1',
    'Quantity 1',
    'Unit 1',
    'Ingredient 2',
    'Quantity 2',
    'Unit 2',
    'Ingredient 3',
    'Quantity 3',
    'Unit 3'
  ];

  const sampleRows = [
    [
      'Classic Burger',
      'Burgers',
      '12.50',
      '15',
      'Bœuf haché 15%',
      '200',
      'g',
      'Pain burger',
      '1',
      'piece',
      'Cheddar',
      '2',
      'tranche'
    ],
    [
      'Margherita Pizza',
      'Pizzas',
      '15.00',
      '20',
      'Pâte à pizza',
      '250',
      'g',
      'Sauce tomate',
      '100',
      'g',
      'Mozzarella',
      '125',
      'g'
    ],
    [
      'Caesar Salad',
      'Salads',
      '9.50',
      '10',
      'Laitue romaine',
      '200',
      'g',
      'Parmesan',
      '50',
      'g',
      'Croûtons',
      '30',
      'g'
    ]
  ];

  const lines = [headers.join(',')];
  for (const row of sampleRows) {
    lines.push(row.map(cell => `"${cell}"`).join(','));
  }

  return lines.join('\n');
}

/**
 * Validate CSV data
 */
export async function validateCsv(
  rows: Record<string, string>[],
  tenantId: number
): Promise<{
  valid: boolean;
  rows: any[];
  errors: any[];
  warnings: any[];
}> {
  const errors: any[] = [];
  const warnings: any[] = [];
  const validatedRows: any[] = [];

  // Validate CSV structure - check required columns exist
  if (rows.length > 0) {
    const firstRow = rows[0];
    const requiredColumns = ['Product Name', 'Selling Price'];
    const missingColumns = requiredColumns.filter(col => !(col in firstRow));
    if (missingColumns.length > 0) {
      return {
        valid: false,
        rows: [],
        errors: [{ rowNum: 0, errors: [`Colonnes manquantes: ${missingColumns.join(', ')}`] }],
        warnings: []
      };
    }
  }

  // Get existing recipes and ingredients for duplicate check
  let existingRecipes: string[] = [];
  let existingIngredients: string[] = [];

  if (isDemoMode) {
    existingRecipes = (demoDb.recipes || [])
      .filter((r: any) => r.tenant_id === tenantId)
      .map((r: any) => r.name.toLowerCase());
    existingIngredients = (demoDb.ingredients || [])
      .filter((i: any) => i.tenant_id === tenantId)
      .map((i: any) => i.name.toLowerCase());
  } else {
    const recipesResult = await query(
      'SELECT name FROM recipes WHERE tenant_id = $1',
      [tenantId]
    );
    existingRecipes = recipesResult.rows.map((r: any) => r.name.toLowerCase());

    const ingredientsResult = await query(
      'SELECT name FROM ingredients WHERE tenant_id = $1',
      [tenantId]
    );
    existingIngredients = ingredientsResult.rows.map((i: any) => i.name.toLowerCase());
  }

  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    const rowNum = idx + 1;
    const rowErrors: string[] = [];
    const rowWarnings: string[] = [];

    // Extract product info
    const productName = row['Product Name']?.trim();
    const category = row['Category']?.trim() || '';
    const sellingPrice = parseFloat(row['Selling Price']);
    const prepTime = parseInt(row['Preparation Time'], 10) || 0;

    // Validate product name
    if (!productName) {
      rowErrors.push('Nom du produit manquant');
    } else if (existingRecipes.includes(productName.toLowerCase())) {
      rowWarnings.push(`Produit "${productName}" existe déjà (sera mis à jour)`);
    }

    // Validate selling price
    if (isNaN(sellingPrice) || sellingPrice <= 0) {
      rowErrors.push('Prix de vente invalide ou manquant');
    }

    // Extract ingredients (pairs of name, quantity, unit)
    const ingredients: any[] = [];
    for (let i = 1; i <= 10; i++) {
      const name = row[`Ingredient ${i}`]?.trim();
      const qty = parseFloat(row[`Quantity ${i}`]);
      const unit = row[`Unit ${i}`]?.trim()?.toLowerCase();

      if (!name) continue; // Skip empty ingredient slots

      if (isNaN(qty) || qty <= 0) {
        rowErrors.push(`Quantité invalide pour l'ingrédient "${name}"`);
      }

      if (unit && !UNITS.includes(unit)) {
        rowWarnings.push(`Unité "${unit}" inconnue pour "${name}"`);
      }

      const isNew = !existingIngredients.includes(name.toLowerCase());
      ingredients.push({ name, quantity: qty, unit: unit || 'g', isNew });
    }

    if (ingredients.length === 0) {
      rowErrors.push('Aucun ingrédient défini');
    }

    const ingredientNames = ingredients.map(i => i.name.toLowerCase());
    if (new Set(ingredientNames).size !== ingredientNames.length) {
      rowErrors.push('Ingrédients en double détectés pour ce produit');
    }

    const rowValid = rowErrors.length === 0;

    validatedRows.push({
      rowNum,
      productName,
      category,
      sellingPrice,
      prepTime,
      ingredients,
      valid: rowValid,
      errors: rowErrors,
      warnings: rowWarnings,
      isNewProduct: !existingRecipes.includes(productName?.toLowerCase())
    });

    if (rowErrors.length > 0) {
      errors.push({ rowNum, errors: rowErrors });
    }
    if (rowWarnings.length > 0) {
      warnings.push({ rowNum, warnings: rowWarnings });
    }
  }

  return {
    valid: errors.length === 0,
    rows: validatedRows,
    errors,
    warnings
  };
}

/**
 * Execute the import in a transaction
 */
export async function executeImport(
  rows: any[],
  tenantId: number,
  userId: number
): Promise<{
  productsCreated: number;
  recipesCreated: number;
  ingredientsReused: number;
  ingredientsCreated: number;
  warnings: string[];
  errors: string[];
}> {
  const stats = {
    productsCreated: 0,
    recipesCreated: 0,
    ingredientsReused: 0,
    ingredientsCreated: 0,
    warnings: [] as string[],
    errors: [] as string[]
  };

  if (isDemoMode) {
    // Demo mode: create in-memory records
    for (const row of rows) {
      if (!row.valid) continue;

      // Upsert ingredients
      const ingredientIds: number[] = [];
      for (const ing of row.ingredients) {
        let existing = (demoDb.ingredients || []).find(
          (i: any) => i.tenant_id === tenantId && i.name.toLowerCase() === ing.name.toLowerCase()
        );

        if (existing) {
          ingredientIds.push(existing.id);
          stats.ingredientsReused++;
          eventBus.emit(Events.IMPORT_INGREDIENT_REUSED, {
            tenantId,
            ingredientId: existing.id,
            name: ing.name,
          });
        } else {
          const newId = (demoDb.ingredients || []).length + 1;
          const newIngredient = {
            id: newId,
            tenant_id: tenantId,
            name: ing.name,
            unit: ing.unit || 'g',
            purchase_price_per_unit: 0,
            alert_threshold: 0,
            purchase_unit: 'paquet',
            purchase_unit_price: 0,
            conversion_factor: 1,
            created_at: new Date()
          };
          if (!demoDb.ingredients) (demoDb as any).ingredients = [];
          demoDb.ingredients.push(newIngredient);
          ingredientIds.push(newId);
          stats.ingredientsCreated++;
          eventBus.emit(Events.IMPORT_INGREDIENT_CREATED, {
            tenantId,
            ingredientId: newId,
            name: ing.name,
            source: 'web_application',
          });
        }
      }

      // Create recipe
      const recipeId = (demoDb.recipes || []).length + 1;
      const newRecipe = {
        id: recipeId,
        tenant_id: tenantId,
        name: row.productName,
        sale_price: row.sellingPrice,
        is_active: true,
        created_at: new Date()
      };
      demoDb.recipes.push(newRecipe);
      stats.recipesCreated++;
      stats.productsCreated++;

      // Emit PRODUCT_CREATED event
      eventBus.emit(Events.PRODUCT_CREATED, {
        tenantId,
        productId: recipeId,
        name: row.productName,
        salePrice: row.sellingPrice,
        source: 'web_application',
        createdBy: userId,
      });

      // Create recipe ingredients
      for (let i = 0; i < ingredientIds.length; i++) {
        const ri = {
          id: (demoDb.recipe_ingredients || []).length + 1,
          tenant_id: tenantId,
          recipe_id: recipeId,
          ingredient_id: ingredientIds[i],
          quantity_needed: row.ingredients[i]?.quantity || 0
        };
        if (!demoDb.recipe_ingredients) (demoDb as any).recipe_ingredients = [];
        demoDb.recipe_ingredients.push(ri);
      }
    }
  } else {
    // PostgreSQL mode: use transaction
    const { client, release } = await getClient();
    try {
      await client.query('BEGIN');

      for (const row of rows) {
        if (!row.valid) continue;

        // Upsert ingredients
        const ingredientIds: number[] = [];
        for (const ing of row.ingredients) {
          const existingResult = await client.query(
            'SELECT id FROM ingredients WHERE tenant_id = $1 AND LOWER(name) = LOWER($2)',
            [tenantId, ing.name]
          );

          if (existingResult.rows.length > 0) {
            ingredientIds.push(existingResult.rows[0].id);
            stats.ingredientsReused++;
            eventBus.emit(Events.IMPORT_INGREDIENT_REUSED, {
              tenantId,
              ingredientId: existingResult.rows[0].id,
              name: ing.name,
            });
          } else {
            const newIngResult = await client.query(
              `INSERT INTO ingredients (tenant_id, name, unit, purchase_price_per_unit, alert_threshold, purchase_unit, purchase_unit_price, conversion_factor)
               VALUES ($1, $2, $3, 0, 0, 'paquet', 0, 1)
               RETURNING id`,
              [tenantId, ing.name, ing.unit || 'g']
            );
            ingredientIds.push(newIngResult.rows[0].id);
            stats.ingredientsCreated++;

            // Emit event for new ingredient
            eventBus.emit(Events.INGREDIENT_CREATED, {
              tenantId,
              id: newIngResult.rows[0].id,
              name: ing.name,
              createdBy: userId,
              alertThreshold: 0
            });
            eventBus.emit(Events.IMPORT_INGREDIENT_CREATED, {
              tenantId,
              ingredientId: newIngResult.rows[0].id,
              name: ing.name,
              source: 'web_application',
            });
          }
        }

        // Create recipe
        const recipeResult = await client.query(
          `INSERT INTO recipes (tenant_id, name, sale_price, is_active)
           VALUES ($1, $2, $3, true)
           RETURNING id`,
          [tenantId, row.productName, row.sellingPrice]
        );
        const recipeId = recipeResult.rows[0].id;
        stats.recipesCreated++;
        stats.productsCreated++;

        // Create recipe ingredients (deduplicate by aggregating quantities)
        const ingredientQtyMap = new Map<number, number>();
        for (let i = 0; i < ingredientIds.length; i++) {
          const qty = row.ingredients[i]?.quantity || 0;
          ingredientQtyMap.set(ingredientIds[i], (ingredientQtyMap.get(ingredientIds[i]) || 0) + qty);
        }
        for (const [ingId, qty] of ingredientQtyMap) {
          await client.query(
            `INSERT INTO recipe_ingredients (tenant_id, recipe_id, ingredient_id, quantity_needed)
             VALUES ($1, $2, $3, $4)`,
            [tenantId, recipeId, ingId, qty]
          );
        }

        // Emit product created and recipe created events
        eventBus.emit(Events.PRODUCT_CREATED, {
          tenantId,
          productId: recipeId,
          name: row.productName,
          salePrice: row.sellingPrice,
          source: 'web_application',
          createdBy: userId,
        });
        eventBus.emit(Events.RECIPE_CREATED, {
          tenantId,
          recipeId,
          name: row.productName
        });
      }

      await client.query('COMMIT');
    } catch (error: any) {
      await client.query('ROLLBACK');
      stats.errors.push(`Erreur de transaction: ${error.message}`);
      throw error;
    } finally {
      release();
    }
  }

  return stats;
}
