/**
 * Dashboard summary response
 */
export interface DashboardSummary {
  totalProducts: number;
  lowStockCount: number;
  nearExpiryCount: number;
  expiredCount: number;
  totalStockQuantity: number;
}

/**
 * Product list item response
 */
export interface ProductListItem {
  id: string;
  name: string;
  barcode: string;
  unit: string;
  minStock: number;
  isReusable: boolean;
  warehouseQuantity: number; // Quantity available in warehouse (from batches)
  inUseQuantity: number;     // Quantity currently in use (reusable items only)
  totalQuantity: number;     // warehouseQuantity + inUseQuantity
  nearExpiry: boolean;
  expireDate: string | null; // ISO date string of earliest expiring batch, or null if no expiration
  isExpired: boolean; // true if any batch has expired
  batchSummary?: ProductBatchSummary;
  batches?: ProductBatchDetail[];
}

export type ProductBatchStatus = 'DEPLETED' | 'EXPIRED' | 'NEAR_EXPIRY' | 'ACTIVE' | 'NO_EXPIRY';

export interface ProductBatchSummary {
  totalBatches: number;
  activeBatches: number;
  expiredBatches: number;
  depletedBatches: number;
}

export interface ProductBatchDetail {
  batchId: string;
  lotNumber: string;
  receivedAt: string;
  expireDate: string | null;
  quantity: number;
  status: ProductBatchStatus;
}

/**
 * Pagination metadata
 */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Paginated product list response
 */
export interface PaginatedProductListResponse {
  data: ProductListItem[];
  pagination: PaginationMeta;
}

/**
 * Product status filter options
 */
export type ProductStatus = 'lowStock' | 'nearExpiry' | 'inStock' | 'outOfStock' | 'expired';

/**
 * Product list query parameters
 */
export interface ProductListQuery {
  search?: string;
  page?: number;
  limit?: number;
  status?: ProductStatus;
}

