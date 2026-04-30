import { disposeService } from '../disposeService';
import { prisma } from '../../prisma';
import { DisposeItem } from '../../types/stock.types';

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

describe('disposeService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => callback(prisma));
  });

  it('should dispose stock from a single batch and log the reason', async () => {
    const mockProduct = {
      id: 'product-1',
      name: 'Composite Resin',
      barcode: 'RESIN001',
      unit: 'bottle',
      minStock: 2,
      isReusable: true,
      inUseQuantity: 0,
      createdAt: new Date(),
    };
    const mockBatch = {
      id: 'batch-1',
      productId: 'product-1',
      lotNumber: 'LOT001',
      expireDate: new Date('2025-01-31'),
      receivedAt: new Date('2025-01-01T00:00:00.000Z'),
      quantity: 10,
      createdAt: new Date(),
    };

    (prisma.product.findUnique as jest.Mock).mockResolvedValue(mockProduct);
    (prisma.stockBatch.findMany as jest.Mock).mockResolvedValue([mockBatch]);
    (prisma.stockBatch.update as jest.Mock).mockResolvedValue({ ...mockBatch, quantity: 6 });
    (prisma.stockMovement.create as jest.Mock).mockResolvedValue({ id: 'movement-1' });

    const items: DisposeItem[] = [{ barcode: 'RESIN001', quantity: 4, reason: 'EXPIRED' }];
    const result = await disposeService(items);

    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toEqual({
      barcode: 'RESIN001',
      productId: 'product-1',
      requestedQuantity: 4,
      disposedQuantity: 4,
      reason: 'EXPIRED',
      batches: [{ batchId: 'batch-1', lotNumber: 'LOT001', quantity: 4 }],
      success: true,
    });
    expect(prisma.stockBatch.update).toHaveBeenCalledWith({
      where: { id: 'batch-1' },
      data: { quantity: { decrement: 4 } },
    });
    expect(prisma.stockMovement.create).toHaveBeenCalledWith({
      data: {
        productId: 'product-1',
        batchId: 'batch-1',
        lotNumber: 'LOT001',
        type: 'DISPOSE',
        quantity: 4,
        reason: 'EXPIRED',
        sessionId: expect.any(String),
      },
    });
  });

  it('should dispose across multiple batches in FIFO order', async () => {
    const mockProduct = {
      id: 'product-1',
      name: 'Bonding Agent',
      barcode: 'BOND001',
      unit: 'bottle',
      minStock: 3,
      isReusable: false,
      inUseQuantity: 0,
      createdAt: new Date(),
    };
    const mockBatches = [
      {
        id: 'batch-1',
        productId: 'product-1',
        lotNumber: 'LOT001',
        expireDate: new Date('2025-01-31'),
        receivedAt: new Date('2025-01-01T00:00:00.000Z'),
        quantity: 3,
        createdAt: new Date(),
      },
      {
        id: 'batch-2',
        productId: 'product-1',
        lotNumber: 'LOT002',
        expireDate: new Date('2025-06-30'),
        receivedAt: new Date('2025-02-01T00:00:00.000Z'),
        quantity: 5,
        createdAt: new Date(),
      },
    ];

    (prisma.product.findUnique as jest.Mock).mockResolvedValue(mockProduct);
    (prisma.stockBatch.findMany as jest.Mock).mockResolvedValue(mockBatches);
    (prisma.stockBatch.update as jest.Mock).mockResolvedValue({});
    (prisma.stockMovement.create as jest.Mock).mockResolvedValue({});

    const items: DisposeItem[] = [{ barcode: 'BOND001', quantity: 6, reason: 'DAMAGED' }];
    const result = await disposeService(items);

    expect(result.results[0].success).toBe(true);
    expect(result.results[0].batches).toEqual([
      { batchId: 'batch-1', lotNumber: 'LOT001', quantity: 3 },
      { batchId: 'batch-2', lotNumber: 'LOT002', quantity: 3 },
    ]);
    expect(prisma.stockBatch.findMany).toHaveBeenCalledWith({
      where: {
        productId: 'product-1',
        quantity: { gt: 0 },
      },
      orderBy: [{ receivedAt: 'asc' }, { createdAt: 'asc' }],
    });
    expect(prisma.stockBatch.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'batch-1' },
      data: { quantity: { decrement: 3 } },
    });
    expect(prisma.stockBatch.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'batch-2' },
      data: { quantity: { decrement: 3 } },
    });
    expect(prisma.stockMovement.create).toHaveBeenCalledTimes(2);
  });

  it('should trim the disposal reason before logging', async () => {
    const mockProduct = {
      id: 'product-1',
      name: 'Gloves',
      barcode: 'GLOVE001',
      unit: 'box',
      minStock: 5,
      isReusable: false,
      inUseQuantity: 0,
      createdAt: new Date(),
    };
    const mockBatch = {
      id: 'batch-1',
      productId: 'product-1',
      lotNumber: 'LOT001',
      expireDate: null,
      receivedAt: new Date('2025-01-01T00:00:00.000Z'),
      quantity: 10,
      createdAt: new Date(),
    };

    (prisma.product.findUnique as jest.Mock).mockResolvedValue(mockProduct);
    (prisma.stockBatch.findMany as jest.Mock).mockResolvedValue([mockBatch]);
    (prisma.stockBatch.update as jest.Mock).mockResolvedValue({});
    (prisma.stockMovement.create as jest.Mock).mockResolvedValue({});

    const result = await disposeService([
      { barcode: 'GLOVE001', quantity: 1, reason: '  DAMAGED PACKAGING  ' },
    ]);

    expect(result.results[0].reason).toBe('DAMAGED PACKAGING');
    expect(prisma.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reason: 'DAMAGED PACKAGING' }),
      })
    );
  });

  it('should return an item failure when product is not found', async () => {
    (prisma.product.findUnique as jest.Mock).mockResolvedValue(null);

    const result = await disposeService([
      { barcode: 'UNKNOWN', quantity: 1, reason: 'EXPIRED' },
    ]);

    expect(result.results[0].success).toBe(false);
    expect(result.results[0].error).toContain('Product not found');
    expect(prisma.stockBatch.findMany).not.toHaveBeenCalled();
    expect(prisma.stockBatch.update).not.toHaveBeenCalled();
    expect(prisma.stockMovement.create).not.toHaveBeenCalled();
  });

  it('should throw and avoid updates when available stock is insufficient', async () => {
    const mockProduct = {
      id: 'product-1',
      name: 'Needle',
      barcode: 'NEEDLE001',
      unit: 'pack',
      minStock: 5,
      isReusable: false,
      inUseQuantity: 0,
      createdAt: new Date(),
    };
    const mockBatch = {
      id: 'batch-1',
      productId: 'product-1',
      lotNumber: 'LOT001',
      expireDate: new Date('2025-01-31'),
      receivedAt: new Date('2025-01-01T00:00:00.000Z'),
      quantity: 2,
      createdAt: new Date(),
    };

    (prisma.product.findUnique as jest.Mock).mockResolvedValue(mockProduct);
    (prisma.stockBatch.findMany as jest.Mock).mockResolvedValue([mockBatch]);

    await expect(
      disposeService([{ barcode: 'NEEDLE001', quantity: 5, reason: 'EXPIRED' }])
    ).rejects.toThrow('Insufficient stock');

    expect(prisma.stockBatch.update).not.toHaveBeenCalled();
    expect(prisma.stockMovement.create).not.toHaveBeenCalled();
  });
});
