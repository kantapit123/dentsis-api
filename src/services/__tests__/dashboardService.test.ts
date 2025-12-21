import { dashboardService } from '../dashboardService';
import { prisma } from '../../prisma';

// Mock Prisma client
jest.mock('../../prisma', () => ({
  prisma: {
    product: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    stockBatch: {
      findMany: jest.fn(),
      aggregate: jest.fn(),
    },
  },
}));

describe('dashboardService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('when calculating dashboard summary', () => {
    it('should calculate total products correctly', async () => {
      (prisma.product.count as jest.Mock).mockResolvedValue(10);
      (prisma.stockBatch.aggregate as jest.Mock).mockResolvedValue({
        _sum: { quantity: 1000 },
      });
      (prisma.product.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.stockBatch.findMany as jest.Mock).mockResolvedValue([]);

      const result = await dashboardService();

      expect(result.totalProducts).toBe(10);
      expect(prisma.product.count).toHaveBeenCalled();
    });

    it('should calculate total stock quantity from all batches', async () => {
      (prisma.product.count as jest.Mock).mockResolvedValue(5);
      (prisma.stockBatch.aggregate as jest.Mock).mockResolvedValue({
        _sum: { quantity: 2500 },
      });
      (prisma.product.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.stockBatch.findMany as jest.Mock).mockResolvedValue([]);

      const result = await dashboardService();

      expect(result.totalStockQuantity).toBe(2500);
      expect(prisma.stockBatch.aggregate).toHaveBeenCalledWith({
        _sum: {
          quantity: true,
        },
      });
    });

    it('should calculate low stock count correctly', async () => {
      const mockProducts = [
        {
          id: 'product-1',
          name: 'Product A',
          minStock: 100,
          stockBatches: [{ quantity: 50 }], // Below minStock
        },
        {
          id: 'product-2',
          name: 'Product B',
          minStock: 50,
          stockBatches: [{ quantity: 60 }], // Above minStock
        },
        {
          id: 'product-3',
          name: 'Product C',
          minStock: 30,
          stockBatches: [{ quantity: 20 }], // Below minStock
        },
      ];

      (prisma.product.count as jest.Mock).mockResolvedValue(3);
      (prisma.stockBatch.aggregate as jest.Mock).mockResolvedValue({
        _sum: { quantity: 130 },
      });
      (prisma.product.findMany as jest.Mock).mockResolvedValue(mockProducts);
      (prisma.stockBatch.findMany as jest.Mock).mockResolvedValue([]);

      const result = await dashboardService();

      expect(result.lowStockCount).toBe(2); // product-1 and product-3
      expect(prisma.product.findMany).toHaveBeenCalledWith({
        include: {
          stockBatches: {
            select: {
              quantity: true,
            },
          },
        },
      });
    });

    it('should calculate near expiry count correctly', async () => {
      const today = new Date();
      const within30Days = new Date(today);
      within30Days.setDate(today.getDate() + 20); // 20 days from now

      const beyond30Days = new Date(today);
      beyond30Days.setDate(today.getDate() + 45); // 45 days from now

      const mockBatches = [
        {
          productId: 'product-1',
          expireDate: within30Days, // Within 30 days
        },
        {
          productId: 'product-2',
          expireDate: beyond30Days, // Beyond 30 days
        },
        {
          productId: 'product-1',
          expireDate: beyond30Days, // Same product, but this batch is fine
        },
        {
          productId: 'product-3',
          expireDate: within30Days, // Within 30 days
        },
      ];

      (prisma.product.count as jest.Mock).mockResolvedValue(3);
      (prisma.stockBatch.aggregate as jest.Mock).mockResolvedValue({
        _sum: { quantity: 100 },
      });
      (prisma.product.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.stockBatch.findMany as jest.Mock).mockResolvedValue(mockBatches);

      const result = await dashboardService();

      // Should count unique products with near expiry batches
      expect(result.nearExpiryCount).toBe(2); // product-1 and product-3
      expect(prisma.stockBatch.findMany).toHaveBeenCalled();
    });

    it('should handle products with no batches', async () => {
      (prisma.product.count as jest.Mock).mockResolvedValue(5);
      (prisma.stockBatch.aggregate as jest.Mock).mockResolvedValue({
        _sum: { quantity: 0 },
      });
      (prisma.product.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'product-1',
          minStock: 10,
          stockBatches: [], // No batches
        },
      ]);
      (prisma.stockBatch.findMany as jest.Mock).mockResolvedValue([]);

      const result = await dashboardService();

      expect(result.lowStockCount).toBe(1); // Product with no stock is low stock
      expect(result.totalStockQuantity).toBe(0);
    });

    it('should return zero values when no data exists', async () => {
      (prisma.product.count as jest.Mock).mockResolvedValue(0);
      (prisma.stockBatch.aggregate as jest.Mock).mockResolvedValue({
        _sum: { quantity: null },
      });
      (prisma.product.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.stockBatch.findMany as jest.Mock).mockResolvedValue([]);

      const result = await dashboardService();

      expect(result.totalProducts).toBe(0);
      expect(result.lowStockCount).toBe(0);
      expect(result.nearExpiryCount).toBe(0);
      expect(result.totalStockQuantity).toBe(0);
    });
  });
});

