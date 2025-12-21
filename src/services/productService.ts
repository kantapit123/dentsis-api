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
export async function getProductList(): Promise<ProductListItem[]> {
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

        // Check if any batch expires within 30 days, handling null/invalid expireDate
        const nearExpiry = product.stockBatches.some((batch) => {
            if (!batch.expireDate) return false;
            const expireDateObj = typeof batch.expireDate === 'string' || typeof batch.expireDate === 'number'
                ? new Date(batch.expireDate)
                : batch.expireDate; // If already Date object

            if (!(expireDateObj instanceof Date) || isNaN(expireDateObj.getTime())) return false;
            expireDateObj.setHours(0, 0, 0, 0);
            return expireDateObj >= today && expireDateObj <= thirtyDaysFromNow;
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

export async function findProductById(productId: string): Promise<ProductListItem> {
    const product = await prisma.product.findUnique({
        where: { barcode: productId },
        include: {
            stockBatches: {
                select: {
                    quantity: true,
                    expireDate: true,
                },
            },
        },
    });
    if (!product) {
        throw new Error('Product not found please add the product first');
    }

    const today = new Date();
    const thirtyDaysFromNow = new Date(today);
    thirtyDaysFromNow.setDate(today.getDate() + 30);

    today.setHours(0, 0, 0, 0);
    thirtyDaysFromNow.setHours(23, 59, 59, 999);


    const totalQuantity = product.stockBatches.reduce(
        (sum, batch) => sum + batch.quantity,
        0
    );

    const nearExpiry = product.stockBatches.some((batch) => {
        if (!batch.expireDate) return false;
        const expireDateObj = typeof batch.expireDate === 'string' || typeof batch.expireDate === 'number'
            ? new Date(batch.expireDate)
            : batch.expireDate; // If already Date object

        if (!(expireDateObj instanceof Date) || isNaN(expireDateObj.getTime())) return false;
        expireDateObj.setHours(0, 0, 0, 0);
        return expireDateObj >= today && expireDateObj <= thirtyDaysFromNow;
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
}

