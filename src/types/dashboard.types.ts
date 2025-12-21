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

