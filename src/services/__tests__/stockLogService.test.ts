import { stockLogService } from '../stockLogService';
import { prisma } from '../../prisma';

// Mock Prisma client
jest.mock('../../prisma', () => ({
  prisma: {
    stockMovement: {
      findMany: jest.fn(),
    },
  },
}));

describe('stockLogService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('when movements exist', () => {
    it('should group movements by sessionId and transform data correctly', async () => {
      const mockMovements = [
        {
          id: 'movement-1',
          productId: 'product-1',
          batchId: 'batch-1',
          lotNumber: 'LOT001',
          type: 'IN',
          quantity: 50,
          sessionId: 'session-1',
          createdAt: new Date('2025-01-15T10:00:00Z'),
          product: {
            id: 'product-1',
            name: 'Product A',
          },
        },
        {
          id: 'movement-2',
          productId: 'product-1',
          batchId: 'batch-2',
          lotNumber: 'LOT002',
          type: 'IN',
          quantity: 30,
          sessionId: 'session-1',
          createdAt: new Date('2025-01-15T10:00:00Z'),
          product: {
            id: 'product-1',
            name: 'Product A',
          },
        },
        {
          id: 'movement-3',
          productId: 'product-2',
          batchId: 'batch-3',
          lotNumber: 'LOT003',
          type: 'OUT',
          quantity: 20,
          sessionId: 'session-2',
          createdAt: new Date('2025-01-16T14:30:00Z'),
          product: {
            id: 'product-2',
            name: 'Product B',
          },
        },
      ];

      (prisma.stockMovement.findMany as jest.Mock).mockResolvedValue(mockMovements);

      const result = await stockLogService();

      expect(result.logs).toHaveLength(2);
      expect(result.total).toBe(2);

      // Check first session (IN operation with multiple lots)
      const session1 = result.logs.find((log) => log.sessionId === 'session-1');
      expect(session1).toBeDefined();
      expect(session1?.productName).toBe('Product A');
      expect(session1?.productId).toBe('product-1');
      expect(session1?.type).toBe('IN');
      expect(session1?.totalQuantity).toBe(80); // 50 + 30
      expect(session1?.lots).toHaveLength(2);
      expect(session1?.lots[0].lotNumber).toBe('LOT001');
      expect(session1?.lots[0].quantity).toBe(50);
      expect(session1?.lots[1].lotNumber).toBe('LOT002');
      expect(session1?.lots[1].quantity).toBe(30);
      expect(session1?.timestamp).toEqual(new Date('2025-01-15T10:00:00Z'));

      // Check second session (OUT operation)
      const session2 = result.logs.find((log) => log.sessionId === 'session-2');
      expect(session2).toBeDefined();
      expect(session2?.productName).toBe('Product B');
      expect(session2?.productId).toBe('product-2');
      expect(session2?.type).toBe('OUT');
      expect(session2?.totalQuantity).toBe(20);
      expect(session2?.lots).toHaveLength(1);
      expect(session2?.lots[0].lotNumber).toBe('LOT003');
      expect(session2?.lots[0].quantity).toBe(20);

      // Verify Prisma query
      expect(prisma.stockMovement.findMany).toHaveBeenCalledWith({
        include: {
          product: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
    });

    it('should handle movements with same sessionId but different products', async () => {
      const mockMovements = [
        {
          id: 'movement-1',
          productId: 'product-1',
          batchId: 'batch-1',
          lotNumber: 'LOT001',
          type: 'IN',
          quantity: 50,
          sessionId: 'session-1',
          createdAt: new Date('2025-01-15T10:00:00Z'),
          product: {
            id: 'product-1',
            name: 'Product A',
          },
        },
        {
          id: 'movement-2',
          productId: 'product-2',
          batchId: 'batch-2',
          lotNumber: 'LOT002',
          type: 'IN',
          quantity: 30,
          sessionId: 'session-1',
          createdAt: new Date('2025-01-15T10:00:00Z'),
          product: {
            id: 'product-2',
            name: 'Product B',
          },
        },
      ];

      (prisma.stockMovement.findMany as jest.Mock).mockResolvedValue(mockMovements);

      const result = await stockLogService();

      // Should create separate entries for each product even with same sessionId
      expect(result.logs).toHaveLength(2);
      expect(result.logs[0].productName).toBe('Product A');
      expect(result.logs[1].productName).toBe('Product B');
    });

    it('should handle movements with same sessionId, same product, different types', async () => {
      const mockMovements = [
        {
          id: 'movement-1',
          productId: 'product-1',
          batchId: 'batch-1',
          lotNumber: 'LOT001',
          type: 'IN',
          quantity: 50,
          sessionId: 'session-1',
          createdAt: new Date('2025-01-15T10:00:00Z'),
          product: {
            id: 'product-1',
            name: 'Product A',
          },
        },
        {
          id: 'movement-2',
          productId: 'product-1',
          batchId: 'batch-2',
          lotNumber: 'LOT002',
          type: 'OUT',
          quantity: 20,
          sessionId: 'session-1',
          createdAt: new Date('2025-01-15T10:00:00Z'),
          product: {
            id: 'product-1',
            name: 'Product A',
          },
        },
      ];

      (prisma.stockMovement.findMany as jest.Mock).mockResolvedValue(mockMovements);

      const result = await stockLogService();

      // Should create separate entries for each type even with same sessionId and product
      expect(result.logs).toHaveLength(2);
      expect(result.logs[0].type).toBe('IN');
      expect(result.logs[1].type).toBe('OUT');
    });
  });

  describe('when no movements exist', () => {
    it('should return empty logs array', async () => {
      (prisma.stockMovement.findMany as jest.Mock).mockResolvedValue([]);

      const result = await stockLogService();

      expect(result.logs).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe('when movements have null sessionId', () => {
    it('should handle movements without sessionId by treating each as separate session', async () => {
      const mockMovements = [
        {
          id: 'movement-1',
          productId: 'product-1',
          batchId: 'batch-1',
          lotNumber: 'LOT001',
          type: 'IN',
          quantity: 50,
          sessionId: null,
          createdAt: new Date('2025-01-15T10:00:00Z'),
          product: {
            id: 'product-1',
            name: 'Product A',
          },
        },
        {
          id: 'movement-2',
          productId: 'product-1',
          batchId: 'batch-2',
          lotNumber: 'LOT002',
          type: 'IN',
          quantity: 30,
          sessionId: null,
          createdAt: new Date('2025-01-15T10:00:00Z'),
          product: {
            id: 'product-1',
            name: 'Product A',
          },
        },
      ];

      (prisma.stockMovement.findMany as jest.Mock).mockResolvedValue(mockMovements);

      const result = await stockLogService();

      // Each movement without sessionId should be treated as separate entry
      expect(result.logs.length).toBeGreaterThan(0);
    });
  });
});

