/**
 * Stock-in request item
 */
export interface StockInItem {
  barcode: string;
  quantity: number;
  lotNumber: string;
  expireDate: string; // ISO date string
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

