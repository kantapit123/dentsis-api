import { Router } from 'express';
import { dashboardHandler, getProducts, updateProductHandler, deleteProductHandler } from '../controllers/dashboardController';
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

/**
 * PUT /api/products/:id
 * Update product by id
 */
router.put('/products/:id', apiKeyGuard, updateProductHandler);

/**
 * DELETE /api/products/:id
 * Delete product by id
 */
router.delete('/products/:id', apiKeyGuard, deleteProductHandler);

export default router;

