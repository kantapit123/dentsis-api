import { Router } from 'express';
import { stockInHandler, stockOutHandler, stockLogsHandler } from '../controllers/stockController';
import { apiKeyGuard } from '../middlewares/apiKey.middleware';

const router = Router();

/**
 * POST /api/stock/in
 * Stock-in endpoint for adding inventory
 */
router.post('/in', apiKeyGuard, stockInHandler);

/**
 * POST /api/stock/out
 * Stock-out endpoint with automatic FEFO handling
 */
router.post('/out', apiKeyGuard, stockOutHandler);

/**
 * GET /api/stock/logs
 * Retrieve stock movement logs grouped by sessionId
 */
router.get('/logs', apiKeyGuard, stockLogsHandler);


export default router;

