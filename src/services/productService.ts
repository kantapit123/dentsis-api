import { prisma } from '../prisma';
import {
    ProductBatchDetail,
    ProductBatchStatus,
    ProductListItem,
    PaginatedProductListResponse,
    ProductListQuery,
} from '../types/dashboard.types';

const NEAR_EXPIRY_THRESHOLD_MONTHS = 6;

function parseExpireDate(value: Date | string | number | null | undefined): Date | null {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfDay(date: Date): Date {
    const cloned = new Date(date);
    cloned.setHours(0, 0, 0, 0);
    return cloned;
}

function endOfDay(date: Date): Date {
    const cloned = new Date(date);
    cloned.setHours(23, 59, 59, 999);
    return cloned;
}

function addMonths(date: Date, months: number): Date {
    const cloned = new Date(date);
    cloned.setMonth(cloned.getMonth() + months);
    return cloned;
}

function classifyBatchStatus(
    quantity: number,
    expireDate: Date | null,
    today: Date,
    nearExpiryCutoff: Date
): ProductBatchStatus {
    if (quantity === 0) return 'DEPLETED';
    if (expireDate === null) return 'NO_EXPIRY';

    const normalizedExpireDate = new Date(expireDate);
    normalizedExpireDate.setHours(0, 0, 0, 0);

    if (normalizedExpireDate < today) return 'EXPIRED';
    if (normalizedExpireDate < nearExpiryCutoff) return 'NEAR_EXPIRY';
    return 'ACTIVE';
}

/**
 * Retrieves product list with stock information
 * 
 * - totalQuantity: Sum of all batches per product
 * - nearExpiry: true if any batch expires in less than 6 months
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

    // Fetch all products with their batches (we need all to calculate status)
    // Status filtering will be done in memory after calculation
    const allProducts = await prisma.product.findMany({
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
    });

    // Calculate today and six months cutoff for expiry check
    const now = new Date();
    const today = startOfDay(now);
    const nearExpiryCutoff = startOfDay(addMonths(today, NEAR_EXPIRY_THRESHOLD_MONTHS));

    // Transform products to include calculated fields
    let data = allProducts.map((product) => {
        // Calculate total quantity from batches
        const totalQuantity = product.stockBatches.reduce(
            (sum, batch) => sum + batch.quantity,
            0
        );

        // Find valid expire dates from all batches (for products with expiration)
        const validExpireDates = product.stockBatches
            .map((batch) => parseExpireDate(batch.expireDate))
            .filter((date): date is Date => date !== null);

        // Near expiry must be based on non-depleted batches only
        const nearExpiry = product.stockBatches.some((batch) => {
            if (batch.quantity <= 0) return false;
            const expireDateObj = parseExpireDate(batch.expireDate);
            if (!expireDateObj) return false;
            const normalizedExpireDate = startOfDay(expireDateObj);
            return normalizedExpireDate >= today && normalizedExpireDate < nearExpiryCutoff;
        });

        const expireDate = validExpireDates.length > 0
            ? new Date(Math.min(...validExpireDates.map(d => d.getTime()))).toISOString()
            : null;

        // Check if any batch has expired (expireDate < today)
        const isExpired = validExpireDates.some((expireDateObj) => {
            const expireDateCopy = new Date(expireDateObj);
            expireDateCopy.setHours(0, 0, 0, 0);
            return expireDateCopy < today;
        });

        // For reusable items: totalQuantity = warehouse + in_use
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

    // Filter by status if provided
    if (query?.status) {
        data = data.filter((product) => {
            // For reusable items, isOutOfStock = warehouse AND inUse are both 0
            const isOutOfStock = product.isReusable
                ? product.warehouseQuantity === 0 && product.inUseQuantity === 0
                : product.warehouseQuantity === 0;

            switch (query.status) {
                case 'lowStock':
                    return !isOutOfStock && product.warehouseQuantity <= product.minStock;
                case 'nearExpiry':
                    return product.nearExpiry === true;
                case 'inStock':
                    return !isOutOfStock && product.warehouseQuantity > product.minStock;
                case 'outOfStock':
                    return isOutOfStock;
                case 'expired':
                    return product.isExpired === true;
                default:
                    return true;
            }
        });
    }

    // Get total count after status filtering
    const total = data.length;

    // Apply pagination after filtering
    const paginatedData = data.slice(skip, skip + limit);

    // Calculate total pages
    const totalPages = Math.ceil(total / limit);

    return {
        data: paginatedData,
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
                    id: true,
                    lotNumber: true,
                    quantity: true,
                    expireDate: true,
                    receivedAt: true,
                },
            },
        },
    });
    if (!product) {
        throw new Error('Product not found please add the product first');
    }

    const now = new Date();
    const today = startOfDay(now);
    const nearExpiryCutoff = startOfDay(addMonths(today, NEAR_EXPIRY_THRESHOLD_MONTHS));


    const totalQuantity = product.stockBatches.reduce(
        (sum, batch) => sum + batch.quantity,
        0
    );

    const nearExpiry = product.stockBatches.some((batch) => {
        if (batch.quantity <= 0) return false;
        const expireDateObj = parseExpireDate(batch.expireDate);
        if (!expireDateObj) return false;
        const normalizedExpireDate = startOfDay(expireDateObj);
        return normalizedExpireDate >= today && normalizedExpireDate < nearExpiryCutoff;
    });

    // Find earliest expireDate from all batches (for products with expiration)
    const validExpireDates = product.stockBatches
        .map((batch) => parseExpireDate(batch.expireDate))
        .filter((date): date is Date => date !== null);

    const expireDate = validExpireDates.length > 0
        ? new Date(Math.min(...validExpireDates.map(d => d.getTime()))).toISOString()
        : null;

    // Check if any batch has expired (expireDate < today)
    const isExpired = validExpireDates.some((expireDateObj) => {
        const expireDateCopy = new Date(expireDateObj);
        expireDateCopy.setHours(0, 0, 0, 0);
        return expireDateCopy < today;
    });

    const warehouseQuantity = totalQuantity;
    const effectiveTotalQuantity = product.isReusable
        ? warehouseQuantity + product.inUseQuantity
        : warehouseQuantity;

    const batches: ProductBatchDetail[] = product.stockBatches
        .map((batch) => {
            const parsedExpireDate = batch.expireDate
                ? new Date(batch.expireDate)
                : null;

            return {
                batchId: batch.id,
                lotNumber: batch.lotNumber,
                receivedAt: batch.receivedAt.toISOString(),
                expireDate: parsedExpireDate ? parsedExpireDate.toISOString() : null,
                quantity: batch.quantity,
                status: classifyBatchStatus(batch.quantity, parsedExpireDate, today, nearExpiryCutoff),
            };
        })
        .sort(
            (a, b) =>
                new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime()
        );

    const batchSummary = batches.reduce(
        (summary, batch) => {
            summary.totalBatches += 1;
            if (batch.status === 'DEPLETED') {
                summary.depletedBatches += 1;
            } else if (batch.status === 'EXPIRED') {
                summary.expiredBatches += 1;
            } else {
                summary.activeBatches += 1;
            }
            return summary;
        },
        {
            totalBatches: 0,
            activeBatches: 0,
            expiredBatches: 0,
            depletedBatches: 0,
        }
    );

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
        batchSummary,
        batches,
    };
}

