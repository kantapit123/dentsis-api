import { Router } from 'express';
import { dashboardHandler, getProducts, updateProductHandler, deleteProductHandler } from '../controllers/dashboardController';
import { requireAuth, requireRole } from '../middlewares/auth.middleware';

const router = Router();

router.get('/dashboard', requireAuth, dashboardHandler);
router.get('/products', requireAuth, getProducts);
router.put('/products/:id', requireAuth, requireRole('ADMIN', 'STAFF'), updateProductHandler);
router.delete('/products/:id', requireAuth, requireRole('ADMIN'), deleteProductHandler);

export default router;

