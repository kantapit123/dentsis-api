import { prisma } from '../lib/prisma';
import { StockLogsResponse, StockLogEntry, StockLogLotBreakdown } from '../types/stock.types';

/**
 * Retrieves stock movement logs grouped by sessionId, productId, and type
 * 
 * Groups movements by:
 * - sessionId (for bulk operations)
 * - productId (each product tracked separately)
 * - type (IN/OUT tracked separately)
 * 
 * Each group shows:
 * - product name
 * - IN or OUT
 * - timestamp (from first movement in group)
 * - total quantity (sum of all movements in group)
 * - breakdown by lot (aggregated by lotNumber)
 * 
 * @returns StockLogsResponse with grouped and transformed movement logs
 */
export async function stockLogService(): Promise<StockLogsResponse> {
  // Fetch all movements with product information, ordered by creation date (newest first)
  const movements = await prisma.stockMovement.findMany({
    include: {
      product: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  // Group movements by sessionId + productId + type
  // Use a composite key to ensure proper grouping
  const groupedMap = new Map<string, StockLogEntry>();

  for (const movement of movements) {
    // Create composite key: sessionId|productId|type
    // Handle null sessionId by using movement id as fallback
    const sessionKey = movement.sessionId || `single-${movement.id}`;
    const groupKey = `${sessionKey}|${movement.productId}|${movement.type}`;

    if (groupedMap.has(groupKey)) {
      // Update existing group
      const existing = groupedMap.get(groupKey)!;
      existing.totalQuantity += movement.quantity;

      // Update or add lot breakdown
      const lotIndex = existing.lots.findIndex(
        (lot) => lot.lotNumber === movement.lotNumber
      );

      if (lotIndex >= 0) {
        existing.lots[lotIndex].quantity += movement.quantity;
      } else {
        existing.lots.push({
          lotNumber: movement.lotNumber,
          quantity: movement.quantity,
        });
      }

      // Update timestamp if this movement is older (we want the earliest timestamp in the group)
      if (movement.createdAt < existing.timestamp) {
        existing.timestamp = movement.createdAt;
      }
    } else {
      // Create new group
      groupedMap.set(groupKey, {
        sessionId: sessionKey,
        productName: movement.product.name,
        productId: movement.productId,
        type: movement.type as 'IN' | 'OUT',
        timestamp: movement.createdAt,
        totalQuantity: movement.quantity,
        lots: [
          {
            lotNumber: movement.lotNumber,
            quantity: movement.quantity,
          },
        ],
      });
    }
  }

  // Convert map to array and sort by timestamp (newest first)
  const logs = Array.from(groupedMap.values()).sort(
    (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
  );

  return {
    logs,
    total: logs.length,
  };
}

