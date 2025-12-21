import { prisma } from '../prisma';
import { ProductListItem } from '../types/dashboard.types';

/**
 * Retrieves product list with stock information
 * 
 * - totalQuantity: Sum of all batches per product
 * - nearExpiry: true if any batch expires within 30 days
 * - Ordered by name ASC
 * 
 * @returns Array of ProductListItem with stock information
 */
export async function productListService(): Promise<ProductListItem[]> {
  // Fetch all products with their batches
  const products = await prisma.product.findMany({
    include: {
      stockBatches: {
        select: {
          quantity: true,
          expireDate: true,
        },
      },
    },
    orderBy: {
      name: 'asc',
    },
  });

  // Calculate today and 30 days from now for expiry check
  const today = new Date();
  const thirtyDaysFromNow = new Date(today);
  thirtyDaysFromNow.setDate(today.getDate() + 30);

  // Set time to start/end of day for accurate day-based comparison
  today.setHours(0, 0, 0, 0);
  thirtyDaysFromNow.setHours(23, 59, 59, 999);

  // Transform products to include calculated fields
  return products.map((product) => {
    // Calculate total quantity from batches
    const totalQuantity = product.stockBatches.reduce(
      (sum, batch) => sum + batch.quantity,
      0
    );

    // Check if any batch expires within 30 days
    const nearExpiry = product.stockBatches.some((batch) => {
      const expireDate = new Date(batch.expireDate);
      expireDate.setHours(0, 0, 0, 0);
      return expireDate >= today && expireDate <= thirtyDaysFromNow;
    });

    return {
      id: product.id,
      name: product.name,
      barcode: product.barcode,
      unit: product.unit,
      minStock: product.minStock,
      totalQuantity,
      nearExpiry,
    };
  });
}

