import { Router, Request, Response } from 'express';
import { getClient, query, isDemoMode, demoDb } from '../database';
import { authMiddleware } from './auth';
import Decimal from 'decimal.js';

const router = Router();

router.use(authMiddleware);

router.get('/', async (req: Request, res: Response) => {
  try {
    if (isDemoMode) {
      const data = demoDb.ingredient_losses.map(il => {
        const ing = demoDb.ingredients.find(i => i.id === il.ingredient_id);
        const dept = demoDb.departments.find(d => d.id === il.department_id);
        const reporter = demoDb.users.find(u => u.id === il.reported_by);
        return {
          ...il,
          ingredient_name: ing ? ing.name : 'Unknown',
          unit: ing ? ing.unit : '',
          department_name: dept ? dept.name : 'Unknown',
          reported_by_username: reporter ? reporter.username : 'Unknown'
        };
      });
      return res.json({ status: 'success', data });
    }

    const result = await query(`
      SELECT il.*, i.name as ingredient_name, i.unit, d.name as department_name, u.username as reported_by_username
      FROM ingredient_losses il
      JOIN ingredients i ON il.ingredient_id = i.id
      JOIN departments d ON il.department_id = d.id
      LEFT JOIN users u ON il.reported_by = u.id
      ORDER BY il.created_at DESC
    `);
    res.json({ status: 'success', data: result.rows });
  } catch (error: any) {
    console.error('Error fetching losses:', error);
    res.status(500).json({ status: 'error', message: error.message || 'Error fetching losses' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  const { department_id, ingredient_id, quantity, loss_reason, reported_by } = req.body;

  if (!department_id || !ingredient_id || !quantity || !loss_reason) {
    return res.status(400).json({ status: 'error', message: 'Missing required fields' });
  }

  // DEMO MODE IN-MEMORY FALLBACK
  if (isDemoMode) {
    try {
      const ingredient = demoDb.ingredients.find(i => i.id === parseInt(ingredient_id, 10));
      if (!ingredient) {
        throw new Error('Ingredient not found');
      }

      const department = demoDb.departments.find(d => d.id === parseInt(department_id, 10));
      if (!department) {
        throw new Error('Department not found');
      }

      const centralDept = demoDb.departments.find(d => 
        d.name.toLowerCase().includes('central') || 
        d.name.toLowerCase().includes('principal') || 
        d.name.toLowerCase().includes('main')
      ) || demoDb.departments[0];
      const stockDeptId = department.stock_type === 'inherited' ? (centralDept ? centralDept.id : 1) : department.id;
      const qtyDecimal = new Decimal(quantity);
      const purchasePriceDecimal = new Decimal(ingredient.purchase_price_per_unit);
      const costLoss = qtyDecimal.times(purchasePriceDecimal);

      // Find recipe with highest price that uses this ingredient
      const recipesUsingIng = demoDb.recipe_ingredients
        .filter(ri => ri.ingredient_id === ingredient.id)
        .map(ri => {
          const rec = demoDb.recipes.find(r => r.id === ri.recipe_id);
          return {
            ...ri,
            sale_price: rec ? rec.sale_price : 0,
            recipe_name: rec ? rec.name : ''
          };
        })
        .sort((a, b) => b.sale_price - a.sale_price);

      let opportunityLoss = new Decimal(0);
      if (recipesUsingIng.length > 0) {
        const mainRecipe = recipesUsingIng[0];
        const quantityNeeded = new Decimal(mainRecipe.quantity_needed);
        const salePrice = new Decimal(mainRecipe.sale_price);

        if (quantityNeeded.greaterThan(0)) {
          const recipesCount = qtyDecimal.dividedBy(quantityNeeded);
          opportunityLoss = recipesCount.times(salePrice);
        }
      }

      // Deduct stock in demo DB
      let stockRow = demoDb.inventory_stocks.find(
        st => st.department_id === stockDeptId && st.ingredient_id === ingredient.id
      );

      if (!stockRow) {
        stockRow = {
          id: demoDb.inventory_stocks.length + 1,
          department_id: stockDeptId,
          ingredient_id: ingredient.id,
          quantity: 0.0
        };
        demoDb.inventory_stocks.push(stockRow);
      }

      stockRow.quantity = new Decimal(stockRow.quantity).minus(qtyDecimal).toNumber();

      // Log movement
      demoDb.stock_movements.push({
        id: demoDb.stock_movements.length + 1,
        department_id: stockDeptId,
        ingredient_id: ingredient.id,
        quantity: qtyDecimal.times(-1).toNumber(),
        type: 'loss',
        reference_id: 'loss_report',
        created_at: new Date()
      });

      // Insert loss record
      const lossRecord = {
        id: demoDb.ingredient_losses.length + 1,
        department_id: department.id,
        ingredient_id: ingredient.id,
        quantity: qtyDecimal.toNumber(),
        loss_reason,
        cost_loss: costLoss.toNumber(),
        opportunity_loss: opportunityLoss.toNumber(),
        reported_by: reported_by ? parseInt(reported_by, 10) : null,
        created_at: new Date()
      };
      demoDb.ingredient_losses.push(lossRecord);

      return res.json({ status: 'success', data: lossRecord });
    } catch (err: any) {
      return res.status(400).json({ status: 'error', message: err.message || 'Error logging loss' });
    }
  }

  // POSTGRES MODE
  const { client, release } = await getClient();
  try {
    await client.query('BEGIN');

    const ingResult = await client.query('SELECT * FROM ingredients WHERE id = $1', [ingredient_id]);
    if (ingResult.rows.length === 0) {
      throw new Error('Ingredient not found');
    }
    const ingredient = ingResult.rows[0];

    const deptResult = await client.query('SELECT * FROM departments WHERE id = $1', [department_id]);
    if (deptResult.rows.length === 0) {
      throw new Error('Department not found');
    }
    const department = deptResult.rows[0];
    let stockDeptId = department.id;
    if (department.stock_type === 'inherited') {
      const centralDeptRes = await client.query(
        `SELECT id FROM departments 
         WHERE LOWER(name) LIKE '%central%' OR LOWER(name) LIKE '%principal%' OR LOWER(name) LIKE '%main%'
         LIMIT 1`
      );
      if (centralDeptRes.rows.length > 0) {
        stockDeptId = centralDeptRes.rows[0].id;
      } else {
        const firstDeptRes = await client.query('SELECT id FROM departments ORDER BY id LIMIT 1');
        stockDeptId = firstDeptRes.rows.length > 0 ? firstDeptRes.rows[0].id : 1;
      }
    }

    const qtyDecimal = new Decimal(quantity);
    const purchasePriceDecimal = new Decimal(ingredient.purchase_price_per_unit);
    const costLoss = qtyDecimal.times(purchasePriceDecimal);

    const recipeResult = await client.query(
      `SELECT r.id, r.name, r.sale_price, ri.quantity_needed
       FROM recipe_ingredients ri
       JOIN recipes r ON ri.recipe_id = r.id
       WHERE ri.ingredient_id = $1
       ORDER BY r.sale_price DESC
       LIMIT 1`,
      [ingredient_id]
    );

    let opportunityLoss = new Decimal(0);
    if (recipeResult.rows.length > 0) {
      const mainRecipe = recipeResult.rows[0];
      const quantityNeeded = new Decimal(mainRecipe.quantity_needed);
      const salePrice = new Decimal(mainRecipe.sale_price);

      if (quantityNeeded.greaterThan(0)) {
        const recipesCount = qtyDecimal.dividedBy(quantityNeeded);
        opportunityLoss = recipesCount.times(salePrice);
      }
    }

    await client.query(
      `INSERT INTO inventory_stocks (department_id, ingredient_id, quantity)
       VALUES ($1, $2, 0.0000)
       ON CONFLICT (department_id, ingredient_id) DO NOTHING`,
      [stockDeptId, ingredient_id]
    );

    const lockStock = await client.query(
      'SELECT quantity FROM inventory_stocks WHERE department_id = $1 AND ingredient_id = $2 FOR UPDATE',
      [stockDeptId, ingredient_id]
    );

    const currentQty = new Decimal(lockStock.rows[0].quantity);
    const newQty = currentQty.minus(qtyDecimal);

    await client.query(
      'UPDATE inventory_stocks SET quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE department_id = $2 AND ingredient_id = $3',
      [newQty.toString(), stockDeptId, ingredient_id]
    );

    await client.query(
      `INSERT INTO stock_movements (department_id, ingredient_id, quantity, type, reference_id)
       VALUES ($1, $2, $3, 'loss', $4)`,
      [stockDeptId, ingredient_id, qtyDecimal.times(-1).toString(), 'loss_report']
    );

    const insertLoss = await client.query(
      `INSERT INTO ingredient_losses (department_id, ingredient_id, quantity, loss_reason, cost_loss, opportunity_loss, reported_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        department_id,
        ingredient_id,
        qtyDecimal.toString(),
        loss_reason,
        costLoss.toFixed(2),
        opportunityLoss.toFixed(2),
        reported_by || null
      ]
    );

    await client.query('COMMIT');
    res.json({ status: 'success', data: insertLoss.rows[0] });
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Error logging loss:', error);
    res.status(400).json({ status: 'error', message: error.message || 'Error logging loss' });
  } finally {
    release();
  }
});

export default router;
