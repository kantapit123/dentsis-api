import { prisma } from '../prisma';
import { ProductListItem, PaginatedProductListResponse, ProductListQuery } from '../types/dashboard.types';

/**
 * Retrieves product list with stock information
 * 
 * - totalQuantity: Sum of all batches per product
 * - nearExpiry: true if any batch expires within 30 days
 * - Ordered by name ASC
 * - Supports search by product name or barcode
 * - Supports pagination
 * 
 * @param query - Query parameters for search and pagination
 * @returns PaginatedProductListResponse with products and pagination metadata
 */
export async function getProductList(query?: ProductListQuery): Promise<PaginatedProductListResponse> {
    // Default pagination values
    const page = query?.page && query.page > 0 ? query.page : 1;
    const limit = query?.limit && query.limit > 0 ? Math.min(query.limit, 100) : 20; // Max 100 per page
    const skip = (page - 1) * limit;

    // Build where clause for search
    const where: any = {};
    if (query?.search && query.search.trim()) {
        const searchTerm = query.search.trim();
        where.OR = [
            {
                name: {
                    contains: searchTerm,
                    mode: 'insensitive', // Case-insensitive search
                },
            },
            {
                barcode: {
                    contains: searchTerm,
                    mode: 'insensitive',
                },
            },
        ];
    }

    // Get total count for pagination
    const total = await prisma.product.count({ where });

    // Fetch products with their batches (with pagination)
    const products = await prisma.product.findMany({
        where,
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
        skip,
        take: limit,
    });

    // Calculate today and 30 days from now for expiry check
    const today = new Date();
    const thirtyDaysFromNow = new Date(today);
    thirtyDaysFromNow.setDate(today.getDate() + 30);

    // Set time to start/end of day for accurate day-based comparison
    today.setHours(0, 0, 0, 0);
    thirtyDaysFromNow.setHours(23, 59, 59, 999);

    // Transform products to include calculated fields
    const data = products.map((product) => {
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

    // Calculate total pages
    const totalPages = Math.ceil(total / limit);

    return {
        data,
        pagination: {
            page,
            limit,
            total,
            totalPages,
        },
    };
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

