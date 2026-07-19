import { Router, Request, Response } from 'express';
import { authMiddleware } from './auth';
import { executeTransfer, createTransferRequest, approveTransferRequest, rejectTransferRequest, getTransferRequests } from '../services/transfer.service';

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

  try {
    const transfer = await executeTransfer(
      parseInt(source_department_id, 10),
      parseInt(destination_department_id, 10),
      parseInt(ingredient_id, 10),
      parseFloat(quantity)
    );

    res.json({
      status: 'success',
      message: 'Stock transferred successfully',
      transfer
    });
  } catch (error: any) {
    console.error('Error during transfer:', error);
    res.status(400).json({ status: 'error', message: error.message || 'Error during stock transfer' });
  }
});

/**
 * GET /api/v1/transfers/requests
 * List all transfer requests
 */
router.get('/requests', async (req: Request, res: Response) => {
  try {
    const data = await getTransferRequests();
    res.json({ status: 'success', data });
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

  try {
    const data = await createTransferRequest(
      parseInt(source_department_id, 10),
      parseInt(destination_department_id, 10),
      parseInt(ingredient_id, 10),
      parseFloat(quantity),
      requested_by ? parseInt(requested_by, 10) : null
    );
    res.json({ status: 'success', data });
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

  try {
    const data = await approveTransferRequest(
      parseInt(id, 10),
      validated_by ? parseInt(validated_by, 10) : null
    );
    res.json({ status: 'success', message: 'Request approved and stock transferred successfully', data });
  } catch (error: any) {
    console.error('Error validating request:', error);
    res.status(400).json({ status: 'error', message: error.message || 'Error validating transfer request' });
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
    const data = await rejectTransferRequest(
      parseInt(id, 10),
      validated_by ? parseInt(validated_by, 10) : null
    );
    res.json({ status: 'success', message: 'Transfer request rejected', data });
  } catch (error: any) {
    console.error('Error rejecting request:', error);
    res.status(500).json({ status: 'error', message: error.message || 'Error rejecting transfer request' });
  }
});

export default router;
