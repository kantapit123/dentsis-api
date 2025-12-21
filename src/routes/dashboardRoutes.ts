import { Router } from 'express';
import { dashboardHandler, getProductById, getProducts } from '../controllers/dashboardController';
import { apiKeyGuard } from '../middlewares/apiKey.middleware';

const router = Router();

/**
 * GET /api/dashboard
 * Dashboard summary endpoint
 */
router.get('/dashboard', apiKeyGuard, dashboardHandler);

/**
 * GET /api/products
 * Product list endpoint
 */
router.get('/products', apiKeyGuard, getProducts);

router.get('/product/:productId', apiKeyGuard, getProductById);

export default router;

