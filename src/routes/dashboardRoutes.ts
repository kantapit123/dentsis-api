import { Router } from 'express';
import { dashboardHandler, productListHandler } from '../controllers/dashboardController';
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
router.get('/products', apiKeyGuard, productListHandler);

export default router;

