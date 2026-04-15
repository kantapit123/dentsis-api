import { randomUUID } from 'crypto';
import { prisma } from '../prisma';
import { DepleteItem, DepleteResponse, DepleteItemResult } from '../types/stock.types';

/**
 * Marks reusable items as consumed (depleted).
 * Decrements inUseQuantity on the product and logs a DEPLETE movement.
 * Returns isOutOfStock=true when both warehouse and inUse reach 0.
 *
 * @param items - Array of items to deplete (must be reusable products)
 * @returns DepleteResponse with sessionId and per-item results
 */
export async function depleteService(items: DepleteItem[]): Promise<DepleteResponse> {
  const sessionId = randomUUID();

  const results = await prisma.$transaction(async (tx) => {
    const itemResults: DepleteItemResult[] = [];

    for (const item of items) {
      try {
        const product = await tx.product.findUnique({
          where: { barcode: item.barcode },
          include: { stockBatches: { select: { quantity: true } } },
        });

        if (!product) {
          itemResults.push({
            barcode: item.barcode,
            productId: '',
            quantity: item.quantity,
            inUseAfter: 0,
            isOutOfStock: false,
            success: false,
            error: `Product not found for barcode: ${item.barcode}`,
          });
          continue;
        }

        if (!product.isReusable) {
          itemResults.push({
            barcode: item.barcode,
            productId: product.id,
            quantity: item.quantity,
            inUseAfter: 0,
            isOutOfStock: false,
            success: false,
            error: `Product "${product.name}" is not reusable. Use /api/stock/out instead.`,
          });
          continue;
        }

        if (product.inUseQuantity < item.quantity) {
          itemResults.push({
            barcode: item.barcode,
            productId: product.id,
            quantity: item.quantity,
            inUseAfter: product.inUseQuantity,
            isOutOfStock: false,
            success: false,
            error: `Cannot deplete ${item.quantity} — only ${product.inUseQuantity} in use for product "${product.name}".`,
          });
          continue;
        }

        // Decrement inUseQuantity and log DEPLETE movement (no batch reference)
        const updatedProduct = await tx.product.update({
          where: { id: product.id },
          data: { inUseQuantity: { decrement: item.quantity } },
        });

        await tx.stockMovement.create({
          data: {
            productId: product.id,
            // batchId and lotNumber are nullable for DEPLETE movements
            type: 'DEPLETE',
            quantity: item.quantity,
            sessionId,
          },
        });

        // isOutOfStock: no warehouse stock AND nothing left in use
        const warehouseQty = product.stockBatches.reduce((sum, b) => sum + b.quantity, 0);
        const isOutOfStock = warehouseQty === 0 && updatedProduct.inUseQuantity === 0;

        itemResults.push({
          barcode: item.barcode,
          productId: product.id,
          quantity: item.quantity,
          inUseAfter: updatedProduct.inUseQuantity,
          isOutOfStock,
          success: true,
        });
      } catch (error) {
        itemResults.push({
          barcode: item.barcode,
          productId: '',
          quantity: item.quantity,
          inUseAfter: 0,
          isOutOfStock: false,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error occurred',
        });
      }
    }

    return itemResults;
  });

  return { sessionId, results };
}
