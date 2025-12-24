import { prisma } from '../prisma';
import { StockLogResponseEntry, StockLogFilters } from '../types/stock.types';

/**
 * Retrieves stock movement logs grouped by sessionId
 * 
 * Groups movements by:
 * - sessionId (for bulk operations)
 * - If sessionId is null, each movement is its own group
 * 
 * Each group shows:
 * - sessionId (can be null)
 * - type (IN/OUT)
 * - createdAt (ISO date string)
 * - productName
 * - totalQuantity (sum of all movements in group)
 * - lots (aggregated by lotNumber)
 * 
 * @param filters - Optional filters for type, fromDate, toDate
 * @returns Array of StockLogResponseEntry
 */
export async function getStockLogsService(
  filters?: StockLogFilters
): Promise<StockLogResponseEntry[]> {
  // Build where clause for filters
  const where: any = {};

  // Filter by type
  if (filters?.type) {
    where.type = filters.type;
  }

  // Handle predefined date filters (today, 7days)
  // These take precedence over fromDate/toDate if both are provided
  if (filters?.filter) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    if (filters.filter === 'today') {
      where.createdAt = {
        gte: today,
        lte: endOfToday,
      };
    } else if (filters.filter === '7days') {
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(today.getDate() - 7);
      
      where.createdAt = {
        gte: sevenDaysAgo,
        lte: endOfToday,
      };
    }
  } else {
    // Filter by date range (only if predefined filter is not used)
    if (filters?.fromDate || filters?.toDate) {
      where.createdAt = {};
      if (filters.fromDate) {
        const fromDate = new Date(filters.fromDate);
        fromDate.setHours(0, 0, 0, 0);
        where.createdAt.gte = fromDate;
      }
      if (filters.toDate) {
        const toDate = new Date(filters.toDate);
        toDate.setHours(23, 59, 59, 999);
        where.createdAt.lte = toDate;
      }
    }
  }

  // Fetch movements with product information, ordered by creation date (newest first)
  const movements = await prisma.stockMovement.findMany({
    where,
    include: {
      product: {
        select: {
          name: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  // Group movements by sessionId + type + productId
  // If sessionId is null, treat each movement as its own group
  // This ensures that:
  // - Bulk operations (same sessionId) are grouped together
  // - Different products in same session are separate entries
  // - IN and OUT operations are separate
  const groupedMap = new Map<string, StockLogResponseEntry>();

  for (const movement of movements) {
    // Create group key: sessionId|type|productId
    // If sessionId is null, use movement id to make it unique
    const sessionKey = movement.sessionId || `single-${movement.id}`;
    const groupKey = `${sessionKey}|${movement.type}|${movement.productId}`;

    if (groupedMap.has(groupKey)) {
      // Update existing group
      const existing = groupedMap.get(groupKey)!;
      existing.totalQuantity += movement.quantity;

      // Update or add lot breakdown
      const lotIndex = existing.lots.findIndex(
        (lot) => lot.lot === movement.lotNumber
      );

      if (lotIndex >= 0) {
        existing.lots[lotIndex].quantity += movement.quantity;
      } else {
        existing.lots.push({
          lot: movement.lotNumber,
          quantity: movement.quantity,
        });
      }

      // Update createdAt if this movement is older (we want the earliest timestamp in the group)
      const movementDate = new Date(movement.createdAt);
      const existingDate = new Date(existing.createdAt);
      if (movementDate < existingDate) {
        existing.createdAt = movement.createdAt.toISOString();
      }
    } else {
      // Create new group
      groupedMap.set(groupKey, {
        sessionId: movement.sessionId,
        type: movement.type as 'IN' | 'OUT',
        createdAt: movement.createdAt.toISOString(),
        productName: movement.product.name,
        totalQuantity: movement.quantity,
        lots: [
          {
            lot: movement.lotNumber,
            quantity: movement.quantity,
          },
        ],
      });
    }
  }

  // Convert map to array and sort by createdAt (newest first)
  const logs = Array.from(groupedMap.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return logs;
}

