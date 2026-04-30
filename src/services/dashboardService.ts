import { prisma } from '../prisma';
import { DashboardSummary } from '../types/dashboard.types';

/**
 * Calculates dashboard summary statistics
 * 
 * - totalProducts: Total number of products
 * - totalStockQuantity: Sum of all batch quantities
 * - lowStockCount: Products where totalQuantity < minStock
 * - nearExpiryCount: Products with at least one active batch expiring in less than 6 months
 * - expiredCount: Products with at least one batch that has expired
 * 
 * @returns DashboardSummary with calculated statistics
 */
export async function dashboardService(): Promise<DashboardSummary> {
  // Calculate total products
  const totalProducts = await prisma.product.count();

  // Calculate total stock quantity from all batches
  const stockAggregate = await prisma.stockBatch.aggregate({
    _sum: {
      quantity: true,
    },
  });
  const totalStockQuantity = stockAggregate._sum.quantity ?? 0;

  // Get all products with their batches to calculate low stock
  const products = await prisma.product.findMany({
    include: {
      stockBatches: {
        select: {
          quantity: true,
        },
      },
    },
  });

  // Calculate low stock count
  // A product is low stock if totalQuantity <= minStock
  const lowStockCount = products.filter((product) => {
    const totalQuantity = product.stockBatches.reduce(
      (sum, batch) => sum + batch.quantity,
      0
    );
    return totalQuantity <= product.minStock;
  }).length;

  // Calculate near expiry count
  // Get all active batches that expire in less than 6 months
  const today = new Date();
  const sixMonthsFromNow = new Date(today);
  sixMonthsFromNow.setMonth(today.getMonth() + 6);

  // Set time to start of day for accurate day-based comparison
  today.setHours(0, 0, 0, 0);
  sixMonthsFromNow.setHours(0, 0, 0, 0);

  const nearExpiryBatches = await prisma.stockBatch.findMany({
    where: {
      quantity: {
        gt: 0,
      },
      expireDate: {
        gte: today,
        lt: sixMonthsFromNow,
      },
    },
    select: {
      productId: true,
    },
  });

  // Get unique product IDs
  const uniqueProductIds = new Set(nearExpiryBatches.map((batch) => batch.productId));
  const nearExpiryCount = uniqueProductIds.size;

  // Calculate expired count
  // Get all batches that have expired (expireDate < today)
  const expiredBatches = await prisma.stockBatch.findMany({
    where: {
      expireDate: {
        lt: today,
      },
    },
    select: {
      productId: true,
    },
  });

  // Get unique product IDs for expired products
  const uniqueExpiredProductIds = new Set(expiredBatches.map((batch) => batch.productId));
  const expiredCount = uniqueExpiredProductIds.size;

  return {
    totalProducts,
    lowStockCount,
    nearExpiryCount,
    expiredCount,
    totalStockQuantity,
  };
}

