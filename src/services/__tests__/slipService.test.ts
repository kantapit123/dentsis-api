import { Prisma } from '@prisma/client';
import { createSlip, formatSlipRecord, formatTransferredAt, parseTransferredAt } from '../slipService';
import { prisma } from '../../prisma';

// Mock the Prisma singleton (Chicago-school: only the DB boundary is faked).
jest.mock('../../prisma', () => ({
  prisma: {
    slip: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  },
}));

const baseRow = {
  id: 'slip-1',
  amount: new Prisma.Decimal('1500.00'),
  transferredAt: new Date('2025-06-15T13:30:00.000Z'), // 20:30 Bangkok wall-clock
  transRef: 'REF20250615123456',
  sendingBank: '014',
  confidence: 'ok' as const,
  lineMessageId: '540b8cf799924ef7b60f206f4c9f2299',
  createdAt: new Date('2025-06-15T13:30:05.000Z'),
};

describe('slipService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('formatSlipRecord', () => {
    it('maps a camelCase row to the snake_case wire record', () => {
      expect(formatSlipRecord(baseRow)).toEqual({
        id: 'slip-1',
        amount: 1500,
        transferred_at: '2025-06-15T20:30:00',
        trans_ref: 'REF20250615123456',
        sending_bank: '014',
        confidence: 'ok',
        line_message_id: '540b8cf799924ef7b60f206f4c9f2299',
        created_at: '2025-06-15T13:30:05.000Z',
      });
    });

    it('preserves nulls for a partial slip', () => {
      const r = formatSlipRecord({
        ...baseRow,
        amount: null,
        transferredAt: null,
        transRef: null,
        sendingBank: null,
        lineMessageId: null,
        confidence: 'partial',
      });
      expect(r.amount).toBeNull();
      expect(r.transferred_at).toBeNull();
      expect(r.trans_ref).toBeNull();
      expect(r.sending_bank).toBeNull();
      expect(r.line_message_id).toBeNull();
    });
  });

  describe('transferred_at timezone round-trip', () => {
    it('parses naive input as Asia/Bangkok then formats back to the same wall-clock', () => {
      const d = parseTransferredAt('2025-06-15T20:30:00');
      expect(d.toISOString()).toBe('2025-06-15T13:30:00.000Z');
      expect(formatTransferredAt(d)).toBe('2025-06-15T20:30:00');
    });

    it('respects an explicit timezone when present', () => {
      expect(parseTransferredAt('2025-06-15T13:30:00Z').toISOString()).toBe('2025-06-15T13:30:00.000Z');
    });
  });

  describe('createSlip', () => {
    it('creates a new slip and returns created: true', async () => {
      (prisma.slip.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.slip.create as jest.Mock).mockResolvedValue(baseRow);

      const res = await createSlip({
        amount: 1500,
        transferred_at: '2025-06-15T20:30:00',
        trans_ref: 'REF20250615123456',
        sending_bank: '014',
        confidence: 'ok',
        line_message_id: '540b8cf799924ef7b60f206f4c9f2299',
      });

      expect(res.created).toBe(true);
      expect(res.record.trans_ref).toBe('REF20250615123456');
      expect(prisma.slip.create).toHaveBeenCalledTimes(1);
    });

    it('returns the existing record (created: false) on a duplicate trans_ref, without creating', async () => {
      (prisma.slip.findUnique as jest.Mock).mockResolvedValue(baseRow);

      const res = await createSlip({ trans_ref: 'REF20250615123456', confidence: 'ok' });

      expect(res.created).toBe(false);
      expect(res.record.id).toBe('slip-1');
      expect(prisma.slip.create).not.toHaveBeenCalled();
    });

    it('dedups on line_message_id when trans_ref is null', async () => {
      (prisma.slip.findFirst as jest.Mock).mockResolvedValue(baseRow);

      const res = await createSlip({
        trans_ref: null,
        confidence: 'partial',
        line_message_id: '540b8cf799924ef7b60f206f4c9f2299',
      });

      expect(res.created).toBe(false);
      expect(prisma.slip.findFirst).toHaveBeenCalledWith({
        where: { transRef: null, lineMessageId: '540b8cf799924ef7b60f206f4c9f2299' },
      });
      expect(prisma.slip.create).not.toHaveBeenCalled();
    });

    it('creates when both trans_ref and line_message_id are null (no dedup possible)', async () => {
      (prisma.slip.create as jest.Mock).mockResolvedValue({ ...baseRow, transRef: null, lineMessageId: null });

      const res = await createSlip({ confidence: 'partial' });

      expect(res.created).toBe(true);
      expect(prisma.slip.findUnique).not.toHaveBeenCalled();
      expect(prisma.slip.findFirst).not.toHaveBeenCalled();
      expect(prisma.slip.create).toHaveBeenCalledTimes(1);
    });

    it('treats a concurrent P2002 unique violation as a dedup hit', async () => {
      (prisma.slip.findUnique as jest.Mock).mockResolvedValueOnce(null).mockResolvedValueOnce(baseRow);
      const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      });
      (prisma.slip.create as jest.Mock).mockRejectedValue(p2002);

      const res = await createSlip({ trans_ref: 'REF20250615123456', confidence: 'ok' });

      expect(res.created).toBe(false);
      expect(res.record.id).toBe('slip-1');
      expect(prisma.slip.findUnique).toHaveBeenCalledTimes(2);
    });
  });
});
