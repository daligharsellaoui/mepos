import { Router, Request, Response } from 'express';
import multer from 'multer';
import Papa from 'papaparse';
import { authMiddleware } from './auth';
import { tenantContextMiddleware } from '../middleware/tenantContext';
import { generateCsvTemplate, validateCsv, executeImport } from '../services/import.service';

const router = Router();

router.use(authMiddleware);
router.use(tenantContextMiddleware);

// Configure multer for file upload (in-memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB max
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Seuls les fichiers CSV sont acceptés'));
    }
  }
});

/**
 * GET /import/products/csv-template
 * Generate and download CSV template
 */
router.get('/csv-template', (req: Request, res: Response) => {
  try {
    const csv = generateCsvTemplate();

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="template_produits.csv"');

    // Add BOM for Excel compatibility
    res.send('\uFEFF' + csv);
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * POST /import/products/validate
 * Upload and validate CSV file
 */
router.post('/validate', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ status: 'error', message: 'Aucun fichier fourni' });
    }

    const csvContent = req.file.buffer.toString('utf-8');

    // Parse CSV
    const parsed = Papa.parse(csvContent, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header: string) => header.trim()
    });

    if (parsed.errors.length > 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Erreur de parsing CSV',
        errors: parsed.errors
      });
    }

    const rows = parsed.data as Record<string, string>[];
    const tenantId = (req as any).tenantId;

    const result = await validateCsv(rows, tenantId);

    res.json({
      status: 'success',
      data: result
    });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * POST /import/products/execute
 * Execute the validated import
 */
router.post('/execute', async (req: Request, res: Response) => {
  try {
    const { rows } = req.body;

    if (!rows || !Array.isArray(rows)) {
      return res.status(400).json({ status: 'error', message: 'Données de validation manquantes' });
    }

    const tenantId = (req as any).tenantId;
    const user = (req as any).user;
    const userId = user?.id || 0;

    const result = await executeImport(rows, tenantId, userId);

    res.json({
      status: 'success',
      data: result
    });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

export default router;
