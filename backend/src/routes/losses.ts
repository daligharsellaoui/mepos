import { Router, Request, Response } from 'express';
import { authMiddleware } from './auth';
import { tenantContextMiddleware } from '../middleware/tenantContext';
import { createLoss, getLosses } from '../services/loss.service';

const router = Router();

router.use(authMiddleware);
router.use(tenantContextMiddleware);

router.get('/', async (req: Request, res: Response) => {
  try {
    const data = await getLosses(req.tenantId);
    res.json({ status: 'success', data });
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

  try {
    const data = await createLoss(
      parseInt(department_id, 10),
      parseInt(ingredient_id, 10),
      parseFloat(quantity),
      loss_reason,
      reported_by ? parseInt(reported_by, 10) : null,
      req.tenantId
    );
    res.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Error logging loss:', error);
    res.status(400).json({ status: 'error', message: error.message || 'Error logging loss' });
  }
});

export default router;
