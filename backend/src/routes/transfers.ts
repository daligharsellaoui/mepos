import { Router, Request, Response } from 'express';
import { getClient, query, isDemoMode, demoDb } from '../database';
import { authMiddleware } from './auth';
import Decimal from 'decimal.js';

const router = Router();

router.use(authMiddleware);

router.post('/', async (req: Request, res: Response) => {
  const { source_department_id, destination_department_id, ingredient_id, quantity } = req.body;

  if (!source_department_id || !destination_department_id || !ingredient_id || !quantity) {
    return res.status(400).json({ status: 'error', message: 'Missing required fields' });
  }

  if (source_department_id === destination_department_id) {
    return res.status(400).json({ status: 'error', message: 'Source and destination departments must be different' });
  }

  const transferQty = new Decimal(quantity);
  if (transferQty.lessThanOrEqualTo(0)) {
    return res.status(400).json({ status: 'error', message: 'Quantity must be greater than zero' });
  }

  // DEMO MODE IN-MEMORY FALLBACK
  if (isDemoMode) {
    try {
      const srcDept = demoDb.departments.find(d => d.id === parseInt(source_department_id, 10));
      const destDept = demoDb.departments.find(d => d.id === parseInt(destination_department_id, 10));

      if (!srcDept || !destDept) {
        throw new Error('One or both departments do not exist');
      }

      if (srcDept.stock_type === 'inherited' || destDept.stock_type === 'inherited') {
        throw new Error('Cannot transfer stock to or from an inherited stock department');
      }

      // Check source stock
      let srcStock = demoDb.inventory_stocks.find(
        st => st.department_id === srcDept.id && st.ingredient_id === parseInt(ingredient_id, 10)
      );
      if (!srcStock) {
        srcStock = {
          id: demoDb.inventory_stocks.length + 1,
          department_id: srcDept.id,
          ingredient_id: parseInt(ingredient_id, 10),
          quantity: 0.0
        };
        demoDb.inventory_stocks.push(srcStock);
      }

      const srcQty = new Decimal(srcStock.quantity);
      if (srcQty.lessThan(transferQty)) {
        throw new Error(`Stock insuffisant dans le dépôt de départ. Quantité disponible : ${srcQty.toString()}`);
      }

      // Check destination stock
      let destStock = demoDb.inventory_stocks.find(
        st => st.department_id === destDept.id && st.ingredient_id === parseInt(ingredient_id, 10)
      );
      if (!destStock) {
        destStock = {
          id: demoDb.inventory_stocks.length + 1,
          department_id: destDept.id,
          ingredient_id: parseInt(ingredient_id, 10),
          quantity: 0.0
        };
        demoDb.inventory_stocks.push(destStock);
      }

      const destQty = new Decimal(destStock.quantity);

      // Perform transfer
      const newSrcQty = srcQty.minus(transferQty);
      const newDestQty = destQty.plus(transferQty);

      srcStock.quantity = newSrcQty.toNumber();
      destStock.quantity = newDestQty.toNumber();

      // Log movements
      const ref = `transfer-${source_department_id}-to-${destination_department_id}`;
      demoDb.stock_movements.push({
        id: demoDb.stock_movements.length + 1,
        department_id: srcDept.id,
        ingredient_id: parseInt(ingredient_id, 10),
        quantity: transferQty.times(-1).toNumber(),
        type: 'transfer_out',
        reference_id: ref,
        created_at: new Date()
      });

      demoDb.stock_movements.push({
        id: demoDb.stock_movements.length + 1,
        department_id: destDept.id,
        ingredient_id: parseInt(ingredient_id, 10),
        quantity: transferQty.toNumber(),
        type: 'transfer_in',
        reference_id: ref,
        created_at: new Date()
      });

      return res.json({
        status: 'success',
        message: 'Stock transferred successfully',
        transfer: {
          ingredient_id: parseInt(ingredient_id, 10),
          quantity: transferQty.toNumber(),
          source_department_id: srcDept.id,
          destination_department_id: destDept.id,
          new_source_quantity: newSrcQty.toNumber(),
          new_destination_quantity: newDestQty.toNumber()
        }
      });
    } catch (err: any) {
      return res.status(400).json({ status: 'error', message: err.message || 'Error during stock transfer' });
    }
  }

  // POSTGRES MODE
  const { client, release } = await getClient();
  try {
    await client.query('BEGIN');

    const srcDept = await client.query('SELECT * FROM departments WHERE id = $1', [source_department_id]);
    const destDept = await client.query('SELECT * FROM departments WHERE id = $1', [destination_department_id]);

    if (srcDept.rows.length === 0 || destDept.rows.length === 0) {
      throw new Error('One or both departments do not exist');
    }

    if (srcDept.rows[0].stock_type === 'inherited' || destDept.rows[0].stock_type === 'inherited') {
      throw new Error('Cannot transfer stock to or from an inherited stock department');
    }

    await client.query(
      `INSERT INTO inventory_stocks (department_id, ingredient_id, quantity)
       VALUES ($1, $2, 0.0000)
       ON CONFLICT (department_id, ingredient_id) DO NOTHING`,
      [source_department_id, ingredient_id]
    );

    const srcStockRes = await client.query(
      'SELECT quantity FROM inventory_stocks WHERE department_id = $1 AND ingredient_id = $2 FOR UPDATE',
      [source_department_id, ingredient_id]
    );
    const srcQty = new Decimal(srcStockRes.rows[0].quantity);

    if (srcQty.lessThan(transferQty)) {
      throw new Error(`Stock insuffisant dans le dépôt de départ. Quantité disponible : ${srcQty.toString()}`);
    }

    await client.query(
      `INSERT INTO inventory_stocks (department_id, ingredient_id, quantity)
       VALUES ($1, $2, 0.0000)
       ON CONFLICT (department_id, ingredient_id) DO NOTHING`,
      [destination_department_id, ingredient_id]
    );

    const destStockRes = await client.query(
      'SELECT quantity FROM inventory_stocks WHERE department_id = $1 AND ingredient_id = $2 FOR UPDATE',
      [destination_department_id, ingredient_id]
    );
    const destQty = new Decimal(destStockRes.rows[0].quantity);

    const newSrcQty = srcQty.minus(transferQty);
    const newDestQty = destQty.plus(transferQty);

    await client.query(
      'UPDATE inventory_stocks SET quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE department_id = $2 AND ingredient_id = $3',
      [newSrcQty.toString(), source_department_id, ingredient_id]
    );

    await client.query(
      'UPDATE inventory_stocks SET quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE department_id = $2 AND ingredient_id = $3',
      [newDestQty.toString(), destination_department_id, ingredient_id]
    );

    const ref = `transfer-${source_department_id}-to-${destination_department_id}`;
    await client.query(
      `INSERT INTO stock_movements (department_id, ingredient_id, quantity, type, reference_id)
       VALUES ($1, $2, $3, 'transfer_out', $4)`,
      [source_department_id, ingredient_id, transferQty.times(-1).toString(), ref]
    );

    await client.query(
      `INSERT INTO stock_movements (department_id, ingredient_id, quantity, type, reference_id)
       VALUES ($1, $2, $3, 'transfer_in', $4)`,
      [destination_department_id, ingredient_id, transferQty.toString(), ref]
    );

    await client.query('COMMIT');
    res.json({
      status: 'success',
      message: 'Stock transferred successfully',
      transfer: {
        ingredient_id,
        quantity: transferQty.toNumber(),
        source_department_id,
        destination_department_id,
        new_source_quantity: newSrcQty.toNumber(),
        new_destination_quantity: newDestQty.toNumber()
      }
    });
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Error during transfer:', error);
    res.status(400).json({ status: 'error', message: error.message || 'Error during stock transfer' });
  } finally {
    release();
  }
});

/**
 * GET /api/v1/transfers/requests
 * List all transfer requests
 */
router.get('/requests', async (req: Request, res: Response) => {
  try {
    if (isDemoMode) {
      const data = demoDb.transfer_requests.map(tr => {
        const ing = demoDb.ingredients.find(i => i.id === tr.ingredient_id);
        const srcDept = demoDb.departments.find(d => d.id === tr.source_department_id);
        const destDept = demoDb.departments.find(d => d.id === tr.destination_department_id);
        const requester = demoDb.users.find(u => u.id === tr.requested_by);
        const validator = demoDb.users.find(u => u.id === tr.validated_by);
        return {
          ...tr,
          ingredient_name: ing ? ing.name : 'Unknown',
          ingredient_unit: ing ? ing.unit : '',
          source_department_name: srcDept ? srcDept.name : 'Unknown',
          destination_department_name: destDept ? destDept.name : 'Unknown',
          requested_by_username: requester ? requester.username : 'Unknown',
          validated_by_username: validator ? validator.username : null
        };
      });
      // Sort by created_at DESC
      data.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return res.json({ status: 'success', data });
    }

    const result = await query(`
      SELECT 
        tr.*, 
        i.name as ingredient_name, 
        i.unit as ingredient_unit,
        d1.name as source_department_name, 
        d2.name as destination_department_name,
        u1.username as requested_by_username,
        u2.username as validated_by_username
      FROM transfer_requests tr
      JOIN ingredients i ON tr.ingredient_id = i.id
      JOIN departments d1 ON tr.source_department_id = d1.id
      JOIN departments d2 ON tr.destination_department_id = d2.id
      LEFT JOIN users u1 ON tr.requested_by = u1.id
      LEFT JOIN users u2 ON tr.validated_by = u2.id
      ORDER BY tr.created_at DESC
    `);
    res.json({ status: 'success', data: result.rows });
  } catch (error: any) {
    console.error('Error fetching transfer requests:', error);
    res.status(500).json({ status: 'error', message: error.message || 'Error fetching transfer requests' });
  }
});

/**
 * POST /api/v1/transfers/requests
 * Create a new transfer request
 */
router.post('/requests', async (req: Request, res: Response) => {
  const { source_department_id, destination_department_id, ingredient_id, quantity, requested_by } = req.body;

  if (!source_department_id || !destination_department_id || !ingredient_id || !quantity) {
    return res.status(400).json({ status: 'error', message: 'Missing required fields' });
  }

  const reqQty = new Decimal(quantity);
  if (reqQty.lessThanOrEqualTo(0)) {
    return res.status(400).json({ status: 'error', message: 'Quantity must be greater than zero' });
  }

  try {
    if (isDemoMode) {
      const srcDept = demoDb.departments.find(d => d.id === parseInt(source_department_id, 10));
      const destDept = demoDb.departments.find(d => d.id === parseInt(destination_department_id, 10));
      const ing = demoDb.ingredients.find(i => i.id === parseInt(ingredient_id, 10));

      if (!srcDept || !destDept || !ing) {
        return res.status(400).json({ status: 'error', message: 'Invalid department or ingredient ID' });
      }

      const newRequest = {
        id: demoDb.transfer_requests.length + 1,
        source_department_id: parseInt(source_department_id, 10),
        destination_department_id: parseInt(destination_department_id, 10),
        ingredient_id: parseInt(ingredient_id, 10),
        quantity: reqQty.toNumber(),
        status: 'pending',
        requested_by: requested_by ? parseInt(requested_by, 10) : null,
        validated_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      demoDb.transfer_requests.push(newRequest);
      return res.json({ status: 'success', data: newRequest });
    }

    const result = await query(
      `INSERT INTO transfer_requests (source_department_id, destination_department_id, ingredient_id, quantity, status, requested_by)
       VALUES ($1, $2, $3, $4, 'pending', $5) RETURNING *`,
      [source_department_id, destination_department_id, ingredient_id, reqQty.toString(), requested_by || null]
    );
    res.json({ status: 'success', data: result.rows[0] });
  } catch (error: any) {
    console.error('Error creating transfer request:', error);
    res.status(500).json({ status: 'error', message: error.message || 'Error creating transfer request' });
  }
});

/**
 * POST /api/v1/transfers/requests/:id/validate
 * Approve and execute a transfer request
 */
router.post('/requests/:id/validate', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { validated_by } = req.body;

  if (isDemoMode) {
    try {
      const request = demoDb.transfer_requests.find(tr => tr.id === parseInt(id, 10));
      if (!request) {
        return res.status(404).json({ status: 'error', message: 'Transfer request not found' });
      }
      if (request.status !== 'pending') {
        return res.status(400).json({ status: 'error', message: 'Request is not pending validation' });
      }

      const transferQty = new Decimal(request.quantity);

      // Check source stock
      let srcStock = demoDb.inventory_stocks.find(
        st => st.department_id === request.source_department_id && st.ingredient_id === request.ingredient_id
      );
      if (!srcStock) {
        srcStock = {
          id: demoDb.inventory_stocks.length + 1,
          department_id: request.source_department_id,
          ingredient_id: request.ingredient_id,
          quantity: 0.0
        };
        demoDb.inventory_stocks.push(srcStock);
      }

      const srcQty = new Decimal(srcStock.quantity);
      if (srcQty.lessThan(transferQty)) {
        return res.status(400).json({ 
          status: 'error', 
          message: `Stock insuffisant dans le dépôt de départ. Quantité disponible : ${srcQty.toString()}` 
        });
      }

      // Check destination stock
      let destStock = demoDb.inventory_stocks.find(
        st => st.department_id === request.destination_department_id && st.ingredient_id === request.ingredient_id
      );
      if (!destStock) {
        destStock = {
          id: demoDb.inventory_stocks.length + 1,
          department_id: request.destination_department_id,
          ingredient_id: request.ingredient_id,
          quantity: 0.0
        };
        demoDb.inventory_stocks.push(destStock);
      }

      const destQty = new Decimal(destStock.quantity);

      // Execute transfer
      srcStock.quantity = srcQty.minus(transferQty).toNumber();
      destStock.quantity = destQty.plus(transferQty).toNumber();

      // Log movements
      const ref = `transfer-request-${id}`;
      demoDb.stock_movements.push({
        id: demoDb.stock_movements.length + 1,
        department_id: request.source_department_id,
        ingredient_id: request.ingredient_id,
        quantity: transferQty.times(-1).toNumber(),
        type: 'transfer_out',
        reference_id: ref,
        created_at: new Date()
      });

      demoDb.stock_movements.push({
        id: demoDb.stock_movements.length + 1,
        department_id: request.destination_department_id,
        ingredient_id: request.ingredient_id,
        quantity: transferQty.toNumber(),
        type: 'transfer_in',
        reference_id: ref,
        created_at: new Date()
      });

      // Update request status
      request.status = 'approved';
      request.validated_by = validated_by ? parseInt(validated_by, 10) : null;
      request.updated_at = new Date().toISOString();

      return res.json({ status: 'success', message: 'Request approved and stock transferred successfully', data: request });
    } catch (err: any) {
      return res.status(400).json({ status: 'error', message: err.message || 'Error validating transfer request' });
    }
  }

  // POSTGRES TRANSACTION FOR APPROVAL
  const { client, release } = await getClient();
  try {
    await client.query('BEGIN');

    const reqRes = await client.query('SELECT * FROM transfer_requests WHERE id = $1 FOR UPDATE', [id]);
    if (reqRes.rows.length === 0) {
      throw new Error('Transfer request not found');
    }
    const request = reqRes.rows[0];

    if (request.status !== 'pending') {
      throw new Error('Request is not pending validation');
    }

    const transferQty = new Decimal(request.quantity);

    // Lock and check source stock
    await client.query(
      `INSERT INTO inventory_stocks (department_id, ingredient_id, quantity)
       VALUES ($1, $2, 0.0000)
       ON CONFLICT (department_id, ingredient_id) DO NOTHING`,
      [request.source_department_id, request.ingredient_id]
    );

    const srcStockRes = await client.query(
      'SELECT quantity FROM inventory_stocks WHERE department_id = $1 AND ingredient_id = $2 FOR UPDATE',
      [request.source_department_id, request.ingredient_id]
    );
    const srcQty = new Decimal(srcStockRes.rows[0].quantity);

    if (srcQty.lessThan(transferQty)) {
      throw new Error(`Stock insuffisant dans le dépôt de départ. Quantité disponible : ${srcQty.toString()}`);
    }

    // Lock destination stock
    await client.query(
      `INSERT INTO inventory_stocks (department_id, ingredient_id, quantity)
       VALUES ($1, $2, 0.0000)
       ON CONFLICT (department_id, ingredient_id) DO NOTHING`,
      [request.destination_department_id, request.ingredient_id]
    );

    const destStockRes = await client.query(
      'SELECT quantity FROM inventory_stocks WHERE department_id = $1 AND ingredient_id = $2 FOR UPDATE',
      [request.destination_department_id, request.ingredient_id]
    );
    const destQty = new Decimal(destStockRes.rows[0].quantity);

    // Update stocks
    const newSrcQty = srcQty.minus(transferQty);
    const newDestQty = destQty.plus(transferQty);

    await client.query(
      'UPDATE inventory_stocks SET quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE department_id = $2 AND ingredient_id = $3',
      [newSrcQty.toString(), request.source_department_id, request.ingredient_id]
    );

    await client.query(
      'UPDATE inventory_stocks SET quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE department_id = $2 AND ingredient_id = $3',
      [newDestQty.toString(), request.destination_department_id, request.ingredient_id]
    );

    // Log movements
    const ref = `transfer-request-${id}`;
    await client.query(
      `INSERT INTO stock_movements (department_id, ingredient_id, quantity, type, reference_id)
       VALUES ($1, $2, $3, 'transfer_out', $4)`,
      [request.source_department_id, request.ingredient_id, transferQty.times(-1).toString(), ref]
    );

    await client.query(
      `INSERT INTO stock_movements (department_id, ingredient_id, quantity, type, reference_id)
       VALUES ($1, $2, $3, 'transfer_in', $4)`,
      [request.destination_department_id, request.ingredient_id, transferQty.toString(), ref]
    );

    // Update request status
    const updateReqRes = await client.query(
      `UPDATE transfer_requests 
       SET status = 'approved', validated_by = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 RETURNING *`,
      [validated_by || null, id]
    );

    await client.query('COMMIT');
    res.json({ status: 'success', message: 'Request approved and stock transferred successfully', data: updateReqRes.rows[0] });
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Error validating request:', error);
    res.status(400).json({ status: 'error', message: error.message || 'Error validating transfer request' });
  } finally {
    release();
  }
});

/**
 * POST /api/v1/transfers/requests/:id/reject
 * Reject a transfer request
 */
router.post('/requests/:id/reject', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { validated_by } = req.body;

  try {
    if (isDemoMode) {
      const request = demoDb.transfer_requests.find(tr => tr.id === parseInt(id, 10));
      if (!request) {
        return res.status(404).json({ status: 'error', message: 'Transfer request not found' });
      }
      if (request.status !== 'pending') {
        return res.status(400).json({ status: 'error', message: 'Request is not pending validation' });
      }

      request.status = 'rejected';
      request.validated_by = validated_by ? parseInt(validated_by, 10) : null;
      request.updated_at = new Date().toISOString();

      return res.json({ status: 'success', message: 'Transfer request rejected', data: request });
    }

    const result = await query(
      `UPDATE transfer_requests 
       SET status = 'rejected', validated_by = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 AND status = 'pending' RETURNING *`,
      [validated_by || null, id]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ status: 'error', message: 'Request not found or not pending validation' });
    }

    res.json({ status: 'success', message: 'Transfer request rejected', data: result.rows[0] });
  } catch (error: any) {
    console.error('Error rejecting request:', error);
    res.status(500).json({ status: 'error', message: error.message || 'Error rejecting transfer request' });
  }
});

export default router;
