import { depleteService } from '../depleteService';
import { prisma } from '../../prisma';
import { DepleteItem } from '../../types/stock.types';

jest.mock('../../prisma', () => ({
  prisma: {
    $transaction: jest.fn(),
    product: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    stockMovement: {
      create: jest.fn(),
    },
  },
}));

const makeProduct = (warehouseQty: number, inUseQty: number, isReusable = true) => ({
  id: 'product-1',
  name: 'Composite Resin',
  barcode: 'RESIN001',
  unit: 'bottle',
  minStock: 2,
  isReusable,
  inUseQuantity: inUseQty,
  createdAt: new Date(),
  stockBatches: [{ quantity: warehouseQty }],
});

describe('depleteService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.$transaction as jest.Mock).mockImplementation(async (cb) => cb(prisma));
  });

  describe('successful depletion', () => {
    it('should decrement inUseQuantity and log DEPLETE movement', async () => {
      const product = makeProduct(3, 2);
      const updatedProduct = { ...product, inUseQuantity: 1 };

      (prisma.product.findUnique as jest.Mock).mockResolvedValue(product);
      (prisma.product.update as jest.Mock).mockResolvedValue(updatedProduct);
      (prisma.stockMovement.create as jest.Mock).mockResolvedValue({});

      const items: DepleteItem[] = [{ barcode: 'RESIN001', quantity: 1 }];
      const result = await depleteService(items);

      expect(result.results[0].success).toBe(true);
      expect(result.results[0].inUseAfter).toBe(1);
      expect(result.results[0].isOutOfStock).toBe(false);

      expect(prisma.product.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { inUseQuantity: { decrement: 1 } } })
      );
      expect(prisma.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: 'DEPLETE' }) })
      );
    });

    it('should set isOutOfStock=true when both warehouse and inUse reach 0', async () => {
      const product = makeProduct(0, 1); // warehouse empty, 1 in use
      const updatedProduct = { ...product, inUseQuantity: 0 };

      (prisma.product.findUnique as jest.Mock).mockResolvedValue(product);
      (prisma.product.update as jest.Mock).mockResolvedValue(updatedProduct);
      (prisma.stockMovement.create as jest.Mock).mockResolvedValue({});

      const items: DepleteItem[] = [{ barcode: 'RESIN001', quantity: 1 }];
      const result = await depleteService(items);

      expect(result.results[0].success).toBe(true);
      expect(result.results[0].inUseAfter).toBe(0);
      expect(result.results[0].isOutOfStock).toBe(true);
    });

    it('should NOT set isOutOfStock when warehouse still has stock', async () => {
      const product = makeProduct(5, 1);
      const updatedProduct = { ...product, inUseQuantity: 0 };

      (prisma.product.findUnique as jest.Mock).mockResolvedValue(product);
      (prisma.product.update as jest.Mock).mockResolvedValue(updatedProduct);
      (prisma.stockMovement.create as jest.Mock).mockResolvedValue({});

      const items: DepleteItem[] = [{ barcode: 'RESIN001', quantity: 1 }];
      const result = await depleteService(items);

      expect(result.results[0].isOutOfStock).toBe(false);
    });
  });

  describe('error cases', () => {
    it('should reject if product not found', async () => {
      (prisma.product.findUnique as jest.Mock).mockResolvedValue(null);

      const items: DepleteItem[] = [{ barcode: 'UNKNOWN', quantity: 1 }];
      const result = await depleteService(items);

      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toMatch(/not found/i);
    });

    it('should reject if product is not reusable', async () => {
      (prisma.product.findUnique as jest.Mock).mockResolvedValue(makeProduct(5, 0, false));

      const items: DepleteItem[] = [{ barcode: 'RESIN001', quantity: 1 }];
      const result = await depleteService(items);

      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toMatch(/not reusable/i);
    });

    it('should reject if inUseQuantity is less than requested quantity', async () => {
      (prisma.product.findUnique as jest.Mock).mockResolvedValue(makeProduct(5, 1));

      const items: DepleteItem[] = [{ barcode: 'RESIN001', quantity: 3 }];
      const result = await depleteService(items);

      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toMatch(/cannot deplete/i);
    });
  });
});
