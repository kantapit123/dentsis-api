import { withdrawService } from '../withdrawService';
import { prisma } from '../../prisma';
import { WithdrawItem } from '../../types/stock.types';

jest.mock('../../prisma', () => ({
  prisma: {
    $transaction: jest.fn(),
    product: {
      findUnique: jest.fn(),
      update: jest.fn(),
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

const mockReusableProduct = {
  id: 'product-1',
  name: 'Composite Resin',
  barcode: 'RESIN001',
  unit: 'bottle',
  minStock: 2,
  isReusable: true,
  inUseQuantity: 0,
  createdAt: new Date(),
};

const mockBatches = [
  {
    id: 'batch-1',
    productId: 'product-1',
    lotNumber: 'LOT001',
    expireDate: new Date('2026-06-30'),
    receivedAt: new Date('2025-01-01T00:00:00.000Z'),
    quantity: 5,
    createdAt: new Date(),
  },
  {
    id: 'batch-2',
    productId: 'product-1',
    lotNumber: 'LOT002',
    expireDate: new Date('2025-01-31'), // earlier expiry, but received later
    receivedAt: new Date('2025-02-01T00:00:00.000Z'),
    quantity: 3,
    createdAt: new Date(),
  },
];

describe('withdrawService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.$transaction as jest.Mock).mockImplementation(async (cb) => cb(prisma));
  });

  describe('successful withdrawal', () => {
    it('should deduct warehouse and increment inUseQuantity for reusable item', async () => {
      const updatedProduct = { ...mockReusableProduct, inUseQuantity: 2 };

      (prisma.product.findUnique as jest.Mock).mockResolvedValue(mockReusableProduct);
      (prisma.stockBatch.findMany as jest.Mock).mockResolvedValue(mockBatches);
      (prisma.stockBatch.update as jest.Mock).mockResolvedValue({});
      (prisma.stockMovement.create as jest.Mock).mockResolvedValue({});
      (prisma.product.update as jest.Mock).mockResolvedValue(updatedProduct);

      const items: WithdrawItem[] = [{ barcode: 'RESIN001', quantity: 2 }];
      const result = await withdrawService(items);

      expect(result.results[0].success).toBe(true);
      expect(result.results[0].inUseAfter).toBe(2);
      expect(result.results[0].deductedQuantity).toBe(2);

      // Should create WITHDRAW movement
      expect(prisma.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: 'WITHDRAW' }) })
      );

      // Should increment inUseQuantity
      expect(prisma.product.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { inUseQuantity: { increment: 2 } } })
      );
    });

    it('should apply strict FIFO: deduct from earliest received batch first', async () => {
      const updatedProduct = { ...mockReusableProduct, inUseQuantity: 6 };

      (prisma.product.findUnique as jest.Mock).mockResolvedValue(mockReusableProduct);
      (prisma.stockBatch.findMany as jest.Mock).mockResolvedValue(mockBatches);
      (prisma.stockBatch.update as jest.Mock).mockResolvedValue({});
      (prisma.stockMovement.create as jest.Mock).mockResolvedValue({});
      (prisma.product.update as jest.Mock).mockResolvedValue(updatedProduct);

      const items: WithdrawItem[] = [{ barcode: 'RESIN001', quantity: 6 }];
      const result = await withdrawService(items);

      expect(result.results[0].success).toBe(true);
      expect(result.results[0].batches).toHaveLength(2);
      // batch-1 (earliest received) should be deducted first
      expect(result.results[0].batches[0].batchId).toBe('batch-1');
      expect(result.results[0].batches[0].quantity).toBe(5);
      expect(result.results[0].batches[1].batchId).toBe('batch-2');
      expect(result.results[0].batches[1].quantity).toBe(1);
      expect(prisma.stockBatch.findMany).toHaveBeenCalledWith({
        where: {
          productId: 'product-1',
          quantity: { gt: 0 },
          OR: [{ expireDate: null }, { expireDate: { gte: expect.any(Date) } }],
        },
        orderBy: [{ receivedAt: 'asc' }, { createdAt: 'asc' }],
      });
    });
  });

  describe('error cases', () => {
    it('should reject if product not found', async () => {
      (prisma.product.findUnique as jest.Mock).mockResolvedValue(null);

      const items: WithdrawItem[] = [{ barcode: 'UNKNOWN', quantity: 1 }];
      const result = await withdrawService(items);

      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toMatch(/not found/i);
    });

    it('should reject if product is not reusable', async () => {
      (prisma.product.findUnique as jest.Mock).mockResolvedValue({
        ...mockReusableProduct,
        isReusable: false,
      });

      const items: WithdrawItem[] = [{ barcode: 'RESIN001', quantity: 1 }];
      const result = await withdrawService(items);

      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toMatch(/not reusable/i);
    });

    it('should throw and rollback transaction on insufficient stock', async () => {
      (prisma.product.findUnique as jest.Mock).mockResolvedValue(mockReusableProduct);
      (prisma.stockBatch.findMany as jest.Mock).mockResolvedValue([
        { ...mockBatches[0], quantity: 2 },
      ]);

      const items: WithdrawItem[] = [{ barcode: 'RESIN001', quantity: 10 }];

      await expect(withdrawService(items)).rejects.toThrow('Insufficient stock');
    });
  });
});
