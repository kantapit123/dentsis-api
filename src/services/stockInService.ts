import { randomUUID } from 'crypto';
import { prisma } from '../prisma';
import { StockInItem, StockInResponse, StockInItemResult } from '../types/stock.types';

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
        // Auto-generate lotNumber if not provided
        const effectiveLotNumber = (item.lotNumber && item.lotNumber.trim())
          ? item.lotNumber.trim()
          : `AUTO-${Date.now()}-${randomUUID().slice(0, 8)}`;

        // Resolve product by barcode
        const product = await tx.product.findUnique({
          where: { barcode: item.barcode },
        });

        if (!product) {
          itemResults.push({
            barcode: item.barcode,
            productId: '',
            batchId: '',
            lotNumber: effectiveLotNumber,
            quantity: item.quantity,
            success: false,
            error: `Product not found for barcode: ${item.barcode}`,
          });
          continue;
        }

        const parsedExpireDate =
          item.expireDate !== null && item.expireDate !== undefined && item.expireDate !== ''
            ? new Date(item.expireDate)
            : null;

        // Check if batch already exists for this product + lot + expiry combination
        const existingBatch = await tx.stockBatch.findFirst({
          where: {
            productId: product.id,
            lotNumber: effectiveLotNumber,
            expireDate: parsedExpireDate,
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
          const createData: {
            productId: string;
            lotNumber: string;
            quantity: number;
            receivedAt: Date;
            expireDate?: Date | null;
          } = {
            productId: product.id,
            lotNumber: effectiveLotNumber,
            quantity: item.quantity,
            receivedAt: new Date(),
          };

          createData.expireDate = parsedExpireDate;

          const newBatch = await tx.stockBatch.create({
            data: createData as any, // Type assertion needed until Prisma client is regenerated
          });
          batchId = newBatch.id;
        }

        // Create movement record for audit trail
        await tx.stockMovement.create({
          data: {
            productId: product.id,
            batchId: batchId,
            lotNumber: effectiveLotNumber,
            type: 'IN',
            quantity: item.quantity,
            sessionId: sessionId,
          },
        });

        itemResults.push({
          barcode: item.barcode,
          productId: product.id,
          batchId: batchId,
          lotNumber: effectiveLotNumber,
          quantity: item.quantity,
          success: true,
        });
      } catch (error) {
        // Handle any unexpected errors
        const errorLotNumber = (item.lotNumber && item.lotNumber.trim()) 
          ? item.lotNumber.trim() 
          : `AUTO-${Date.now()}-${randomUUID().slice(0, 8)}`;
        itemResults.push({
          barcode: item.barcode,
          productId: '',
          batchId: '',
          lotNumber: errorLotNumber,
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

