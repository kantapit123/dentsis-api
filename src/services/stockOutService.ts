import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma';
import {
  StockOutItem,
  StockOutResponse,
  StockOutItemResult,
  StockOutBatchDeduction,
} from '../types/stock.types';
import { $Enums } from '../../generated/prisma/client';

/**
 * Processes stock-out operations with automatic FEFO (First Expired, First Out) handling
 * Uses a database transaction to ensure atomicity
 * 
 * FEFO Algorithm:
 * 1. Find all batches for the product with quantity > 0
 * 2. Order by expireDate ascending (oldest expiration first)
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

        // Find all batches with available stock, ordered by expireDate (FEFO)
        const batches = await tx.stockBatch.findMany({
          where: {
            productId: product.id,
            quantity: { gt: 0 },
          },
          orderBy: {
            expireDate: 'asc', // First Expired, First Out
          },
        });

        // Calculate total available stock
        const totalAvailable = batches.reduce((sum, batch) => sum + batch.quantity, 0);

        // Check if sufficient stock is available
        if (totalAvailable < item.quantity) {
          throw new Error(
            `Insufficient stock for product ${item.barcode}. Requested: ${item.quantity}, Available: ${totalAvailable}`
          );
        }

        // Deduct quantity across batches using FEFO algorithm
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
              type: $Enums.StockMovementType.OUT,
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

