import { Router } from 'express';
import { createProduct, getStockById, stockInHandler, stockLogsHandler, stockOutHandler, withdrawHandler, depleteHandler } from '../controllers/stockController';
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

/**
 * POST /api/stock/withdraw
 * Withdraw reusable items: warehouse → in-use
 */
router.post('/withdraw', apiKeyGuard, withdrawHandler);

/**
 * POST /api/stock/deplete
 * Deplete reusable items: in-use → consumed
 */
router.post('/deplete', apiKeyGuard, depleteHandler);

router.post('/create', apiKeyGuard, createProduct);

router.get('/:stockId', apiKeyGuard, getStockById);


export default router;

