import { Request, Response } from 'express';
import { dashboardService } from '../services/dashboardService';
import { findProductById, getProductList } from '../services/productService';

/**
 * Handles GET /api/dashboard
 * Returns dashboard summary statistics
 */
export async function dashboardHandler(req: Request, res: Response): Promise<void> {
  try {
    const result = await dashboardService();
    res.status(200).json(result);
  } catch (error) {
    console.error('Error in dashboardHandler:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Handles GET /api/products
 * Returns product list with stock information
 * 
 * Query parameters:
 * - search: string (optional) - Search by product name or barcode
 * - page: number (optional) - Page number (default: 1)
 * - limit: number (optional) - Items per page (default: 20, max: 100)
 * - status: string (optional) - Filter by status: lowStock | nearExpiry | inStock | outOfStock
 */
export async function getProducts(req: Request, res: Response): Promise<void> {
  try {
    // Extract query parameters
    const search = req.query.search as string | undefined;
    const page = req.query.page ? parseInt(req.query.page as string, 10) : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const status = req.query.status as 'lowStock' | 'nearExpiry' | 'inStock' | 'outOfStock' | undefined;

    // Validate pagination parameters
    if (page !== undefined && (isNaN(page) || page < 1)) {
      res.status(400).json({
        error: 'Invalid request: page must be a positive integer',
      });
      return;
    }

    if (limit !== undefined && (isNaN(limit) || limit < 1 || limit > 100)) {
      res.status(400).json({
        error: 'Invalid request: limit must be between 1 and 100',
      });
      return;
    }

    // Validate status parameter
    if (status && !['lowStock', 'nearExpiry', 'inStock', 'outOfStock', 'expired'].includes(status)) {
      res.status(400).json({
        error: 'Invalid request: status must be one of: lowStock, nearExpiry, inStock, outOfStock, expired',
      });
      return;
    }

    // Build query object
    const query: {
      search?: string;
      page?: number;
      limit?: number;
      status?: 'lowStock' | 'nearExpiry' | 'inStock' | 'outOfStock' | 'expired';
    } = {};

    if (search) query.search = search;
    if (page) query.page = page;
    if (limit) query.limit = limit;
    if (status) query.status = status;

    const result = await getProductList(query);
    res.status(200).json(result);
  } catch (error) {
    console.error('Error in getProducts:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}