import { productListService } from '../productListService';
import { prisma } from '../../prisma';

// Mock Prisma client
jest.mock('../../prisma', () => ({
  prisma: {
    product: {
      findMany: jest.fn(),
    },
  },
}));

describe('productListService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('when fetching product list', () => {
    it('should calculate totalQuantity from batches correctly', async () => {
      const mockProducts = [
        {
          id: 'product-1',
          name: 'Product A',
          barcode: '123456',
          unit: 'box',
          minStock: 100,
          stockBatches: [
            { quantity: 50 },
            { quantity: 30 },
            { quantity: 20 },
          ],
        },
        {
          id: 'product-2',
          name: 'Product B',
          barcode: '789012',
          unit: 'unit',
          minStock: 50,
          stockBatches: [
            { quantity: 60 },
          ],
        },
      ];

      (prisma.product.findMany as jest.Mock).mockResolvedValue(mockProducts);

      const result = await productListService();

      expect(result).toHaveLength(2);
      expect(result[0].totalQuantity).toBe(100); // 50 + 30 + 20
      expect(result[1].totalQuantity).toBe(60);
      expect(prisma.product.findMany).toHaveBeenCalledWith({
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
    });

    it('should set nearExpiry to true if any batch expires within 30 days', async () => {
      const today = new Date();
      const within30Days = new Date(today);
      within30Days.setDate(today.getDate() + 20); // 20 days from now

      const beyond30Days = new Date(today);
      beyond30Days.setDate(today.getDate() + 45); // 45 days from now

      const mockProducts = [
        {
          id: 'product-1',
          name: 'Product A',
          barcode: '123456',
          unit: 'box',
          minStock: 100,
          stockBatches: [
            { quantity: 50, expireDate: within30Days }, // Near expiry
            { quantity: 30, expireDate: beyond30Days },
          ],
        },
        {
          id: 'product-2',
          name: 'Product B',
          barcode: '789012',
          unit: 'unit',
          minStock: 50,
          stockBatches: [
            { quantity: 60, expireDate: beyond30Days }, // Not near expiry
          ],
        },
      ];

      (prisma.product.findMany as jest.Mock).mockResolvedValue(mockProducts);

      const result = await productListService();

      expect(result[0].nearExpiry).toBe(true);
      expect(result[1].nearExpiry).toBe(false);
    });

    it('should set nearExpiry to false if no batches expire within 30 days', async () => {
      const today = new Date();
      const beyond30Days = new Date(today);
      beyond30Days.setDate(today.getDate() + 45);

      const mockProducts = [
        {
          id: 'product-1',
          name: 'Product A',
          barcode: '123456',
          unit: 'box',
          minStock: 100,
          stockBatches: [
            { quantity: 50, expireDate: beyond30Days },
          ],
        },
      ];

      (prisma.product.findMany as jest.Mock).mockResolvedValue(mockProducts);

      const result = await productListService();

      expect(result[0].nearExpiry).toBe(false);
    });

    it('should handle products with no batches', async () => {
      const mockProducts = [
        {
          id: 'product-1',
          name: 'Product A',
          barcode: '123456',
          unit: 'box',
          minStock: 100,
          stockBatches: [],
        },
      ];

      (prisma.product.findMany as jest.Mock).mockResolvedValue(mockProducts);

      const result = await productListService();

      expect(result[0].totalQuantity).toBe(0);
      expect(result[0].nearExpiry).toBe(false);
    });

    it('should order products by name ascending', async () => {
      const mockProducts = [
        {
          id: 'product-3',
          name: 'Zebra Product',
          barcode: '333',
          unit: 'box',
          minStock: 10,
          stockBatches: [],
        },
        {
          id: 'product-1',
          name: 'Apple Product',
          barcode: '111',
          unit: 'box',
          minStock: 10,
          stockBatches: [],
        },
        {
          id: 'product-2',
          name: 'Banana Product',
          barcode: '222',
          unit: 'box',
          minStock: 10,
          stockBatches: [],
        },
      ];

      (prisma.product.findMany as jest.Mock).mockResolvedValue(mockProducts);

      const result = await productListService();

      expect(result[0].name).toBe('Apple Product');
      expect(result[1].name).toBe('Banana Product');
      expect(result[2].name).toBe('Zebra Product');
    });

    it('should return empty array when no products exist', async () => {
      (prisma.product.findMany as jest.Mock).mockResolvedValue([]);

      const result = await productListService();

      expect(result).toHaveLength(0);
    });
  });
});

