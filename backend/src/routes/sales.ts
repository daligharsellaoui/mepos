import { Router, Request, Response } from 'express';
import { authMiddleware } from './auth';
import { syncTickets, getSalesStats, getSalesHistory } from '../services/sales.service';

const router = Router();

router.use(authMiddleware);

router.post('/sync', async (req: Request, res: Response) => {
  const { department_id, tickets } = req.body;

  if (!department_id || !tickets || !Array.isArray(tickets)) {
    return res.status(400).json({ status: 'error', message: 'Missing department_id or tickets list' });
  }

  try {
    const result = await syncTickets(department_id, tickets);
    res.json({
      status: 'success',
      synced_tickets_count: result.syncedTicketsCount,
      deducted_stocks: result.deductedStocks,
      warnings: result.warnings
    });
  } catch (error: any) {
    console.error('Error syncing sales ticket:', error);
    res.status(400).json({ status: 'error', message: error.message || 'Error processing sales sync' });
  }
});

/**
 * GET /api/v1/sales/stats
 * Get sales statistics by date range
 */
router.get('/stats', async (req: Request, res: Response) => {
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

  try {
    const data = await getSalesStats(startDate, endDate, startHour, endHour);
    res.json({
      status: 'success',
      data: {
        total_revenue: data.totalRevenue,
        total_items_sold: data.totalItemsSold,
        items: data.items
      }
    });
  } catch (error: any) {
    console.error('Error fetching sales statistics:', error);
    res.status(500).json({ status: 'error', message: error.message || 'Error fetching sales statistics' });
  }
});

/**
 * GET /api/v1/sales/history
 * Get daily sales totals for the last 7 days
 */
router.get('/history', async (req: Request, res: Response) => {
  try {
    const data = await getSalesHistory();
    res.json({ status: 'success', data });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

export default router;
