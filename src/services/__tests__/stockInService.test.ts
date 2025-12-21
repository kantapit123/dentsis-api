import { stockInService } from '../stockInService';
import { prisma } from '../../lib/prisma';
import { StockInItem } from '../../types/stock.types';
import { $Enums } from '../../../generated/prisma/client';

// Mock Prisma client
jest.mock('../../lib/prisma', () => ({
  prisma: {
    $transaction: jest.fn(),
    product: {
      findUnique: jest.fn(),
    },
    stockBatch: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    stockMovement: {
      create: jest.fn(),
    },
  },
}));

describe('stockInService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('when product exists and batch does not exist', () => {
    it('should create new batch and movement record', async () => {
      const mockProduct = {
        id: 'product-1',
        name: 'Test Product',
        barcode: '123456',
        unit: 'box',
        minStock: 10,
        createdAt: new Date(),
      };

      const items: StockInItem[] = [
        {
          barcode: '123456',
          quantity: 50,
          lotNumber: 'LOT001',
          expireDate: '2025-12-31',
        },
      ];

      const mockBatch = {
        id: 'batch-1',
        productId: 'product-1',
        lotNumber: 'LOT001',
        expireDate: new Date('2025-12-31'),
        quantity: 50,
        createdAt: new Date(),
      };

      const mockMovement = {
        id: 'movement-1',
        productId: 'product-1',
        batchId: 'batch-1',
        lotNumber: 'LOT001',
        type: $Enums.StockMovementType.IN,
        quantity: 50,
        sessionId: 'session-1',
        createdAt: new Date(),
      };

      (prisma.product.findUnique as jest.Mock).mockResolvedValue(mockProduct);
      (prisma.stockBatch.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.stockBatch.create as jest.Mock).mockResolvedValue(mockBatch);
      (prisma.stockMovement.create as jest.Mock).mockResolvedValue(mockMovement);

      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        return callback(prisma);
      });

      const result = await stockInService(items);

      expect(result.results).toHaveLength(1);
      expect(result.results[0].success).toBe(true);
      expect(result.results[0].barcode).toBe('123456');
      expect(result.results[0].quantity).toBe(50);
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.product.findUnique).toHaveBeenCalledWith({
        where: { barcode: '123456' },
      });
      expect(prisma.stockBatch.findFirst).toHaveBeenCalledWith({
        where: {
          productId: 'product-1',
          lotNumber: 'LOT001',
        },
      });
      expect(prisma.stockBatch.create).toHaveBeenCalledWith({
        data: {
          productId: 'product-1',
          lotNumber: 'LOT001',
          expireDate: new Date('2025-12-31'),
          quantity: 50,
        },
      });
      expect(prisma.stockMovement.create).toHaveBeenCalled();
    });
  });

  describe('when product exists and batch already exists', () => {
    it('should update existing batch quantity and create movement record', async () => {
      const mockProduct = {
        id: 'product-1',
        name: 'Test Product',
        barcode: '123456',
        unit: 'box',
        minStock: 10,
        createdAt: new Date(),
      };

      const existingBatch = {
        id: 'batch-1',
        productId: 'product-1',
        lotNumber: 'LOT001',
        expireDate: new Date('2025-12-31'),
        quantity: 30,
        createdAt: new Date(),
      };

      const items: StockInItem[] = [
        {
          barcode: '123456',
          quantity: 20,
          lotNumber: 'LOT001',
          expireDate: '2025-12-31',
        },
      ];

      const updatedBatch = {
        ...existingBatch,
        quantity: 50,
      };

      const mockMovement = {
        id: 'movement-1',
        productId: 'product-1',
        batchId: 'batch-1',
        lotNumber: 'LOT001',
        type: $Enums.StockMovementType.IN,
        quantity: 20,
        sessionId: 'session-1',
        createdAt: new Date(),
      };

      (prisma.product.findUnique as jest.Mock).mockResolvedValue(mockProduct);
      (prisma.stockBatch.findFirst as jest.Mock).mockResolvedValue(existingBatch);
      (prisma.stockBatch.update as jest.Mock).mockResolvedValue(updatedBatch);
      (prisma.stockMovement.create as jest.Mock).mockResolvedValue(mockMovement);

      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        return callback(prisma);
      });

      const result = await stockInService(items);

      expect(result.results).toHaveLength(1);
      expect(result.results[0].success).toBe(true);
      expect(prisma.stockBatch.update).toHaveBeenCalledWith({
        where: { id: 'batch-1' },
        data: { quantity: { increment: 20 } },
      });
      expect(prisma.stockBatch.create).not.toHaveBeenCalled();
    });
  });

  describe('when product does not exist', () => {
    it('should return error for non-existent product', async () => {
      const items: StockInItem[] = [
        {
          barcode: 'INVALID',
          quantity: 50,
          lotNumber: 'LOT001',
          expireDate: '2025-12-31',
        },
      ];

      (prisma.product.findUnique as jest.Mock).mockResolvedValue(null);

      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        return callback(prisma);
      });

      const result = await stockInService(items);

      expect(result.results).toHaveLength(1);
      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toContain('Product not found');
      expect(prisma.stockBatch.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('when processing bulk items', () => {
    it('should process all items in a single transaction with same sessionId', async () => {
      const mockProduct1 = {
        id: 'product-1',
        name: 'Product 1',
        barcode: '123456',
        unit: 'box',
        minStock: 10,
        createdAt: new Date(),
      };

      const mockProduct2 = {
        id: 'product-2',
        name: 'Product 2',
        barcode: '789012',
        unit: 'unit',
        minStock: 5,
        createdAt: new Date(),
      };

      const items: StockInItem[] = [
        {
          barcode: '123456',
          quantity: 50,
          lotNumber: 'LOT001',
          expireDate: '2025-12-31',
        },
        {
          barcode: '789012',
          quantity: 30,
          lotNumber: 'LOT002',
          expireDate: '2025-06-30',
        },
      ];

      const mockBatch1 = {
        id: 'batch-1',
        productId: 'product-1',
        lotNumber: 'LOT001',
        expireDate: new Date('2025-12-31'),
        quantity: 50,
        createdAt: new Date(),
      };

      const mockBatch2 = {
        id: 'batch-2',
        productId: 'product-2',
        lotNumber: 'LOT002',
        expireDate: new Date('2025-06-30'),
        quantity: 30,
        createdAt: new Date(),
      };

      (prisma.product.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockProduct1)
        .mockResolvedValueOnce(mockProduct2);
      (prisma.stockBatch.findFirst as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      (prisma.stockBatch.create as jest.Mock)
        .mockResolvedValueOnce(mockBatch1)
        .mockResolvedValueOnce(mockBatch2);
      (prisma.stockMovement.create as jest.Mock)
        .mockResolvedValue({ id: 'movement-1' })
        .mockResolvedValue({ id: 'movement-2' });

      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        return callback(prisma);
      });

      const result = await stockInService(items);

      expect(result.results).toHaveLength(2);
      expect(result.results[0].success).toBe(true);
      expect(result.results[1].success).toBe(true);
      expect(result.sessionId).toBeDefined();
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });
});

