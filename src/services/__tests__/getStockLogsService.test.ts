import { getStockLogsService } from '../getStockLogsService';
import { prisma } from '../../prisma';

jest.mock('../../prisma', () => ({
  prisma: {
    stockMovement: {
      findMany: jest.fn(),
    },
  },
}));

describe('getStockLogsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should filter DISPOSE movements and expose grouped disposal reasons', async () => {
    const mockMovements = [
      {
        id: 'movement-1',
        productId: 'product-1',
        batchId: 'batch-1',
        lotNumber: 'LOT001',
        type: 'DISPOSE',
        quantity: 2,
        reason: 'EXPIRED',
        sessionId: 'session-1',
        createdAt: new Date('2025-01-15T10:00:00Z'),
        product: {
          name: 'Product A',
        },
      },
      {
        id: 'movement-2',
        productId: 'product-1',
        batchId: 'batch-2',
        lotNumber: 'LOT002',
        type: 'DISPOSE',
        quantity: 3,
        reason: 'EXPIRED',
        sessionId: 'session-1',
        createdAt: new Date('2025-01-15T10:01:00Z'),
        product: {
          name: 'Product A',
        },
      },
    ];

    (prisma.stockMovement.findMany as jest.Mock).mockResolvedValue(mockMovements);

    const result = await getStockLogsService({ type: 'DISPOSE' });

    expect(prisma.stockMovement.findMany).toHaveBeenCalledWith({
      where: { type: 'DISPOSE' },
      include: {
        product: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    expect(result).toEqual([
      {
        sessionId: 'session-1',
        type: 'DISPOSE',
        createdAt: '2025-01-15T10:00:00.000Z',
        productName: 'Product A',
        totalQuantity: 5,
        reason: 'EXPIRED',
        lots: [
          { lot: 'LOT001', quantity: 2 },
          { lot: 'LOT002', quantity: 3 },
        ],
      },
    ]);
  });

  it('should split DISPOSE logs by reason within the same session and product', async () => {
    const mockMovements = [
      {
        id: 'movement-1',
        productId: 'product-1',
        batchId: 'batch-1',
        lotNumber: 'LOT001',
        type: 'DISPOSE',
        quantity: 2,
        reason: 'EXPIRED',
        sessionId: 'session-1',
        createdAt: new Date('2025-01-15T10:00:00Z'),
        product: {
          name: 'Product A',
        },
      },
      {
        id: 'movement-2',
        productId: 'product-1',
        batchId: 'batch-2',
        lotNumber: 'LOT002',
        type: 'DISPOSE',
        quantity: 1,
        reason: 'DAMAGED',
        sessionId: 'session-1',
        createdAt: new Date('2025-01-15T10:01:00Z'),
        product: {
          name: 'Product A',
        },
      },
    ];

    (prisma.stockMovement.findMany as jest.Mock).mockResolvedValue(mockMovements);

    const result = await getStockLogsService({ type: 'DISPOSE' });

    expect(result).toHaveLength(2);
    expect(result.map((log) => log.reason).sort()).toEqual(['DAMAGED', 'EXPIRED']);
  });
});
