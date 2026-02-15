import { Request, Response } from 'express';
import { stockInService } from '../services/stockInService';
import { stockOutService } from '../services/stockOutService';
import { stockLogService } from '../services/stockLogService';
import { getStockLogsService } from '../services/getStockLogsService';
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

      // Validate expireDate - can be null, empty string, or a valid date string
      // Treat empty string as null
      if (item.expireDate !== null && item.expireDate !== undefined && item.expireDate !== '') {
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
 * 
 * Query parameters:
 * - type: IN | OUT (optional)
 * - fromDate: YYYY-MM-DD (optional)
 * - toDate: YYYY-MM-DD (optional)
 * - filter: today | 7days (optional, predefined date filters)
 */
export async function stockLogsHandler(req: Request, res: Response): Promise<void> {
  try {
    // Extract query parameters
    const type = req.query.type as 'IN' | 'OUT' | undefined;
    const fromDate = req.query.fromDate as string | undefined;
    const toDate = req.query.toDate as string | undefined;
    const filter = req.query.filter as 'today' | '7days' | undefined;

    // Validate type if provided
    if (type && type !== 'IN' && type !== 'OUT') {
      res.status(400).json({
        error: 'Invalid request: type must be IN or OUT',
      });
      return;
    }

    // Validate filter if provided
    if (filter && filter !== 'today' && filter !== '7days') {
      res.status(400).json({
        error: 'Invalid request: filter must be "today" or "7days"',
      });
      return;
    }

    // Validate date formats if provided
    if (fromDate) {
      const fromDateObj = new Date(fromDate);
      if (isNaN(fromDateObj.getTime())) {
        res.status(400).json({
          error: 'Invalid request: fromDate must be in YYYY-MM-DD format',
        });
        return;
      }
    }

    if (toDate) {
      const toDateObj = new Date(toDate);
      if (isNaN(toDateObj.getTime())) {
        res.status(400).json({
          error: 'Invalid request: toDate must be in YYYY-MM-DD format',
        });
        return;
      }
    }

    // Build filters object
    const filters: {
      type?: 'IN' | 'OUT';
      fromDate?: string;
      toDate?: string;
      filter?: 'today' | '7days';
    } = {};

    if (type) filters.type = type;
    if (fromDate) filters.fromDate = fromDate;
    if (toDate) filters.toDate = toDate;
    if (filter) filters.filter = filter;

    // Get stock logs
    const result = await getStockLogsService(filters);
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