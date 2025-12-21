import { Request, Response } from 'express';
import { dashboardService } from '../services/dashboardService';
import { productListService } from '../services/productListService';

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
 */
export async function productListHandler(req: Request, res: Response): Promise<void> {
  try {
    const result = await productListService();
    res.status(200).json(result);
  } catch (error) {
    console.error('Error in productListHandler:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

