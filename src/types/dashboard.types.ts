/**
 * Dashboard summary response
 */
export interface DashboardSummary {
  totalProducts: number;
  lowStockCount: number;
  nearExpiryCount: number;
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
 * Product list query parameters
 */
export interface ProductListQuery {
  search?: string;
  page?: number;
  limit?: number;
}

