import { randomUUID } from 'crypto';
import { prisma } from '../prisma';
import {
  WithdrawItem,
  WithdrawResponse,
  WithdrawItemResult,
  StockOutBatchDeduction,
} from '../types/stock.types';

/**
 * Processes withdrawal operations for reusable items using strict FIFO.
 * Unlike stockOut, this moves stock from warehouse to in-use (inUseQuantity),
 * so the item does NOT trigger an out-of-stock alert when warehouse reaches 0.
 *
 * @param items - Array of items to withdraw (must be reusable products)
 * @returns WithdrawResponse with sessionId and per-item results
 */
export async function withdrawService(items: WithdrawItem[]): Promise<WithdrawResponse> {
  const sessionId = randomUUID();

  const results = await prisma.$transaction(async (tx) => {
    const itemResults: WithdrawItemResult[] = [];

    for (const item of items) {
      try {
        const product = await tx.product.findUnique({
          where: { barcode: item.barcode },
        });

        if (!product) {
          itemResults.push({
            barcode: item.barcode,
            productId: '',
            requestedQuantity: item.quantity,
            deductedQuantity: 0,
            inUseAfter: 0,
            batches: [],
            success: false,
            error: `Product not found for barcode: ${item.barcode}`,
          });
          continue;
        }

        if (!product.isReusable) {
          itemResults.push({
            barcode: item.barcode,
            productId: product.id,
            requestedQuantity: item.quantity,
            deductedQuantity: 0,
            inUseAfter: product.inUseQuantity,
            batches: [],
            success: false,
            error: `Product "${product.name}" is not reusable. Use /api/stock/out instead.`,
          });
          continue;
        }

        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        // Strict FIFO: find non-expired batches with stock and sort by receivedAt
        const batches = await tx.stockBatch.findMany({
          where: {
            productId: product.id,
            quantity: { gt: 0 },
            OR: [{ expireDate: null }, { expireDate: { gte: startOfToday } }],
          },
          orderBy: [{ receivedAt: 'asc' }, { createdAt: 'asc' }],
        });

        const totalAvailable = batches.reduce((sum, batch) => sum + batch.quantity, 0);

        if (totalAvailable < item.quantity) {
          throw new Error(
            `Insufficient stock for product ${item.barcode}. Requested: ${item.quantity}, Available: ${totalAvailable}`
          );
        }

        // Deduct batches (strict FIFO) and log WITHDRAW movements
        let remainingQuantity = item.quantity;
        const batchDeductions: StockOutBatchDeduction[] = [];

        for (const batch of batches) {
          if (remainingQuantity <= 0) break;

          const quantityToDeduct = Math.min(remainingQuantity, batch.quantity);

          await tx.stockBatch.update({
            where: { id: batch.id },
            data: { quantity: { decrement: quantityToDeduct } },
          });

          await tx.stockMovement.create({
            data: {
              productId: product.id,
              batchId: batch.id,
              lotNumber: batch.lotNumber,
              type: 'WITHDRAW',
              quantity: quantityToDeduct,
              sessionId,
            },
          });

          batchDeductions.push({
            batchId: batch.id,
            lotNumber: batch.lotNumber,
            quantity: quantityToDeduct,
          });

          remainingQuantity -= quantityToDeduct;
        }

        // Increment inUseQuantity on product
        const updatedProduct = await tx.product.update({
          where: { id: product.id },
          data: { inUseQuantity: { increment: item.quantity } },
        });

        itemResults.push({
          barcode: item.barcode,
          productId: product.id,
          requestedQuantity: item.quantity,
          deductedQuantity: item.quantity,
          inUseAfter: updatedProduct.inUseQuantity,
          batches: batchDeductions,
          success: true,
        });
      } catch (error) {
        itemResults.push({
          barcode: item.barcode,
          productId: '',
          requestedQuantity: item.quantity,
          deductedQuantity: 0,
          inUseAfter: 0,
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
