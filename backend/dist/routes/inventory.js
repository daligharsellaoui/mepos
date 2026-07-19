"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = require("../database");
const decimal_js_1 = __importDefault(require("decimal.js"));
const router = (0, express_1.Router)();
// Middleware to check API key
const apiKeyMiddleware = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== process.env.API_KEY) {
        return res.status(401).json({ status: 'error', message: 'Invalid or missing API key' });
    }
    next();
};
router.use(apiKeyMiddleware);
/**
 * GET /api/v1/departments
 */
router.get('/departments', async (req, res) => {
    try {
        if (database_1.isDemoMode) {
            return res.json({ status: 'success', data: database_1.demoDb.departments });
        }
        const result = await (0, database_1.query)('SELECT * FROM departments ORDER BY id');
        res.json({ status: 'success', data: result.rows });
    }
    catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});
/**
 * POST /api/v1/departments
 */
router.post('/departments', async (req, res) => {
    const { name, stock_type, description } = req.body;
    if (!name || !stock_type) {
        return res.status(400).json({ status: 'error', message: 'Nom et politique de stock requis.' });
    }
    if (stock_type !== 'isolated' && stock_type !== 'inherited') {
        return res.status(400).json({ status: 'error', message: 'Politique de stock invalide.' });
    }
    try {
        if (database_1.isDemoMode) {
            const nameExists = database_1.demoDb.departments.some(d => d.name.toLowerCase() === name.toLowerCase());
            if (nameExists) {
                return res.status(400).json({ status: 'error', message: 'Un dépôt avec ce nom existe déjà.' });
            }
            const newId = database_1.demoDb.departments.length > 0
                ? Math.max(...database_1.demoDb.departments.map(d => d.id)) + 1
                : 1;
            const newDept = {
                id: newId,
                name,
                stock_type,
                description: description || ''
            };
            database_1.demoDb.departments.push(newDept);
            // Auto-create inventory stocks of 0.0000 for all existing ingredients
            database_1.demoDb.ingredients.forEach(ing => {
                const stockId = database_1.demoDb.inventory_stocks.length > 0
                    ? Math.max(...database_1.demoDb.inventory_stocks.map(s => s.id)) + 1
                    : 1;
                database_1.demoDb.inventory_stocks.push({
                    id: stockId,
                    department_id: newId,
                    ingredient_id: ing.id,
                    quantity: 0.0000
                });
            });
            return res.json({ status: 'success', data: newDept });
        }
        // Postgres mode
        const nameCheck = await (0, database_1.query)('SELECT id FROM departments WHERE LOWER(name) = LOWER($1)', [name]);
        if (nameCheck.rows.length > 0) {
            return res.status(400).json({ status: 'error', message: 'Un dépôt avec ce nom existe déjà.' });
        }
        const { client, release } = await (0, database_1.getClient)();
        try {
            await client.query('BEGIN');
            const result = await client.query(`INSERT INTO departments (name, stock_type, description)
         VALUES ($1, $2, $3) RETURNING *`, [name, stock_type, description || null]);
            const newDept = result.rows[0];
            // Auto-create stocks for all existing ingredients
            await client.query(`INSERT INTO inventory_stocks (department_id, ingredient_id, quantity)
         SELECT $1, id, 0.0000 FROM ingredients
         ON CONFLICT (department_id, ingredient_id) DO NOTHING`, [newDept.id]);
            await client.query('COMMIT');
            res.json({ status: 'success', data: newDept });
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            release();
        }
    }
    catch (error) {
        res.status(500).json({ status: 'error', message: error.message || 'Erreur lors de la création du dépôt.' });
    }
});
/**
 * PUT /api/v1/departments/:id
 */
router.put('/departments/:id', async (req, res) => {
    const deptId = parseInt(req.params.id, 10);
    const { name, stock_type, description } = req.body;
    if (isNaN(deptId)) {
        return res.status(400).json({ status: 'error', message: 'ID de dépôt invalide.' });
    }
    if (!name || !stock_type) {
        return res.status(400).json({ status: 'error', message: 'Nom et politique de stock requis.' });
    }
    if (stock_type !== 'isolated' && stock_type !== 'inherited') {
        return res.status(400).json({ status: 'error', message: 'Politique de stock invalide.' });
    }
    try {
        if (database_1.isDemoMode) {
            const deptIndex = database_1.demoDb.departments.findIndex(d => d.id === deptId);
            if (deptIndex === -1) {
                return res.status(404).json({ status: 'error', message: 'Dépôt introuvable.' });
            }
            const nameExists = database_1.demoDb.departments.some(d => d.id !== deptId && d.name.toLowerCase() === name.toLowerCase());
            if (nameExists) {
                return res.status(400).json({ status: 'error', message: 'Un dépôt avec ce nom existe déjà.' });
            }
            const updatedDept = {
                ...database_1.demoDb.departments[deptIndex],
                name,
                stock_type,
                description: description || ''
            };
            database_1.demoDb.departments[deptIndex] = updatedDept;
            return res.json({ status: 'success', data: updatedDept });
        }
        // Postgres mode
        const nameCheck = await (0, database_1.query)('SELECT id FROM departments WHERE id != $1 AND LOWER(name) = LOWER($2)', [deptId, name]);
        if (nameCheck.rows.length > 0) {
            return res.status(400).json({ status: 'error', message: 'Un dépôt avec ce nom existe déjà.' });
        }
        const result = await (0, database_1.query)(`UPDATE departments
       SET name = $1, stock_type = $2, description = $3
       WHERE id = $4 RETURNING *`, [name, stock_type, description || null, deptId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Dépôt introuvable.' });
        }
        res.json({ status: 'success', data: result.rows[0] });
    }
    catch (error) {
        res.status(500).json({ status: 'error', message: error.message || 'Erreur lors de la modification du dépôt.' });
    }
});
/**
 * DELETE /api/v1/departments/:id
 */
router.delete('/departments/:id', async (req, res) => {
    const deptId = parseInt(req.params.id, 10);
    if (isNaN(deptId)) {
        return res.status(400).json({ status: 'error', message: 'ID de dépôt invalide.' });
    }
    try {
        if (database_1.isDemoMode) {
            const deptIndex = database_1.demoDb.departments.findIndex(d => d.id === deptId);
            if (deptIndex === -1) {
                return res.status(404).json({ status: 'error', message: 'Dépôt introuvable.' });
            }
            const dept = database_1.demoDb.departments[deptIndex];
            // Block deletion of main/principal department
            const isCentral = deptId === 1 || /central|principal|main/i.test(dept.name);
            if (isCentral) {
                return res.status(400).json({ status: 'error', message: 'Le dépôt principal ne peut pas être supprimé.' });
            }
            // Check if it has sales or losses referencing it
            const hasSales = database_1.demoDb.sales_tickets.some(t => t.department_id === deptId);
            const hasLosses = database_1.demoDb.ingredient_losses.some(l => l.department_id === deptId);
            if (hasSales || hasLosses) {
                return res.status(400).json({
                    status: 'error',
                    message: 'Ce dépôt est lié à des transactions historiques (ventes ou pertes) et ne peut pas être supprimé.'
                });
            }
            // Check if there is non-zero stock
            const nonZeroStocks = database_1.demoDb.inventory_stocks.filter(s => s.department_id === deptId && parseFloat(s.quantity) > 0);
            if (nonZeroStocks.length > 0) {
                const transferToId = req.query.transfer_to_id ? parseInt(req.query.transfer_to_id, 10) : null;
                if (!transferToId || isNaN(transferToId)) {
                    return res.json({
                        status: 'requires_transfer',
                        message: 'Ce dépôt contient du stock. Veuillez choisir un dépôt de destination pour y transférer les stocks restants.'
                    });
                }
                const targetDept = database_1.demoDb.departments.find(d => d.id === transferToId);
                if (!targetDept) {
                    return res.status(400).json({ status: 'error', message: 'Dépôt de destination introuvable.' });
                }
                if (targetDept.id === deptId) {
                    return res.status(400).json({ status: 'error', message: 'Le dépôt de destination doit être différent du dépôt à supprimer.' });
                }
                // Move stocks to target department
                nonZeroStocks.forEach(s => {
                    let targetStock = database_1.demoDb.inventory_stocks.find(ts => ts.department_id === targetDept.id && ts.ingredient_id === s.ingredient_id);
                    if (!targetStock) {
                        targetStock = {
                            id: database_1.demoDb.inventory_stocks.length + 1,
                            department_id: targetDept.id,
                            ingredient_id: s.ingredient_id,
                            quantity: 0.0
                        };
                        database_1.demoDb.inventory_stocks.push(targetStock);
                    }
                    const movedQty = parseFloat(s.quantity);
                    targetStock.quantity = new decimal_js_1.default(targetStock.quantity).plus(movedQty).toNumber();
                    s.quantity = 0.0;
                    // Log movement
                    const ref = `deletion-transfer-from-${deptId}-to-${targetDept.id}`;
                    database_1.demoDb.stock_movements.push({
                        id: database_1.demoDb.stock_movements.length + 1,
                        department_id: deptId,
                        ingredient_id: s.ingredient_id,
                        quantity: -movedQty,
                        type: 'transfer_out',
                        reference_id: ref,
                        created_at: new Date()
                    });
                    database_1.demoDb.stock_movements.push({
                        id: database_1.demoDb.stock_movements.length + 1,
                        department_id: targetDept.id,
                        ingredient_id: s.ingredient_id,
                        quantity: movedQty,
                        type: 'transfer_in',
                        reference_id: ref,
                        created_at: new Date()
                    });
                });
            }
            // Perform cascade deletion in demo Db
            database_1.demoDb.departments.splice(deptIndex, 1);
            database_1.demoDb.inventory_stocks = database_1.demoDb.inventory_stocks.filter(s => s.department_id !== deptId);
            database_1.demoDb.transfer_requests = database_1.demoDb.transfer_requests.filter(r => r.source_department_id !== deptId && r.destination_department_id !== deptId);
            return res.json({ status: 'success', message: 'Dépôt supprimé avec succès.' });
        }
        // Postgres mode
        const deptCheck = await (0, database_1.query)('SELECT name FROM departments WHERE id = $1', [deptId]);
        if (deptCheck.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Dépôt introuvable.' });
        }
        const deptName = deptCheck.rows[0].name;
        if (deptId === 1 || /central|principal|main/i.test(deptName)) {
            return res.status(400).json({ status: 'error', message: 'Le dépôt principal ne peut pas être supprimé.' });
        }
        // Check if there is non-zero stock
        const stockCheck = await (0, database_1.query)('SELECT COUNT(*) FROM inventory_stocks WHERE department_id = $1 AND quantity > 0', [deptId]);
        const hasStock = parseInt(stockCheck.rows[0].count, 10) > 0;
        if (hasStock) {
            const transferToId = req.query.transfer_to_id ? parseInt(req.query.transfer_to_id, 10) : null;
            if (!transferToId || isNaN(transferToId)) {
                return res.json({
                    status: 'requires_transfer',
                    message: 'Ce dépôt contient du stock. Veuillez choisir un dépôt de destination pour y transférer les stocks restants.'
                });
            }
            const targetCheck = await (0, database_1.query)('SELECT id FROM departments WHERE id = $1', [transferToId]);
            if (targetCheck.rows.length === 0) {
                return res.status(400).json({ status: 'error', message: 'Dépôt de destination introuvable.' });
            }
            if (transferToId === deptId) {
                return res.status(400).json({ status: 'error', message: 'Le dépôt de destination doit être différent du dépôt à supprimer.' });
            }
            // Execute transfers inside a transaction
            const { client, release } = await (0, database_1.getClient)();
            try {
                await client.query('BEGIN');
                // Fetch all non-zero stocks
                const stocksToTransfer = await client.query('SELECT ingredient_id, quantity FROM inventory_stocks WHERE department_id = $1 AND quantity > 0 FOR UPDATE', [deptId]);
                for (const row of stocksToTransfer.rows) {
                    const ingId = row.ingredient_id;
                    const qty = new decimal_js_1.default(row.quantity);
                    // Lock / insert target stock row
                    await client.query(`INSERT INTO inventory_stocks (department_id, ingredient_id, quantity)
             VALUES ($1, $2, 0.0000)
             ON CONFLICT (department_id, ingredient_id) DO NOTHING`, [transferToId, ingId]);
                    // Update target stock
                    await client.query(`UPDATE inventory_stocks 
             SET quantity = quantity + $1, updated_at = CURRENT_TIMESTAMP 
             WHERE department_id = $2 AND ingredient_id = $3`, [qty.toString(), transferToId, ingId]);
                    // Set source stock to 0
                    await client.query('UPDATE inventory_stocks SET quantity = 0.0000, updated_at = CURRENT_TIMESTAMP WHERE department_id = $1 AND ingredient_id = $2', [deptId, ingId]);
                    // Insert stock movements
                    const ref = `deletion-transfer-from-${deptId}-to-${transferToId}`;
                    await client.query(`INSERT INTO stock_movements (department_id, ingredient_id, quantity, type, reference_id)
             VALUES ($1, $2, $3, 'transfer_out', $4)`, [deptId, ingId, qty.times(-1).toString(), ref]);
                    await client.query(`INSERT INTO stock_movements (department_id, ingredient_id, quantity, type, reference_id)
             VALUES ($1, $2, $3, 'transfer_in', $4)`, [transferToId, ingId, qty.toString(), ref]);
                }
                // Delete department
                await client.query('DELETE FROM departments WHERE id = $1', [deptId]);
                await client.query('COMMIT');
                return res.json({ status: 'success', message: 'Stocks transférés et dépôt supprimé avec succès.' });
            }
            catch (err) {
                await client.query('ROLLBACK');
                throw err;
            }
            finally {
                release();
            }
        }
        const result = await (0, database_1.query)('DELETE FROM departments WHERE id = $1 RETURNING id', [deptId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Dépôt introuvable.' });
        }
        res.json({ status: 'success', message: 'Dépôt supprimé avec succès.' });
    }
    catch (error) {
        if (error.code === '23503') {
            return res.status(400).json({
                status: 'error',
                message: 'Ce dépôt est lié à des transactions historiques (ventes, pertes ou mouvements) et ne peut pas être supprimé.'
            });
        }
        res.status(500).json({ status: 'error', message: error.message || 'Erreur lors de la suppression du dépôt.' });
    }
});
/**
 * GET /api/v1/ingredients
 */
router.get('/ingredients', async (req, res) => {
    try {
        if (database_1.isDemoMode) {
            return res.json({ status: 'success', data: database_1.demoDb.ingredients });
        }
        const result = await (0, database_1.query)('SELECT * FROM ingredients ORDER BY id');
        res.json({ status: 'success', data: result.rows });
    }
    catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});
/**
 * GET /api/v1/recipes
 */
router.get('/recipes', async (req, res) => {
    try {
        if (database_1.isDemoMode) {
            const recipes = database_1.demoDb.recipes.map(r => {
                const ingredients = database_1.demoDb.recipe_ingredients
                    .filter(ri => ri.recipe_id === r.id)
                    .map(ri => {
                    const ing = database_1.demoDb.ingredients.find(i => i.id === ri.ingredient_id);
                    return {
                        ingredient_id: ri.ingredient_id,
                        name: ing ? ing.name : 'Unknown',
                        quantity_needed: ri.quantity_needed,
                        unit: ing ? ing.unit : ''
                    };
                });
                return { ...r, ingredients };
            });
            return res.json({ status: 'success', data: recipes });
        }
        const result = await (0, database_1.query)(`
      SELECT r.*, 
             coalesce(
               json_agg(
                 json_build_object(
                   'ingredient_id', ri.ingredient_id,
                   'name', i.name,
                   'quantity_needed', ri.quantity_needed,
                   'unit', i.unit
                 )
               ) FILTER (WHERE ri.id IS NOT NULL), '[]'
             ) as ingredients
      FROM recipes r
      LEFT JOIN recipe_ingredients ri ON r.id = ri.recipe_id
      LEFT JOIN ingredients i ON ri.ingredient_id = i.id
      GROUP BY r.id
      ORDER BY r.id
    `);
        res.json({ status: 'success', data: result.rows });
    }
    catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});
/**
 * GET /api/v1/inventory/stocks
 */
router.get('/stocks', async (req, res) => {
    try {
        if (database_1.isDemoMode) {
            const stocks = database_1.demoDb.inventory_stocks.map(st => {
                const ing = database_1.demoDb.ingredients.find(i => i.id === st.ingredient_id);
                const dept = database_1.demoDb.departments.find(d => d.id === st.department_id);
                return {
                    ...st,
                    ingredient_name: ing ? ing.name : 'Unknown',
                    unit: ing ? ing.unit : '',
                    purchase_price_per_unit: ing ? ing.purchase_price_per_unit : 0,
                    alert_threshold: ing ? ing.alert_threshold : 0,
                    purchase_unit: ing ? ing.purchase_unit : 'paquet',
                    conversion_factor: ing ? ing.conversion_factor : 1,
                    department_name: dept ? dept.name : 'Unknown',
                    stock_type: dept ? dept.stock_type : 'isolated'
                };
            });
            return res.json({ status: 'success', data: stocks });
        }
        const result = await (0, database_1.query)(`
      SELECT is_t.*, i.name as ingredient_name, i.unit, i.purchase_price_per_unit, i.alert_threshold, i.purchase_unit, i.conversion_factor, d.name as department_name, d.stock_type
      FROM inventory_stocks is_t
      JOIN ingredients i ON is_t.ingredient_id = i.id
      JOIN departments d ON is_t.department_id = d.id
      ORDER BY d.id, i.id
    `);
        res.json({ status: 'success', data: result.rows });
    }
    catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});
/**
 * POST /api/v1/ingredients
 */
router.post('/ingredients', async (req, res) => {
    const { name, unit, purchase_unit, purchase_unit_price, conversion_factor, alert_threshold } = req.body;
    if (!name || !unit || purchase_unit_price === undefined || !conversion_factor) {
        return res.status(400).json({ status: 'error', message: 'Missing required fields' });
    }
    const basePrice = purchase_unit_price / conversion_factor;
    try {
        if (database_1.isDemoMode) {
            const newIng = {
                id: database_1.demoDb.ingredients.length + 1,
                name,
                unit,
                purchase_price_per_unit: basePrice,
                alert_threshold: alert_threshold || 0.0,
                purchase_unit: purchase_unit || 'paquet',
                purchase_unit_price,
                conversion_factor
            };
            database_1.demoDb.ingredients.push(newIng);
            // Also initialize stocks to 0 for all departments in demo mode
            database_1.demoDb.departments.forEach(d => {
                if (d.stock_type === 'isolated') {
                    database_1.demoDb.inventory_stocks.push({
                        id: database_1.demoDb.inventory_stocks.length + 1,
                        department_id: d.id,
                        ingredient_id: newIng.id,
                        quantity: 0.0
                    });
                }
            });
            return res.json({ status: 'success', data: newIng });
        }
        const result = await (0, database_1.query)(`INSERT INTO ingredients (name, unit, purchase_price_per_unit, alert_threshold, purchase_unit, purchase_unit_price, conversion_factor)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`, [name, unit, basePrice, alert_threshold || 0, purchase_unit || 'paquet', purchase_unit_price, conversion_factor]);
        // Initialize stocks to 0 in PG as well for isolated departments
        const newIngId = result.rows[0].id;
        const depts = await (0, database_1.query)("SELECT id FROM departments WHERE stock_type = 'isolated'");
        for (const d of depts.rows) {
            await (0, database_1.query)(`INSERT INTO inventory_stocks (department_id, ingredient_id, quantity)
         VALUES ($1, $2, 0.0000) ON CONFLICT DO NOTHING`, [d.id, newIngId]);
        }
        res.json({ status: 'success', data: result.rows[0] });
    }
    catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});
/**
 * PUT /api/v1/ingredients/:id
 */
router.put('/ingredients/:id', async (req, res) => {
    const { id } = req.params;
    const { name, unit, purchase_unit, purchase_unit_price, conversion_factor, alert_threshold } = req.body;
    const basePrice = purchase_unit_price / conversion_factor;
    try {
        if (database_1.isDemoMode) {
            const idx = database_1.demoDb.ingredients.findIndex(i => i.id === parseInt(id, 10));
            if (idx === -1) {
                return res.status(404).json({ status: 'error', message: 'Ingredient not found' });
            }
            database_1.demoDb.ingredients[idx] = {
                ...database_1.demoDb.ingredients[idx],
                name: name || database_1.demoDb.ingredients[idx].name,
                unit: unit || database_1.demoDb.ingredients[idx].unit,
                purchase_price_per_unit: basePrice,
                alert_threshold: alert_threshold !== undefined ? alert_threshold : database_1.demoDb.ingredients[idx].alert_threshold,
                purchase_unit: purchase_unit || database_1.demoDb.ingredients[idx].purchase_unit,
                purchase_unit_price: purchase_unit_price !== undefined ? purchase_unit_price : database_1.demoDb.ingredients[idx].purchase_unit_price,
                conversion_factor: conversion_factor || database_1.demoDb.ingredients[idx].conversion_factor
            };
            return res.json({ status: 'success', data: database_1.demoDb.ingredients[idx] });
        }
        const result = await (0, database_1.query)(`UPDATE ingredients
       SET name = $1, unit = $2, purchase_price_per_unit = $3, alert_threshold = $4,
           purchase_unit = $5, purchase_unit_price = $6, conversion_factor = $7, updated_at = CURRENT_TIMESTAMP
       WHERE id = $8 RETURNING *`, [name, unit, basePrice, alert_threshold, purchase_unit, purchase_unit_price, conversion_factor, id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Ingredient not found' });
        }
        res.json({ status: 'success', data: result.rows[0] });
    }
    catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});
/**
 * POST /api/v1/recipes
 */
router.post('/recipes', async (req, res) => {
    const { name, sale_price } = req.body;
    if (!name || sale_price === undefined) {
        return res.status(400).json({ status: 'error', message: 'Missing name or sale_price' });
    }
    try {
        if (database_1.isDemoMode) {
            const newRec = {
                id: database_1.demoDb.recipes.length + 1,
                name,
                sale_price,
                is_active: true
            };
            database_1.demoDb.recipes.push(newRec);
            return res.json({ status: 'success', data: newRec });
        }
        const result = await (0, database_1.query)('INSERT INTO recipes (name, sale_price) VALUES ($1, $2) RETURNING *', [name, sale_price]);
        res.json({ status: 'success', data: result.rows[0] });
    }
    catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});
/**
 * POST /api/v1/recipes/:id/ingredients
 * Assign ingredients and grammages to a recipe (Fiche Technique)
 */
router.post('/recipes/:id/ingredients', async (req, res) => {
    const { id } = req.params;
    const { ingredients } = req.body; // Array of { ingredient_id, quantity_needed }
    if (!ingredients || !Array.isArray(ingredients)) {
        return res.status(400).json({ status: 'error', message: 'Missing ingredients array' });
    }
    try {
        if (database_1.isDemoMode) {
            const recipeId = parseInt(id, 10);
            // Remove existing ingredients
            database_1.demoDb.recipe_ingredients = database_1.demoDb.recipe_ingredients.filter(ri => ri.recipe_id !== recipeId);
            // Insert new ones
            ingredients.forEach(item => {
                database_1.demoDb.recipe_ingredients.push({
                    id: database_1.demoDb.recipe_ingredients.length + 1,
                    recipe_id: recipeId,
                    ingredient_id: parseInt(item.ingredient_id, 10),
                    quantity_needed: parseFloat(item.quantity_needed)
                });
            });
            return res.json({ status: 'success', message: 'Recipe ingredients updated successfully' });
        }
        const recipeId = parseInt(id, 10);
        // Delete existing
        await (0, database_1.query)('DELETE FROM recipe_ingredients WHERE recipe_id = $1', [recipeId]);
        // Insert new
        for (const item of ingredients) {
            await (0, database_1.query)(`INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity_needed)
         VALUES ($1, $2, $3)`, [recipeId, item.ingredient_id, item.quantity_needed]);
        }
        res.json({ status: 'success', message: 'Recipe ingredients updated successfully' });
    }
    catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});
/**
 * GET /api/v1/movements
 * List all stock movements (detailed history)
 */
router.get('/movements', async (req, res) => {
    try {
        if (database_1.isDemoMode) {
            const movements = database_1.demoDb.stock_movements.map(sm => {
                const ing = database_1.demoDb.ingredients.find(i => i.id === sm.ingredient_id);
                const dept = database_1.demoDb.departments.find(d => d.id === sm.department_id);
                return {
                    ...sm,
                    ingredient_name: ing ? ing.name : 'Unknown',
                    unit: ing ? ing.unit : '',
                    department_name: dept ? dept.name : 'Unknown'
                };
            });
            // Sort by created_at desc
            movements.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            return res.json({ status: 'success', data: movements });
        }
        const result = await (0, database_1.query)(`
      SELECT sm.*, i.name as ingredient_name, i.unit, d.name as department_name
      FROM stock_movements sm
      JOIN ingredients i ON sm.ingredient_id = i.id
      JOIN departments d ON sm.department_id = d.id
      ORDER BY sm.created_at DESC
    `);
        res.json({ status: 'success', data: result.rows });
    }
    catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});
/**
 * POST /api/v1/inventory/adjust
 * Perform a manual stock adjustment or load
 */
router.post('/inventory/adjust', async (req, res) => {
    const { department_id, ingredient_id, quantity, type, reference_id } = req.body;
    if (department_id === undefined || ingredient_id === undefined || quantity === undefined || !type) {
        return res.status(400).json({ status: 'error', message: 'Missing required fields' });
    }
    const deptId = parseInt(department_id, 10);
    const ingId = parseInt(ingredient_id, 10);
    const qtyVal = parseFloat(quantity);
    if (isNaN(qtyVal)) {
        return res.status(400).json({ status: 'error', message: 'Invalid quantity value' });
    }
    if (database_1.isDemoMode) {
        const dept = database_1.demoDb.departments.find(d => d.id === deptId);
        if (!dept) {
            return res.status(404).json({ status: 'error', message: 'Department not found' });
        }
        const centralDept = database_1.demoDb.departments.find(d => d.name.toLowerCase().includes('central') ||
            d.name.toLowerCase().includes('principal') ||
            d.name.toLowerCase().includes('main')) || database_1.demoDb.departments[0];
        const targetDeptId = dept.stock_type === 'inherited' ? (centralDept ? centralDept.id : 1) : dept.id;
        let stock = database_1.demoDb.inventory_stocks.find(s => s.department_id === targetDeptId && s.ingredient_id === ingId);
        if (!stock) {
            stock = {
                id: database_1.demoDb.inventory_stocks.length + 1,
                department_id: targetDeptId,
                ingredient_id: ingId,
                quantity: 0
            };
            database_1.demoDb.inventory_stocks.push(stock);
        }
        const currentQty = stock.quantity;
        let delta = 0;
        let newQty = 0;
        if (type === 'reconciliation') {
            newQty = Math.max(0, qtyVal);
            delta = newQty - currentQty;
        }
        else if (type === 'purchase') {
            newQty = Math.max(0, currentQty + qtyVal);
            delta = newQty - currentQty;
        }
        else {
            return res.status(400).json({ status: 'error', message: 'Invalid adjustment type. Must be reconciliation or purchase.' });
        }
        stock.quantity = newQty;
        const ref = reference_id || (type === 'purchase' ? 'Approvisionnement manuel' : 'Réajustement manuel');
        const movement = {
            id: database_1.demoDb.stock_movements.length + 1,
            department_id: targetDeptId,
            ingredient_id: ingId,
            quantity: delta,
            type,
            reference_id: ref,
            created_at: new Date().toISOString()
        };
        database_1.demoDb.stock_movements.push(movement);
        return res.json({ status: 'success', data: { new_quantity: newQty, movement } });
    }
    const { client, release } = await (0, database_1.getClient)();
    try {
        await client.query('BEGIN');
        const deptRes = await client.query('SELECT stock_type FROM departments WHERE id = $1', [deptId]);
        if (deptRes.rows.length === 0) {
            throw new Error('Department not found');
        }
        let targetDeptId = deptId;
        if (deptRes.rows[0].stock_type === 'inherited') {
            const centralDeptRes = await client.query(`SELECT id FROM departments 
         WHERE LOWER(name) LIKE '%central%' OR LOWER(name) LIKE '%principal%' OR LOWER(name) LIKE '%main%'
         LIMIT 1`);
            if (centralDeptRes.rows.length > 0) {
                targetDeptId = centralDeptRes.rows[0].id;
            }
            else {
                const firstDeptRes = await client.query('SELECT id FROM departments ORDER BY id LIMIT 1');
                targetDeptId = firstDeptRes.rows.length > 0 ? firstDeptRes.rows[0].id : 1;
            }
        }
        let stockRes = await client.query('SELECT quantity FROM inventory_stocks WHERE department_id = $1 AND ingredient_id = $2 FOR UPDATE', [targetDeptId, ingId]);
        let currentQty = 0;
        if (stockRes.rows.length === 0) {
            await client.query('INSERT INTO inventory_stocks (department_id, ingredient_id, quantity) VALUES ($1, $2, 0.0000)', [targetDeptId, ingId]);
            currentQty = 0;
        }
        else {
            currentQty = parseFloat(stockRes.rows[0].quantity);
        }
        let delta = 0;
        const currentQtyParsed = currentQty;
        let newQty = 0;
        if (type === 'reconciliation') {
            newQty = Math.max(0, qtyVal);
            delta = newQty - currentQtyParsed;
        }
        else if (type === 'purchase') {
            newQty = Math.max(0, currentQtyParsed + qtyVal);
            delta = newQty - currentQtyParsed;
        }
        else {
            throw new Error('Invalid adjustment type. Must be reconciliation or purchase.');
        }
        await client.query('UPDATE inventory_stocks SET quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE department_id = $2 AND ingredient_id = $3', [newQty, targetDeptId, ingId]);
        const ref = reference_id || (type === 'purchase' ? 'Approvisionnement manuel' : 'Réajustement manuel');
        const movementInsert = await client.query(`INSERT INTO stock_movements (department_id, ingredient_id, quantity, type, reference_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`, [targetDeptId, ingId, delta, type, ref]);
        await client.query('COMMIT');
        res.json({ status: 'success', data: { new_quantity: newQty, movement: movementInsert.rows[0] } });
    }
    catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ status: 'error', message: error.message });
    }
    finally {
        release();
    }
});
exports.default = router;
