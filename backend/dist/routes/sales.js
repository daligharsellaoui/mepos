"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = require("../database");
const decimal_js_1 = __importDefault(require("decimal.js"));
const router = (0, express_1.Router)();
const apiKeyMiddleware = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== process.env.API_KEY) {
        return res.status(401).json({ status: 'error', message: 'Invalid or missing API key' });
    }
    next();
};
router.use(apiKeyMiddleware);
router.post('/sync', async (req, res) => {
    const { department_id, tickets } = req.body;
    if (!department_id || !tickets || !Array.isArray(tickets)) {
        return res.status(400).json({ status: 'error', message: 'Missing department_id or tickets list' });
    }
    // DEMO MODE IN-MEMORY FALLBACK
    if (database_1.isDemoMode) {
        try {
            const department = database_1.demoDb.departments.find(d => d.id === parseInt(department_id, 10));
            if (!department) {
                return res.status(400).json({ status: 'error', message: 'Department not found' });
            }
            const centralDept = database_1.demoDb.departments.find(d => d.name.toLowerCase().includes('central') ||
                d.name.toLowerCase().includes('principal') ||
                d.name.toLowerCase().includes('main')) || database_1.demoDb.departments[0];
            const stockDeptId = department.stock_type === 'inherited' ? (centralDept ? centralDept.id : 1) : department.id;
            const deductedStocks = [];
            const warnings = [];
            let syncedTicketsCount = 0;
            for (const ticket of tickets) {
                const { external_ticket_id, ticket_date, total_amount, items } = ticket;
                if (!external_ticket_id || !items || !Array.isArray(items)) {
                    throw new Error(`Invalid ticket schema for ticket ID: ${external_ticket_id}`);
                }
                // Idempotency check
                const alreadySynced = database_1.demoDb.sales_tickets.some(t => t.department_id === department.id && t.external_ticket_id === external_ticket_id);
                if (alreadySynced) {
                    continue;
                }
                const ticketId = database_1.demoDb.sales_tickets.length + 1;
                database_1.demoDb.sales_tickets.push({
                    id: ticketId,
                    external_ticket_id,
                    department_id: department.id,
                    ticket_date: new Date(ticket_date),
                    total_amount
                });
                for (const item of items) {
                    const { recipe_id, quantity: itemQty, unit_price } = item;
                    database_1.demoDb.sales_ticket_items.push({
                        id: database_1.demoDb.sales_ticket_items.length + 1,
                        sales_ticket_id: ticketId,
                        recipe_id,
                        quantity: itemQty,
                        unit_price
                    });
                    const qtySold = new decimal_js_1.default(itemQty);
                    const qtyServedVal = item.quantity_served !== undefined ? new decimal_js_1.default(item.quantity_served) : qtySold;
                    // Fetch Recipe Ingredients
                    const recipeIngs = database_1.demoDb.recipe_ingredients.filter(ri => ri.recipe_id === recipe_id);
                    for (const recipeIng of recipeIngs) {
                        const ingredientId = recipeIng.ingredient_id;
                        const recipeQtyNeeded = new decimal_js_1.default(recipeIng.quantity_needed);
                        const qtyNeeded = qtySold.times(recipeQtyNeeded);
                        const qtyServed = qtyServedVal.times(recipeQtyNeeded);
                        let finalSaleDeduction = qtyNeeded;
                        let excessQty = new decimal_js_1.default(0);
                        if (qtyServed.greaterThan(qtyNeeded)) {
                            excessQty = qtyServed.minus(qtyNeeded);
                            finalSaleDeduction = qtyNeeded;
                        }
                        else {
                            finalSaleDeduction = qtyServed;
                        }
                        const ingredientInfo = database_1.demoDb.ingredients.find(i => i.id === ingredientId);
                        const purchasePrice = ingredientInfo ? new decimal_js_1.default(ingredientInfo.purchase_price_per_unit) : new decimal_js_1.default(0);
                        // 1. Process Automatic preparation loss if there is excess
                        if (excessQty.greaterThan(0)) {
                            const costLoss = excessQty.times(purchasePrice);
                            // Find recipe with highest price for opportunity loss
                            const recipesUsingIng = database_1.demoDb.recipe_ingredients
                                .filter(ri => ri.ingredient_id === ingredientId)
                                .map(ri => {
                                const rec = database_1.demoDb.recipes.find(r => r.id === ri.recipe_id);
                                return {
                                    ...ri,
                                    sale_price: rec ? rec.sale_price : 0,
                                    recipe_name: rec ? rec.name : ''
                                };
                            })
                                .sort((a, b) => b.sale_price - a.sale_price);
                            let opportunityLoss = new decimal_js_1.default(0);
                            if (recipesUsingIng.length > 0) {
                                const mainRecipe = recipesUsingIng[0];
                                const rQtyNeeded = new decimal_js_1.default(mainRecipe.quantity_needed);
                                const salePrice = new decimal_js_1.default(mainRecipe.sale_price);
                                if (rQtyNeeded.greaterThan(0)) {
                                    opportunityLoss = excessQty.dividedBy(rQtyNeeded).times(salePrice);
                                }
                            }
                            // Insert loss record into demoDb
                            const lossId = database_1.demoDb.ingredient_losses.length + 1;
                            database_1.demoDb.ingredient_losses.push({
                                id: lossId,
                                department_id: department.id,
                                ingredient_id: ingredientId,
                                quantity: excessQty.toNumber(),
                                loss_reason: 'Écart de préparation (Caisse Tactile)',
                                cost_loss: costLoss.toNumber(),
                                opportunity_loss: opportunityLoss.toNumber(),
                                reported_by: null, // detected automatically by system
                                created_at: new Date()
                            });
                            // Deduct stock for the loss (excess)
                            let stockRow = database_1.demoDb.inventory_stocks.find(st => st.department_id === stockDeptId && st.ingredient_id === ingredientId);
                            if (!stockRow) {
                                stockRow = {
                                    id: database_1.demoDb.inventory_stocks.length + 1,
                                    department_id: stockDeptId,
                                    ingredient_id: ingredientId,
                                    quantity: 0.0
                                };
                                database_1.demoDb.inventory_stocks.push(stockRow);
                            }
                            stockRow.quantity = new decimal_js_1.default(stockRow.quantity).minus(excessQty).toNumber();
                            // Log loss movement
                            database_1.demoDb.stock_movements.push({
                                id: database_1.demoDb.stock_movements.length + 1,
                                department_id: stockDeptId,
                                ingredient_id: ingredientId,
                                quantity: excessQty.times(-1).toNumber(),
                                type: 'loss',
                                reference_id: `ticket-loss-${ticketId}`,
                                created_at: new Date()
                            });
                        }
                        // 2. Process standard sale deduction (actual used up to theoretical)
                        let stockRow = database_1.demoDb.inventory_stocks.find(st => st.department_id === stockDeptId && st.ingredient_id === ingredientId);
                        if (!stockRow) {
                            stockRow = {
                                id: database_1.demoDb.inventory_stocks.length + 1,
                                department_id: stockDeptId,
                                ingredient_id: ingredientId,
                                quantity: 0.0
                            };
                            database_1.demoDb.inventory_stocks.push(stockRow);
                        }
                        const currentQty = new decimal_js_1.default(stockRow.quantity);
                        const newQty = currentQty.minus(finalSaleDeduction);
                        stockRow.quantity = newQty.toNumber();
                        // Log movement
                        database_1.demoDb.stock_movements.push({
                            id: database_1.demoDb.stock_movements.length + 1,
                            department_id: stockDeptId,
                            ingredient_id: ingredientId,
                            quantity: finalSaleDeduction.times(-1).toNumber(),
                            type: 'sale_deduction',
                            reference_id: `ticket-${ticketId}`,
                            created_at: new Date()
                        });
                        if (ingredientInfo) {
                            if (newQty.lessThanOrEqualTo(new decimal_js_1.default(ingredientInfo.alert_threshold))) {
                                warnings.push(`Stock critique pour l'ingrédient '${ingredientInfo.name}' dans le département '${department.name}' (Stock restant : ${newQty.toString()})`);
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
                syncedTicketsCount++;
            }
            return res.json({
                status: 'success',
                synced_tickets_count: syncedTicketsCount,
                deducted_stocks: deductedStocks,
                warnings
            });
        }
        catch (error) {
            return res.status(400).json({ status: 'error', message: error.message || 'Error processing sales sync' });
        }
    }
    // POSTGRES ROUTE
    const deptResult = await (0, database_1.query)('SELECT * FROM departments WHERE id = $1', [department_id]);
    if (deptResult.rows.length === 0) {
        return res.status(400).json({ status: 'error', message: 'Department not found' });
    }
    const department = deptResult.rows[0];
    let stockDeptId = department.id;
    if (department.stock_type === 'inherited') {
        const centralDeptRes = await (0, database_1.query)(`SELECT id FROM departments 
       WHERE LOWER(name) LIKE '%central%' OR LOWER(name) LIKE '%principal%' OR LOWER(name) LIKE '%main%'
       LIMIT 1`);
        if (centralDeptRes.rows.length > 0) {
            stockDeptId = centralDeptRes.rows[0].id;
        }
        else {
            const firstDeptRes = await (0, database_1.query)('SELECT id FROM departments ORDER BY id LIMIT 1');
            stockDeptId = firstDeptRes.rows.length > 0 ? firstDeptRes.rows[0].id : 1;
        }
    }
    const { client, release } = await (0, database_1.getClient)();
    const deductedStocks = [];
    const warnings = [];
    let syncedTicketsCount = 0;
    try {
        await client.query('BEGIN');
        for (const ticket of tickets) {
            const { external_ticket_id, ticket_date, total_amount, items } = ticket;
            if (!external_ticket_id || !items || !Array.isArray(items)) {
                throw new Error(`Invalid ticket schema for ticket ID: ${external_ticket_id}`);
            }
            const ticketCheck = await client.query('SELECT id FROM sales_tickets WHERE department_id = $1 AND external_ticket_id = $2', [department_id, external_ticket_id]);
            if (ticketCheck.rows.length > 0) {
                continue;
            }
            const insertTicketRes = await client.query(`INSERT INTO sales_tickets (external_ticket_id, department_id, ticket_date, total_amount)
         VALUES ($1, $2, $3, $4) RETURNING id`, [external_ticket_id, department_id, ticket_date, total_amount]);
            const ticketId = insertTicketRes.rows[0].id;
            for (const item of items) {
                const { recipe_id, quantity: itemQty, unit_price } = item;
                await client.query(`INSERT INTO sales_ticket_items (sales_ticket_id, recipe_id, quantity, unit_price)
           VALUES ($1, $2, $3, $4)`, [ticketId, recipe_id, itemQty, unit_price]);
                const ingredientsRes = await client.query('SELECT ingredient_id, quantity_needed FROM recipe_ingredients WHERE recipe_id = $1', [recipe_id]);
                const qtySold = new decimal_js_1.default(itemQty);
                const qtyServedVal = item.quantity_served !== undefined ? new decimal_js_1.default(item.quantity_served) : qtySold;
                for (const recipeIng of ingredientsRes.rows) {
                    const ingredientId = recipeIng.ingredient_id;
                    const recipeQtyNeeded = new decimal_js_1.default(recipeIng.quantity_needed);
                    const qtyNeeded = qtySold.times(recipeQtyNeeded);
                    const qtyServed = qtyServedVal.times(recipeQtyNeeded);
                    let finalSaleDeduction = qtyNeeded;
                    let excessQty = new decimal_js_1.default(0);
                    if (qtyServed.greaterThan(qtyNeeded)) {
                        excessQty = qtyServed.minus(qtyNeeded);
                        finalSaleDeduction = qtyNeeded;
                    }
                    else {
                        finalSaleDeduction = qtyServed;
                    }
                    // Fetch ingredient info
                    const ingRes = await client.query('SELECT name, alert_threshold, purchase_price_per_unit FROM ingredients WHERE id = $1', [ingredientId]);
                    const ingredientInfo = ingRes.rows[0];
                    // 1. Process Automatic portioning loss if there is excess
                    if (excessQty.greaterThan(0)) {
                        const purchasePrice = new decimal_js_1.default(ingredientInfo.purchase_price_per_unit || 0);
                        const costLoss = excessQty.times(purchasePrice);
                        // Fetch recipe with highest price for opportunity loss
                        const recipeResult = await client.query(`SELECT r.id, r.name, r.sale_price, ri.quantity_needed
               FROM recipe_ingredients ri
               JOIN recipes r ON ri.recipe_id = r.id
               WHERE ri.ingredient_id = $1
               ORDER BY r.sale_price DESC
               LIMIT 1`, [ingredientId]);
                        let opportunityLoss = new decimal_js_1.default(0);
                        if (recipeResult.rows.length > 0) {
                            const mainRecipe = recipeResult.rows[0];
                            const recipeQtyNeeded = new decimal_js_1.default(mainRecipe.quantity_needed);
                            const salePrice = new decimal_js_1.default(mainRecipe.sale_price);
                            if (recipeQtyNeeded.greaterThan(0)) {
                                opportunityLoss = excessQty.dividedBy(recipeQtyNeeded).times(salePrice);
                            }
                        }
                        // Insert loss record
                        await client.query(`INSERT INTO ingredient_losses (department_id, ingredient_id, quantity, loss_reason, cost_loss, opportunity_loss, reported_by)
               VALUES ($1, $2, $3, $4, $5, $6, $7)`, [
                            department.id,
                            ingredientId,
                            excessQty.toString(),
                            'Écart de préparation (Caisse Tactile)',
                            costLoss.toFixed(2),
                            opportunityLoss.toFixed(2),
                            null
                        ]);
                        // Deduct stock for loss (excess)
                        await client.query(`INSERT INTO inventory_stocks (department_id, ingredient_id, quantity)
               VALUES ($1, $2, 0.0000)
               ON CONFLICT (department_id, ingredient_id) DO NOTHING`, [stockDeptId, ingredientId]);
                        await client.query('UPDATE inventory_stocks SET quantity = quantity - $1 WHERE department_id = $2 AND ingredient_id = $3', [excessQty.toString(), stockDeptId, ingredientId]);
                        // Log loss movement
                        await client.query(`INSERT INTO stock_movements (department_id, ingredient_id, quantity, type, reference_id)
               VALUES ($1, $2, $3, 'loss', $4)`, [stockDeptId, ingredientId, excessQty.times(-1).toString(), `ticket-loss-${ticketId}`]);
                    }
                    // 2. Process standard sale deduction (actual used up to theoretical)
                    await client.query(`INSERT INTO inventory_stocks (department_id, ingredient_id, quantity)
             VALUES ($1, $2, 0.0000)
             ON CONFLICT (department_id, ingredient_id) DO NOTHING`, [stockDeptId, ingredientId]);
                    await client.query(`UPDATE inventory_stocks SET quantity = quantity - $1, updated_at = CURRENT_TIMESTAMP
             WHERE department_id = $2 AND ingredient_id = $3`, [finalSaleDeduction.toString(), stockDeptId, ingredientId]);
                    await client.query(`INSERT INTO stock_movements (department_id, ingredient_id, quantity, type, reference_id)
             VALUES ($1, $2, $3, 'sale_deduction', $4)`, [stockDeptId, ingredientId, finalSaleDeduction.times(-1).toString(), `ticket-${ticketId}`]);
                    // Get updated stock quantity for warning
                    const stockCheck = await client.query('SELECT quantity FROM inventory_stocks WHERE department_id = $1 AND ingredient_id = $2', [stockDeptId, ingredientId]);
                    const newQty = new decimal_js_1.default(stockCheck.rows[0].quantity);
                    if (newQty.lessThanOrEqualTo(new decimal_js_1.default(ingredientInfo.alert_threshold))) {
                        warnings.push(`Stock critique pour l'ingrédient '${ingredientInfo.name}' dans le département '${department.name}' (Stock restant : ${newQty.toString()})`);
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
            syncedTicketsCount++;
        }
        await client.query('COMMIT');
        res.json({
            status: 'success',
            synced_tickets_count: syncedTicketsCount,
            deducted_stocks: deductedStocks,
            warnings
        });
    }
    catch (error) {
        await client.query('ROLLBACK');
        console.error('Error syncing sales ticket:', error);
        res.status(400).json({ status: 'error', message: error.message || 'Error executing sync transaction' });
    }
    finally {
        release();
    }
});
/**
 * GET /api/v1/sales/stats
 * Get sales statistics by date range
 */
router.get('/stats', async (req, res) => {
    const getTodayString = () => {
        const d = new Date();
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };
    const startDate = req.query.startDate ? String(req.query.startDate) : getTodayString();
    const endDate = req.query.endDate ? String(req.query.endDate) : getTodayString();
    const startHour = req.query.startHour ? String(req.query.startHour) : '00:00';
    const endHour = req.query.endHour ? String(req.query.endHour) : '23:59';
    const startTimestamp = `${startDate}T${startHour}:00.000Z`;
    const endTimestamp = `${endDate}T${endHour}:59.999Z`;
    try {
        if (database_1.isDemoMode) {
            const tickets = database_1.demoDb.sales_tickets.filter(t => {
                return t.ticket_date >= startTimestamp && t.ticket_date <= endTimestamp;
            });
            const ticketIds = tickets.map(t => t.id);
            const items = database_1.demoDb.sales_ticket_items.filter(item => ticketIds.includes(item.sales_ticket_id));
            const grouped = {};
            items.forEach(item => {
                const recipe = database_1.demoDb.recipes.find(r => r.id === item.recipe_id);
                const rName = recipe ? recipe.name : 'Unknown';
                if (!grouped[item.recipe_id]) {
                    grouped[item.recipe_id] = {
                        recipe_id: item.recipe_id,
                        recipe_name: rName,
                        quantity: 0,
                        unit_price: item.unit_price,
                        total_revenue: 0
                    };
                }
                grouped[item.recipe_id].quantity += parseFloat(item.quantity);
                grouped[item.recipe_id].total_revenue += parseFloat(item.quantity) * parseFloat(item.unit_price);
            });
            const itemsData = Object.values(grouped);
            let totalRevenue = 0;
            let totalItemsSold = 0;
            itemsData.forEach((item) => {
                totalRevenue += item.total_revenue;
                totalItemsSold += item.quantity;
            });
            return res.json({
                status: 'success',
                data: {
                    total_revenue: totalRevenue,
                    total_items_sold: totalItemsSold,
                    items: itemsData
                }
            });
        }
        // Postgres implementation
        const result = await (0, database_1.query)(`
      SELECT 
        i.recipe_id,
        r.name as recipe_name,
        SUM(i.quantity) as quantity,
        AVG(i.unit_price) as unit_price,
        SUM(i.quantity * i.unit_price) as total_revenue
      FROM sales_tickets t
      JOIN sales_ticket_items i ON t.id = i.sales_ticket_id
      JOIN recipes r ON i.recipe_id = r.id
      WHERE t.ticket_date >= $1::timestamptz AND t.ticket_date <= $2::timestamptz
      GROUP BY i.recipe_id, r.name
    `, [startTimestamp, endTimestamp]);
        const itemsData = result.rows.map(row => ({
            recipe_id: row.recipe_id,
            recipe_name: row.recipe_name,
            quantity: parseFloat(row.quantity),
            unit_price: parseFloat(row.unit_price),
            total_revenue: parseFloat(row.total_revenue)
        }));
        let totalRevenue = 0;
        let totalItemsSold = 0;
        itemsData.forEach(item => {
            totalRevenue += item.total_revenue;
            totalItemsSold += item.quantity;
        });
        res.json({
            status: 'success',
            data: {
                total_revenue: totalRevenue,
                total_items_sold: totalItemsSold,
                items: itemsData
            }
        });
    }
    catch (error) {
        console.error('Error fetching sales statistics:', error);
        res.status(500).json({ status: 'error', message: error.message || 'Error fetching sales statistics' });
    }
});
/**
 * GET /api/v1/sales/history
 * Get daily sales totals for the last 7 days
 */
router.get('/history', async (req, res) => {
    try {
        if (database_1.isDemoMode) {
            const dailySales = {};
            // Initialize last 7 days with 0
            for (let i = 6; i >= 0; i--) {
                const d = new Date(Date.now() - i * 24 * 3600 * 1000);
                const dayStr = d.toISOString().split('T')[0];
                dailySales[dayStr] = 0;
            }
            database_1.demoDb.sales_tickets.forEach(t => {
                const dayStr = new Date(t.ticket_date).toISOString().split('T')[0];
                if (dailySales[dayStr] !== undefined) {
                    dailySales[dayStr] += parseFloat(t.total_amount);
                }
            });
            const data = Object.keys(dailySales).map(date => ({
                date,
                revenue: dailySales[date]
            })).sort((a, b) => a.date.localeCompare(b.date));
            return res.json({ status: 'success', data });
        }
        // Postgres Mode
        const result = await (0, database_1.query)(`
      SELECT 
        DATE(ticket_date) as date,
        SUM(total_amount) as revenue
      FROM sales_tickets
      WHERE ticket_date >= CURRENT_DATE - INTERVAL '6 days'
      GROUP BY DATE(ticket_date)
      ORDER BY date ASC
    `);
        const dailySales = {};
        for (let i = 6; i >= 0; i--) {
            const d = new Date(Date.now() - i * 24 * 3600 * 1000);
            const dayStr = d.toISOString().split('T')[0];
            dailySales[dayStr] = 0;
        }
        result.rows.forEach(row => {
            // Format DATE output correctly to YYYY-MM-DD
            const dayStr = new Date(row.date).toISOString().split('T')[0];
            if (dailySales[dayStr] !== undefined) {
                dailySales[dayStr] = parseFloat(row.revenue);
            }
        });
        const data = Object.keys(dailySales).map(date => ({
            date,
            revenue: dailySales[date]
        })).sort((a, b) => a.date.localeCompare(b.date));
        res.json({ status: 'success', data });
    }
    catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});
exports.default = router;
