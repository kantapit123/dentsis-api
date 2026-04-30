import { randomUUID } from 'crypto';
import { prisma } from '../prisma';
import {
  StockOutItem,
  StockOutResponse,
  StockOutItemResult,
  StockOutBatchDeduction,
} from '../types/stock.types';

/**
 * Processes stock-out operations with strict FIFO handling
 * Uses a database transaction to ensure atomicity
 * 
 * FIFO Algorithm:
 * 1. Find all batches for the product with quantity > 0
 * 2. Exclude expired batches
 * 3. Order by receivedAt ascending (oldest received first)
 * 3. Deduct quantity across batches until requested quantity is satisfied
 * 4. Throw error if total available stock is insufficient
 * 
 * @param items - Array of stock-out items
 * @returns StockOutResponse with sessionId and results for each item
 * @throws Error if insufficient stock for any item
 */
export async function stockOutService(items: StockOutItem[]): Promise<StockOutResponse> {
  // Generate a session ID for grouping all movements in this bulk operation
  const sessionId = randomUUID();

  // Process all items within a single transaction
  const results = await prisma.$transaction(async (tx) => {
    const itemResults: StockOutItemResult[] = [];

    for (const item of items) {
      try {
        // Resolve product by barcode
        const product = await tx.product.findUnique({
          where: { barcode: item.barcode },
        });

        if (!product) {
          itemResults.push({
            barcode: item.barcode,
            productId: '',
            requestedQuantity: item.quantity,
            deductedQuantity: 0,
            batches: [],
            success: false,
            error: `Product not found for barcode: ${item.barcode}`,
          });
          continue;
        }

        // Guard: reusable items must use /api/stock/withdraw instead
        if (product.isReusable) {
          itemResults.push({
            barcode: item.barcode,
            productId: product.id,
            requestedQuantity: item.quantity,
            deductedQuantity: 0,
            batches: [],
            success: false,
            error: `Product "${product.name}" is reusable. Use /api/stock/withdraw instead.`,
          });
          continue;
        }

        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        // Find all non-expired batches with available stock, ordered by receivedAt (strict FIFO)
        const batches = await tx.stockBatch.findMany({
          where: {
            productId: product.id,
            quantity: { gt: 0 },
            OR: [{ expireDate: null }, { expireDate: { gte: startOfToday } }],
          },
          orderBy: [{ receivedAt: 'asc' }, { createdAt: 'asc' }],
        });

        // Calculate total available stock
        const totalAvailable = batches.reduce((sum, batch) => sum + batch.quantity, 0);

        // Check if sufficient stock is available
        if (totalAvailable < item.quantity) {
          throw new Error(
            `Insufficient stock for product ${item.barcode}. Requested: ${item.quantity}, Available: ${totalAvailable}`
          );
        }

        // Deduct quantity across batches using strict FIFO algorithm
        let remainingQuantity = item.quantity;
        const batchDeductions: StockOutBatchDeduction[] = [];

        for (const batch of batches) {
          if (remainingQuantity <= 0) {
            break;
          }

          const quantityToDeduct = Math.min(remainingQuantity, batch.quantity);

          // Update batch quantity
          await tx.stockBatch.update({
            where: { id: batch.id },
            data: {
              quantity: {
                decrement: quantityToDeduct,
              },
            },
          });

          // Create movement record for audit trail
          await tx.stockMovement.create({
            data: {
              productId: product.id,
              batchId: batch.id,
              lotNumber: batch.lotNumber,
              type: 'OUT',
              quantity: quantityToDeduct,
              sessionId: sessionId,
            },
          });

          batchDeductions.push({
            batchId: batch.id,
            lotNumber: batch.lotNumber,
            quantity: quantityToDeduct,
          });

          remainingQuantity -= quantityToDeduct;
        }

        itemResults.push({
          barcode: item.barcode,
          productId: product.id,
          requestedQuantity: item.quantity,
          deductedQuantity: item.quantity,
          batches: batchDeductions,
          success: true,
        });
      } catch (error) {
        // Handle errors (including insufficient stock)
        itemResults.push({
          barcode: item.barcode,
          productId: '',
          requestedQuantity: item.quantity,
          deductedQuantity: 0,
          batches: [],
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error occurred',
        });

        // Re-throw if it's an insufficient stock error to rollback transaction
        if (error instanceof Error && error.message.includes('Insufficient stock')) {
          throw error;
        }
      }
    }

    return itemResults;
  });

  return {
    sessionId,
    results,
  };
}

