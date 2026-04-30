import { findProductById, getProductList } from '../productService';
import { prisma } from '../../prisma';

jest.mock('../../prisma', () => ({
  prisma: {
    product: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

describe('findProductById', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns backward-compatible fields and additive batch details', async () => {
    const today = new Date();
    const nearExpiryDate = new Date(today);
    nearExpiryDate.setDate(today.getDate() + 7);
    const expiredDate = new Date(today);
    expiredDate.setDate(today.getDate() - 1);

    (prisma.product.findUnique as jest.Mock).mockResolvedValue({
      id: 'product-1',
      name: 'Bonding Agent',
      barcode: 'SKU-001',
      unit: 'bottle',
      minStock: 2,
      isReusable: false,
      inUseQuantity: 0,
      stockBatches: [
        {
          id: 'batch-1',
          lotNumber: 'LOT-1',
          quantity: 10,
          expireDate: nearExpiryDate,
          receivedAt: new Date('2025-01-01T00:00:00.000Z'),
        },
        {
          id: 'batch-2',
          lotNumber: 'LOT-2',
          quantity: 0,
          expireDate: null,
          receivedAt: new Date('2025-01-02T00:00:00.000Z'),
        },
        {
          id: 'batch-3',
          lotNumber: 'LOT-3',
          quantity: 5,
          expireDate: expiredDate,
          receivedAt: new Date('2025-01-03T00:00:00.000Z'),
        },
      ],
    });

    const result = await findProductById('SKU-001');

    expect(result.id).toBe('product-1');
    expect(result.barcode).toBe('SKU-001');
    expect(result.totalQuantity).toBe(15);
    expect(result.batchSummary).toEqual({
      totalBatches: 3,
      activeBatches: 1,
      expiredBatches: 1,
      depletedBatches: 1,
    });
    expect(result.batches).toEqual([
      expect.objectContaining({
        batchId: 'batch-1',
        status: 'NEAR_EXPIRY',
      }),
      expect.objectContaining({
        batchId: 'batch-2',
        status: 'DEPLETED',
      }),
      expect.objectContaining({
        batchId: 'batch-3',
        status: 'EXPIRED',
      }),
    ]);
  });

  it('throws when product is missing', async () => {
    (prisma.product.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(findProductById('UNKNOWN')).rejects.toThrow(
      'Product not found please add the product first'
    );
  });
});

describe('getProductList nearExpiry filtering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('includes product when any active lot is near expiry', async () => {
    const now = new Date();
    const nearExpiryDate = new Date(now);
    nearExpiryDate.setDate(now.getDate() + 5);
    const farFutureDate = new Date(now);
    farFutureDate.setDate(now.getDate() + 220);

    (prisma.product.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'product-near',
        name: 'Near Expiry Product',
        barcode: 'NEAR-001',
        unit: 'box',
        minStock: 1,
        isReusable: false,
        inUseQuantity: 0,
        stockBatches: [
          // Many lots, at least one near expiry with active quantity
          { quantity: 10, expireDate: farFutureDate },
          { quantity: 5, expireDate: nearExpiryDate },
          { quantity: 0, expireDate: nearExpiryDate },
        ],
      },
      {
        id: 'product-far',
        name: 'Far Product',
        barcode: 'FAR-001',
        unit: 'box',
        minStock: 1,
        isReusable: false,
        inUseQuantity: 0,
        stockBatches: [{ quantity: 20, expireDate: farFutureDate }],
      },
    ]);

    const result = await getProductList({ page: 1, limit: 10, status: 'nearExpiry' });
    expect(result.pagination.total).toBe(1);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].barcode).toBe('NEAR-001');
    expect(result.data[0].nearExpiry).toBe(true);
  });
});
