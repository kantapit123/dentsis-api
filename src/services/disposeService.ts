import { randomUUID } from 'crypto';
import { prisma } from '../prisma';
import {
  DisposeItem,
  DisposeResponse,
  DisposeItemResult,
  StockOutBatchDeduction,
} from '../types/stock.types';

/**
 * Disposes warehouse stock from product batches using strict FIFO.
 * Disposal is an audit-only removal path for expired, damaged, or otherwise discarded stock.
 *
 * @param items - Array of stock disposal items
 * @returns DisposeResponse with sessionId and per-item results
 */
export async function disposeService(items: DisposeItem[]): Promise<DisposeResponse> {
  const sessionId = randomUUID();

  const results = await prisma.$transaction(async (tx) => {
    const itemResults: DisposeItemResult[] = [];

    for (const item of items) {
      try {
        const reason = item.reason.trim();

        const product = await tx.product.findUnique({
          where: { barcode: item.barcode },
        });

        if (!product) {
          itemResults.push({
            barcode: item.barcode,
            productId: '',
            requestedQuantity: item.quantity,
            disposedQuantity: 0,
            reason,
            batches: [],
            success: false,
            error: `Product not found for barcode: ${item.barcode}`,
          });
          continue;
        }

        const batches = await tx.stockBatch.findMany({
          where: {
            productId: product.id,
            quantity: { gt: 0 },
          },
          orderBy: [{ receivedAt: 'asc' }, { createdAt: 'asc' }],
        });

        const totalAvailable = batches.reduce((sum, batch) => sum + batch.quantity, 0);

        if (totalAvailable < item.quantity) {
          throw new Error(
            `Insufficient stock for product ${item.barcode}. Requested: ${item.quantity}, Available: ${totalAvailable}`
          );
        }

        let remainingQuantity = item.quantity;
        const batchDeductions: StockOutBatchDeduction[] = [];

        for (const batch of batches) {
          if (remainingQuantity <= 0) {
            break;
          }

          const quantityToDeduct = Math.min(remainingQuantity, batch.quantity);

          await tx.stockBatch.update({
            where: { id: batch.id },
            data: {
              quantity: {
                decrement: quantityToDeduct,
              },
            },
          });

          await tx.stockMovement.create({
            data: {
              productId: product.id,
              batchId: batch.id,
              lotNumber: batch.lotNumber,
              type: 'DISPOSE',
              quantity: quantityToDeduct,
              reason,
              sessionId,
            } as any, // Type assertion needed until Prisma client is regenerated
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
          disposedQuantity: item.quantity,
          reason,
          batches: batchDeductions,
          success: true,
        });
      } catch (error) {
        itemResults.push({
          barcode: item.barcode,
          productId: '',
          requestedQuantity: item.quantity,
          disposedQuantity: 0,
          reason: item.reason.trim(),
          batches: [],
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error occurred',
        });

        if (error instanceof Error && error.message.includes('Insufficient stock')) {
          throw error;
        }
      }
    }

    return itemResults;
  });

  return { sessionId, results };
}
