import { Router } from 'express';
import { createProduct, getStockById, stockInHandler, stockLogsHandler, stockOutHandler, withdrawHandler, depleteHandler, disposeHandler } from '../controllers/stockController';
import { requireAuth, requireRole } from '../middlewares/auth.middleware';

const router = Router();

router.post('/in', requireAuth, requireRole('ADMIN'), stockInHandler);
router.post('/out', requireAuth, stockOutHandler);
router.get('/logs', requireAuth, stockLogsHandler);
router.post('/withdraw', requireAuth, withdrawHandler);
router.post('/deplete', requireAuth, depleteHandler);
router.post('/dispose', requireAuth, requireRole('ADMIN'), disposeHandler);
router.post('/create', requireAuth, requireRole('ADMIN'), createProduct);
router.get('/:stockId', requireAuth, getStockById);

export default router;

