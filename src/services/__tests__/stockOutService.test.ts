import { stockOutService } from '../stockOutService';
import { prisma } from '../../prisma';
import { StockOutItem } from '../../types/stock.types';

// Mock Prisma client
jest.mock('../../prisma', () => ({
  prisma: {
    $transaction: jest.fn(),
    product: {
      findUnique: jest.fn(),
    },
    stockBatch: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    stockMovement: {
      create: jest.fn(),
    },
  },
}));

describe('stockOutService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Strict FIFO algorithm - single batch sufficient', () => {
    it('should deduct from earliest received batch when single batch has enough stock', async () => {
      const mockProduct = {
        id: 'product-1',
        name: 'Test Product',
        barcode: '123456',
        unit: 'box',
        minStock: 10,
        isReusable: false,
        createdAt: new Date(),
      };

      const mockBatches = [
        {
          id: 'batch-1',
          productId: 'product-1',
          lotNumber: 'LOT001',
          expireDate: new Date('2025-12-31'),
          receivedAt: new Date('2025-01-10T00:00:00.000Z'), // Earliest received
          quantity: 100,
          createdAt: new Date(),
        },
        {
          id: 'batch-2',
          productId: 'product-1',
          lotNumber: 'LOT002',
          expireDate: new Date('2025-01-31'), // Earlier expiry but later received
          receivedAt: new Date('2025-02-10T00:00:00.000Z'),
          quantity: 50,
          createdAt: new Date(),
        },
      ];

      const items: StockOutItem[] = [
        {
          barcode: '123456',
          quantity: 30,
        },
      ];

      const updatedBatch = {
        ...mockBatches[0],
        quantity: 70, // 100 - 30
      };

      (prisma.product.findUnique as jest.Mock).mockResolvedValue(mockProduct);
      (prisma.stockBatch.findMany as jest.Mock).mockResolvedValue(mockBatches);
      (prisma.stockBatch.update as jest.Mock).mockResolvedValue(updatedBatch);
      (prisma.stockMovement.create as jest.Mock).mockResolvedValue({
        id: 'movement-1',
      });

      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        return callback(prisma);
      });

      const result = await stockOutService(items);

      expect(result.results).toHaveLength(1);
      expect(result.results[0].success).toBe(true);
      expect(result.results[0].requestedQuantity).toBe(30);
      expect(result.results[0].deductedQuantity).toBe(30);
      expect(result.results[0].batches).toHaveLength(1);
      expect(result.results[0].batches[0].batchId).toBe('batch-1');
      expect(result.results[0].batches[0].quantity).toBe(30);

      // Verify strict FIFO query
      expect(prisma.stockBatch.findMany).toHaveBeenCalledWith({
        where: {
          productId: 'product-1',
          quantity: { gt: 0 },
          OR: [
            { expireDate: null },
            { expireDate: { gte: expect.any(Date) } },
          ],
        },
        orderBy: [{ receivedAt: 'asc' }, { createdAt: 'asc' }],
      });

      // Should only update the first batch
      expect(prisma.stockBatch.update).toHaveBeenCalledTimes(1);
      expect(prisma.stockBatch.update).toHaveBeenCalledWith({
        where: { id: 'batch-1' },
        data: { quantity: { decrement: 30 } },
      });

      // Should create one movement record
      expect(prisma.stockMovement.create).toHaveBeenCalledTimes(1);
      expect(prisma.stockMovement.create).toHaveBeenCalledWith({
        data: {
          productId: 'product-1',
          batchId: 'batch-1',
          lotNumber: 'LOT001',
          type: 'OUT',
          quantity: 30,
          sessionId: expect.any(String),
        },
      });
    });
  });

  describe('Strict FIFO algorithm - multiple batches needed', () => {
    it('should deduct across multiple batches in FIFO order', async () => {
      const mockProduct = {
        id: 'product-1',
        name: 'Test Product',
        barcode: '123456',
        unit: 'box',
        minStock: 10,
        isReusable: false,
        createdAt: new Date(),
      };

      const mockBatches = [
        {
          id: 'batch-1',
          productId: 'product-1',
          lotNumber: 'LOT001',
          expireDate: new Date('2025-12-31'),
          receivedAt: new Date('2025-01-01T00:00:00.000Z'),
          quantity: 20, // Not enough
          createdAt: new Date(),
        },
        {
          id: 'batch-2',
          productId: 'product-1',
          lotNumber: 'LOT002',
          expireDate: new Date('2025-01-31'), // Earlier expiry but received later
          receivedAt: new Date('2025-02-01T00:00:00.000Z'),
          quantity: 30, // Still not enough
          createdAt: new Date(),
        },
        {
          id: 'batch-3',
          productId: 'product-1',
          lotNumber: 'LOT003',
          expireDate: new Date('2026-12-31'),
          receivedAt: new Date('2025-03-01T00:00:00.000Z'),
          quantity: 50,
          createdAt: new Date(),
        },
      ];

      const items: StockOutItem[] = [
        {
          barcode: '123456',
          quantity: 40, // Need 40, will take 20 from batch-1, 20 from batch-2
        },
      ];

      const updatedBatch1 = { ...mockBatches[0], quantity: 0 };
      const updatedBatch2 = { ...mockBatches[1], quantity: 10 };

      (prisma.product.findUnique as jest.Mock).mockResolvedValue(mockProduct);
      (prisma.stockBatch.findMany as jest.Mock).mockResolvedValue(mockBatches);
      (prisma.stockBatch.update as jest.Mock)
        .mockResolvedValueOnce(updatedBatch1)
        .mockResolvedValueOnce(updatedBatch2);
      (prisma.stockMovement.create as jest.Mock)
        .mockResolvedValue({ id: 'movement-1' })
        .mockResolvedValue({ id: 'movement-2' });

      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        return callback(prisma);
      });

      const result = await stockOutService(items);

      expect(result.results).toHaveLength(1);
      expect(result.results[0].success).toBe(true);
      expect(result.results[0].deductedQuantity).toBe(40);
      expect(result.results[0].batches).toHaveLength(2);
      expect(result.results[0].batches[0].batchId).toBe('batch-1');
      expect(result.results[0].batches[0].quantity).toBe(20);
      expect(result.results[0].batches[1].batchId).toBe('batch-2');
      expect(result.results[0].batches[1].quantity).toBe(20);

      // Should update batches in received order
      expect(prisma.stockBatch.update).toHaveBeenCalledTimes(2);
      expect(prisma.stockBatch.update).toHaveBeenNthCalledWith(1, {
        where: { id: 'batch-1' },
        data: { quantity: { decrement: 20 } },
      });
      expect(prisma.stockBatch.update).toHaveBeenNthCalledWith(2, {
        where: { id: 'batch-2' },
        data: { quantity: { decrement: 20 } },
      });

      // Should create two movement records
      expect(prisma.stockMovement.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('expired batches', () => {
    it('should skip expired batches and only use non-expired stock', async () => {
      const mockProduct = {
        id: 'product-1',
        name: 'Test Product',
        barcode: '123456',
        unit: 'box',
        minStock: 10,
        isReusable: false,
        createdAt: new Date(),
      };

      const mockBatches = [
        {
          id: 'batch-fresh',
          productId: 'product-1',
          lotNumber: 'LOT-FRESH',
          expireDate: new Date('2999-12-31'),
          receivedAt: new Date('2025-01-01T00:00:00.000Z'),
          quantity: 12,
          createdAt: new Date(),
        },
      ];

      (prisma.product.findUnique as jest.Mock).mockResolvedValue(mockProduct);
      (prisma.stockBatch.findMany as jest.Mock).mockResolvedValue(mockBatches);
      (prisma.stockBatch.update as jest.Mock).mockResolvedValue({ ...mockBatches[0], quantity: 2 });
      (prisma.stockMovement.create as jest.Mock).mockResolvedValue({ id: 'movement-1' });

      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => callback(prisma));

      const items: StockOutItem[] = [{ barcode: '123456', quantity: 10 }];
      const result = await stockOutService(items);

      expect(result.results[0].success).toBe(true);
      expect(result.results[0].batches).toEqual([
        { batchId: 'batch-fresh', lotNumber: 'LOT-FRESH', quantity: 10 },
      ]);
      expect(prisma.stockBatch.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [{ expireDate: null }, { expireDate: { gte: expect.any(Date) } }],
          }),
        })
      );
    });
  });

  describe('insufficient stock', () => {
    it('should throw error when total available stock is insufficient', async () => {
      const mockProduct = {
        id: 'product-1',
        name: 'Test Product',
        barcode: '123456',
        unit: 'box',
        minStock: 10,
        isReusable: false,
        createdAt: new Date(),
      };

      const mockBatches = [
        {
          id: 'batch-1',
          productId: 'product-1',
          lotNumber: 'LOT001',
          expireDate: new Date('2025-01-31'),
          receivedAt: new Date('2025-01-01T00:00:00.000Z'),
          quantity: 20,
          createdAt: new Date(),
        },
        {
          id: 'batch-2',
          productId: 'product-1',
          lotNumber: 'LOT002',
          expireDate: new Date('2025-12-31'),
          receivedAt: new Date('2025-02-01T00:00:00.000Z'),
          quantity: 10,
          createdAt: new Date(),
        },
      ];

      const items: StockOutItem[] = [
        {
          barcode: '123456',
          quantity: 50, // Requesting 50, but only 30 available
        },
      ];

      (prisma.product.findUnique as jest.Mock).mockResolvedValue(mockProduct);
      (prisma.stockBatch.findMany as jest.Mock).mockResolvedValue(mockBatches);

      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        return callback(prisma);
      });

      await expect(stockOutService(items)).rejects.toThrow(
        'Insufficient stock'
      );

      // Should not update any batches
      expect(prisma.stockBatch.update).not.toHaveBeenCalled();
      expect(prisma.stockMovement.create).not.toHaveBeenCalled();
    });
  });

  describe('product not found', () => {
    it('should return error when product does not exist', async () => {
      const items: StockOutItem[] = [
        {
          barcode: 'INVALID',
          quantity: 10,
        },
      ];

      (prisma.product.findUnique as jest.Mock).mockResolvedValue(null);

      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        return callback(prisma);
      });

      const result = await stockOutService(items);

      expect(result.results).toHaveLength(1);
      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toContain('Product not found');
      expect(prisma.stockBatch.findMany).not.toHaveBeenCalled();
    });
  });

  describe('no batches available', () => {
    it('should throw error when no batches with quantity > 0 exist', async () => {
      const mockProduct = {
        id: 'product-1',
        name: 'Test Product',
        barcode: '123456',
        unit: 'box',
        minStock: 10,
        isReusable: false,
        createdAt: new Date(),
      };

      const items: StockOutItem[] = [
        {
          barcode: '123456',
          quantity: 10,
        },
      ];

      (prisma.product.findUnique as jest.Mock).mockResolvedValue(mockProduct);
      (prisma.stockBatch.findMany as jest.Mock).mockResolvedValue([]);

      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        return callback(prisma);
      });

      await expect(stockOutService(items)).rejects.toThrow(
        'Insufficient stock'
      );
    });
  });

  describe('bulk operations', () => {
    it('should process multiple items in single transaction with same sessionId', async () => {
      const mockProduct1 = {
        id: 'product-1',
        name: 'Product 1',
        barcode: '123456',
        unit: 'box',
        minStock: 10,
        isReusable: false,
        createdAt: new Date(),
      };

      const mockProduct2 = {
        id: 'product-2',
        name: 'Product 2',
        barcode: '789012',
        unit: 'unit',
        minStock: 5,
        isReusable: false,
        createdAt: new Date(),
      };

      const mockBatches1 = [
        {
          id: 'batch-1',
          productId: 'product-1',
          lotNumber: 'LOT001',
          expireDate: new Date('2025-01-31'),
          receivedAt: new Date('2025-01-01T00:00:00.000Z'),
          quantity: 100,
          createdAt: new Date(),
        },
      ];

      const mockBatches2 = [
        {
          id: 'batch-2',
          productId: 'product-2',
          lotNumber: 'LOT002',
          expireDate: new Date('2025-06-30'),
          receivedAt: new Date('2025-01-01T00:00:00.000Z'),
          quantity: 50,
          createdAt: new Date(),
        },
      ];

      const items: StockOutItem[] = [
        { barcode: '123456', quantity: 30 },
        { barcode: '789012', quantity: 20 },
      ];

      (prisma.product.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockProduct1)
        .mockResolvedValueOnce(mockProduct2);
      (prisma.stockBatch.findMany as jest.Mock)
        .mockResolvedValueOnce(mockBatches1)
        .mockResolvedValueOnce(mockBatches2);
      (prisma.stockBatch.update as jest.Mock)
        .mockResolvedValue({ ...mockBatches1[0], quantity: 70 })
        .mockResolvedValue({ ...mockBatches2[0], quantity: 30 });
      (prisma.stockMovement.create as jest.Mock)
        .mockResolvedValue({ id: 'movement-1' })
        .mockResolvedValue({ id: 'movement-2' });

      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        return callback(prisma);
      });

      const result = await stockOutService(items);

      expect(result.results).toHaveLength(2);
      expect(result.results[0].success).toBe(true);
      expect(result.results[1].success).toBe(true);
      expect(result.sessionId).toBeDefined();
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });
});

