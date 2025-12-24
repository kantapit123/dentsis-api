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
  totalQuantity: number;
  nearExpiry: boolean;
  expireDate: string | null; // ISO date string of earliest expiring batch, or null if no expiration
  isExpired: boolean; // true if any batch has expired
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

