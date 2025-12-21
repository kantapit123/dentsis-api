import { Router } from 'express';
import { stockInHandler, stockOutHandler, stockLogsHandler } from '../controllers/stockController';

const router = Router();

/**
 * POST /api/stock/in
 * Stock-in endpoint for adding inventory
 */
router.post('/in', stockInHandler);

/**
 * POST /api/stock/out
 * Stock-out endpoint with automatic FEFO handling
 */
router.post('/out', stockOutHandler);

/**
 * GET /api/stock/logs
 * Retrieve stock movement logs grouped by sessionId
 */
router.get('/logs', stockLogsHandler);

export default router;

