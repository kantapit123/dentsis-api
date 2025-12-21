import { Request, Response } from 'express';
import { stockInService } from '../services/stockInService';
import { stockOutService } from '../services/stockOutService';
import { stockLogService } from '../services/stockLogService';
import { StockInRequest, StockOutRequest } from '../types/stock.types';
import { Product } from '@prisma/client';
import { prisma } from '../prisma';
import { findProductById } from '../services/productService';

/**
 * Handles POST /api/stock/in
 * Processes stock-in operations for one or more items
 */
export async function stockInHandler(req: Request, res: Response): Promise<void> {
  try {
    const body: StockInRequest = req.body;

    // Validate request body
    if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
      res.status(400).json({
        error: 'Invalid request: items array is required and must not be empty',
      });
      return;
    }

    // Validate each item
    for (const item of body.items) {
      if (!item.barcode || typeof item.barcode !== 'string') {
        res.status(400).json({
          error: 'Invalid request: each item must have a valid barcode',
        });
        return;
      }

      if (!item.quantity || typeof item.quantity !== 'number' || item.quantity <= 0) {
        res.status(400).json({
          error: 'Invalid request: each item must have a positive quantity',
        });
        return;
      }

      if (!item.lotNumber || typeof item.lotNumber !== 'string') {
        res.status(400).json({
          error: 'Invalid request: each item must have a valid lotNumber',
        });
        return;
      }

      // Validate expireDate - can be null or a valid date string
      if (item.expireDate !== null && item.expireDate !== undefined) {
        if (typeof item.expireDate !== 'string') {
          res.status(400).json({
            error: 'Invalid request: expireDate must be a string or null',
          });
          return;
        }

        // Validate date format if provided
        const expireDate = new Date(item.expireDate);
        if (isNaN(expireDate.getTime())) {
          res.status(400).json({
            error: 'Invalid request: expireDate must be a valid ISO date string or null',
          });
          return;
        }
      }
    }

    // Process stock-in
    const result = await stockInService(body.items);

    // Check if all items succeeded
    const allSucceeded = result.results.every((r) => r.success);
    const statusCode = allSucceeded ? 200 : 207; // 207 Multi-Status if some failed

    res.status(statusCode).json(result);
  } catch (error) {
    console.error('Error in stockInHandler:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Handles POST /api/stock/out
 * Processes stock-out operations with automatic FEFO handling
 */
export async function stockOutHandler(req: Request, res: Response): Promise<void> {
  try {
    const body: StockOutRequest = req.body;

    // Validate request body
    if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
      res.status(400).json({
        error: 'Invalid request: items array is required and must not be empty',
      });
      return;
    }

    // Validate each item
    for (const item of body.items) {
      if (!item.barcode || typeof item.barcode !== 'string') {
        res.status(400).json({
          error: 'Invalid request: each item must have a valid barcode',
        });
        return;
      }

      if (!item.quantity || typeof item.quantity !== 'number' || item.quantity <= 0) {
        res.status(400).json({
          error: 'Invalid request: each item must have a positive quantity',
        });
        return;
      }
    }

    // Process stock-out
    const result = await stockOutService(body.items);

    // Check if all items succeeded
    const allSucceeded = result.results.every((r) => r.success);
    const statusCode = allSucceeded ? 200 : 207; // 207 Multi-Status if some failed

    res.status(statusCode).json(result);
  } catch (error) {
    console.error('Error in stockOutHandler:', error);

    // Handle insufficient stock error specifically
    if (error instanceof Error && error.message.includes('Insufficient stock')) {
      res.status(409).json({
        error: 'Insufficient stock',
        message: error.message,
      });
      return;
    }

    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Handles GET /api/stock/logs
 * Retrieves stock movement logs grouped by sessionId
 */
export async function stockLogsHandler(req: Request, res: Response): Promise<void> {
  try {
    const result = await stockLogService();
    res.status(200).json(result);
  } catch (error) {
    console.error('Error in stockLogsHandler:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export async function createProduct(req: Request, res: Response): Promise<void> {
  try {
    const body: Product = req.body;
    const product = await prisma.product.create({
      data: {
        name: body.name,
        barcode: body.barcode,
        unit: body.unit,
        minStock: body.minStock,
      },
    });
    res.status(200).json(product);
  } catch (error) {
    console.error('Error in createProductHandler:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export async function getStockById(req: Request, res: Response): Promise<void> {
  try {
    const result = await findProductById(req.params.stockId);
    res.status(200).json(result);
  } catch (error) {
    console.error('Error in productDetailHandler:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}