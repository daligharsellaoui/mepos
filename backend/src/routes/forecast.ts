import { Router, Request, Response } from 'express';
import { authMiddleware } from './auth';
import { getForecast } from '../services/forecast.service';

const router = Router();

router.use(authMiddleware);

/**
 * GET /api/v1/forecast
 * Returns a 7-day moving average forecast with depletion analysis and reorder suggestions.
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const forecast = await getForecast();
    res.json({ status: 'success', data: forecast });
  } catch (error: any) {
    console.error('Error generating forecast:', error);
    res.status(500).json({ status: 'error', message: error.message || 'Erreur lors de la génération des prévisions.' });
  }
});

export default router;
