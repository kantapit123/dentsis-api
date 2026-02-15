/**
 * Stock-in request item
 */
export interface StockInItem {
  barcode: string;
  quantity: number;
  lotNumber?: string; // Optional - backend auto-generates if omitted
  expireDate: string | null; // ISO date string or null for products without expiration
}

/**
 * Stock-in request body
 */
export interface StockInRequest {
  items: StockInItem[];
}

/**
 * Stock-in result for a single item
 */
export interface StockInItemResult {
  barcode: string;
  productId: string;
  batchId: string;
  lotNumber: string;
  quantity: number;
  success: boolean;
  error?: string;
}

/**
 * Stock-in response
 */
export interface StockInResponse {
  sessionId: string;
  results: StockInItemResult[];
}

/**
 * Stock-out request item
 */
export interface StockOutItem {
  barcode: string;
  quantity: number;
}

/**
 * Stock-out request body
 */
export interface StockOutRequest {
  items: StockOutItem[];
}

/**
 * Stock-out batch deduction detail
 */
export interface StockOutBatchDeduction {
  batchId: string;
  lotNumber: string;
  quantity: number;
}

/**
 * Stock-out result for a single item
 */
export interface StockOutItemResult {
  barcode: string;
  productId: string;
  requestedQuantity: number;
  deductedQuantity: number;
  batches: StockOutBatchDeduction[];
  success: boolean;
  error?: string;
}

/**
 * Stock-out response
 */
export interface StockOutResponse {
  sessionId: string;
  results: StockOutItemResult[];
}

/**
 * Lot breakdown for a stock movement session
 */
export interface StockLogLotBreakdown {
  lotNumber: string;
  quantity: number;
}

/**
 * Stock movement log entry grouped by session
 */
export interface StockLogEntry {
  sessionId: string;
  productName: string;
  productId: string;
  type: 'IN' | 'OUT';
  timestamp: Date;
  totalQuantity: number;
  lots: StockLogLotBreakdown[];
}

/**
 * Stock logs response
 */
export interface StockLogsResponse {
  logs: StockLogEntry[];
  total: number;
}

/**
 * Stock log entry for API response (grouped by sessionId only)
 */
export interface StockLogResponseEntry {
  sessionId: string | null;
  type: 'IN' | 'OUT';
  createdAt: string; // ISO date string
  productName: string;
  totalQuantity: number;
  lots: Array<{
    lot: string;
    quantity: number;
  }>;
}

/**
 * Query filters for stock logs
 */
export interface StockLogFilters {
  type?: 'IN' | 'OUT';
  fromDate?: string; // YYYY-MM-DD
  toDate?: string; // YYYY-MM-DD
  filter?: 'today' | '7days'; // Predefined date filters
}

