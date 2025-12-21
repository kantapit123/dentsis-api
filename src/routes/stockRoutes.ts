import { Router } from 'express';
import { stockInHandler } from '../controllers/stockController';

const router = Router();

/**
 * POST /api/stock/in
 * Stock-in endpoint for adding inventory
 */
router.post('/in', stockInHandler);

export default router;

