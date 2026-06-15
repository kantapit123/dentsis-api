import { Router } from 'express';
import { createProduct, getStockById, stockInHandler, stockLogsHandler, stockOutHandler, withdrawHandler, depleteHandler, disposeHandler } from '../controllers/stockController';
import { requireAuth, requireRole } from '../middlewares/auth.middleware';

const router = Router();

router.post('/in', requireAuth, requireRole('ADMIN', 'STAFF'), stockInHandler);
router.post('/out', requireAuth, stockOutHandler);
router.get('/logs', requireAuth, stockLogsHandler);
router.post('/withdraw', requireAuth, withdrawHandler);
router.post('/deplete', requireAuth, depleteHandler);
router.post('/dispose', requireAuth, requireRole('ADMIN', 'STAFF'), disposeHandler);
router.post('/create', requireAuth, requireRole('ADMIN', 'STAFF'), createProduct);
router.get('/:stockId', requireAuth, getStockById);

export default router;

