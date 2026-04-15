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

    // Normalize and collect valid expire dates
    const validExpireDates = product.stockBatches
      .map((batch) => {
        if (!batch.expireDate) return null;
        const expireDateObj =
          typeof batch.expireDate === 'string' || typeof batch.expireDate === 'number'
            ? new Date(batch.expireDate)
            : batch.expireDate;
        if (!(expireDateObj instanceof Date) || isNaN(expireDateObj.getTime())) return null;
        return expireDateObj;
      })
      .filter((date): date is Date => date !== null);

    // Check if any batch expires within 30 days
    const nearExpiry = validExpireDates.some((expireDateObj) => {
      const expireDate = new Date(expireDateObj);
      expireDate.setHours(0, 0, 0, 0);
      return expireDate >= today && expireDate <= thirtyDaysFromNow;
    });

    // Earliest expire date as ISO string (or null)
    const expireDate =
      validExpireDates.length > 0
        ? new Date(Math.min(...validExpireDates.map((d) => d.getTime()))).toISOString()
        : null;

    // Check if any batch has already expired
    const isExpired = validExpireDates.some((expireDateObj) => {
      const expireDateCopy = new Date(expireDateObj);
      expireDateCopy.setHours(0, 0, 0, 0);
      return expireDateCopy < today;
    });

    const warehouseQuantity = totalQuantity;
    const effectiveTotalQuantity = product.isReusable
      ? warehouseQuantity + product.inUseQuantity
      : warehouseQuantity;

    return {
      id: product.id,
      name: product.name,
      barcode: product.barcode,
      unit: product.unit,
      minStock: product.minStock,
      isReusable: product.isReusable,
      warehouseQuantity,
      inUseQuantity: product.inUseQuantity,
      totalQuantity: effectiveTotalQuantity,
      nearExpiry,
      expireDate,
      isExpired,
    };
  });
}

