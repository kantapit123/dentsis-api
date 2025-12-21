import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma';
import { StockInItem, StockInResponse, StockInItemResult } from '../types/stock.types';
import { $Enums } from '../../generated/prisma/client';

/**
 * Processes stock-in operations for one or more items
 * Uses a database transaction to ensure atomicity
 * 
 * @param items - Array of stock-in items
 * @returns StockInResponse with sessionId and results for each item
 */
export async function stockInService(items: StockInItem[]): Promise<StockInResponse> {
  // Generate a session ID for grouping all movements in this bulk operation
  const sessionId = randomUUID();

  // Process all items within a single transaction
  const results = await prisma.$transaction(async (tx) => {
    const itemResults: StockInItemResult[] = [];

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
            batchId: '',
            lotNumber: item.lotNumber,
            quantity: item.quantity,
            success: false,
            error: `Product not found for barcode: ${item.barcode}`,
          });
          continue;
        }

        // Check if batch already exists for this product + lot combination
        const existingBatch = await tx.stockBatch.findFirst({
          where: {
            productId: product.id,
            lotNumber: item.lotNumber,
          },
        });

        let batchId: string;

        if (existingBatch) {
          // Update existing batch quantity
          const updatedBatch = await tx.stockBatch.update({
            where: { id: existingBatch.id },
            data: {
              quantity: {
                increment: item.quantity,
              },
            },
          });
          batchId = updatedBatch.id;
        } else {
          // Create new batch
          const newBatch = await tx.stockBatch.create({
            data: {
              productId: product.id,
              lotNumber: item.lotNumber,
              expireDate: new Date(item.expireDate),
              quantity: item.quantity,
            },
          });
          batchId = newBatch.id;
        }

        // Create movement record for audit trail
        await tx.stockMovement.create({
          data: {
            productId: product.id,
            batchId: batchId,
            lotNumber: item.lotNumber,
            type: $Enums.StockMovementType.IN,
            quantity: item.quantity,
            sessionId: sessionId,
          },
        });

        itemResults.push({
          barcode: item.barcode,
          productId: product.id,
          batchId: batchId,
          lotNumber: item.lotNumber,
          quantity: item.quantity,
          success: true,
        });
      } catch (error) {
        // Handle any unexpected errors
        itemResults.push({
          barcode: item.barcode,
          productId: '',
          batchId: '',
          lotNumber: item.lotNumber,
          quantity: item.quantity,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error occurred',
        });
      }
    }

    return itemResults;
  });

  return {
    sessionId,
    results,
  };
}

