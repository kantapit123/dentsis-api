import { Prisma } from '@prisma/client';
import { getPeriodSummary, getMonthlySummary } from '../financeSummaryService';
import { prisma } from '../../prisma';

jest.mock('../../prisma', () => ({
  prisma: {
    dailyRecord: { findMany: jest.fn() },
    doctorWorkDay: { findMany: jest.fn() },
    incomeGuarantee: { findMany: jest.fn() },
  },
}));

const D = (n: number): Prisma.Decimal => new Prisma.Decimal(n);

interface RecOpts {
  date: string;
  doctorId?: string;
  name?: string;
  total: number;
  df: number;
  pay?: 'CASH' | 'TRANSFER';
}

// Minimal DailyRecord shape consumed by the summary aggregations.
function rec(o: RecOpts) {
  return {
    recordDate: new Date(`${o.date}T00:00:00.000Z`),
    doctorId: o.doctorId ?? 'doc-1',
    doctor: { name: o.name ?? 'Dr A' },
    totalAmount: D(o.total),
    dfAmount: D(o.df),
    paymentMethod: o.pay ?? 'CASH',
  };
}

const drFind = prisma.dailyRecord.findMany as jest.Mock;
const wdFind = prisma.doctorWorkDay.findMany as jest.Mock;
const igFind = prisma.incomeGuarantee.findMany as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  wdFind.mockResolvedValue([]);
  igFind.mockResolvedValue([]);
});

describe('getPeriodSummary', () => {
  it('sums revenue/DF across the days in the range and emits byDate', async () => {
    drFind.mockResolvedValue([
      rec({ date: '2026-06-01', total: 1000, df: 300, pay: 'CASH' }),
      rec({ date: '2026-06-01', total: 500, df: 100, pay: 'TRANSFER' }),
      rec({ date: '2026-06-02', total: 800, df: 200, pay: 'CASH' }),
    ]);

    const s = await getPeriodSummary('2026-06-01', '2026-06-02', null);

    expect(s.from).toBe('2026-06-01');
    expect(s.to).toBe('2026-06-02');
    expect(s.totalRevenue).toBe(2300);
    expect(s.totalDf).toBe(600);
    expect(s.totalCash).toBe(1800);
    expect(s.totalTransfer).toBe(500);
    expect(s.netRevenue).toBe(1700);
    expect(s.recordCount).toBe(3);
    expect(s.byDate).toEqual([
      { date: '2026-06-01', totalRevenue: 1500, totalDf: 400 },
      { date: '2026-06-02', totalRevenue: 800, totalDf: 200 },
    ]);
    // No guarantee configured → no top-up, guaranteedDf equals actual DF.
    expect(s.totalTopUp).toBe(0);
    expect(s.dfByDoctor).toHaveLength(1);
    expect(s.dfByDoctor[0].dfAmount).toBe(600);
    expect(s.dfByDoctor[0].daysWorked).toBe(2);
  });

  it('matches getMonthlySummary when the range spans the whole month', async () => {
    drFind.mockResolvedValue([
      rec({ date: '2026-06-03', total: 1200, df: 360 }),
      rec({ date: '2026-06-15', total: 900, df: 270, pay: 'TRANSFER' }),
    ]);

    const period = await getPeriodSummary('2026-06-01', '2026-06-30', null);
    const monthly = await getMonthlySummary('2026-06', null);

    // Identical aggregation; only the label keys differ (from/to vs month).
    const { from, to, ...periodFields } = period;
    const { month, ...monthlyFields } = monthly;
    expect(periodFields).toEqual(monthlyFields);
  });

  it('applies the income guarantee per worked day (top-up lifts DF to the floor)', async () => {
    drFind.mockResolvedValue([rec({ date: '2026-06-01', doctorId: 'doc-1', total: 1000, df: 200 })]);
    igFind.mockResolvedValue([{ doctorId: 'doc-1', dailyAmount: D(1000) }]);
    // No work-day row ⇒ full-day fraction 1.0 ⇒ floor 1000; DF 200 ⇒ top-up 800.

    const s = await getPeriodSummary('2026-06-01', '2026-06-01', null);
    const doc = s.dfByDoctor[0];

    expect(doc.dfAmount).toBe(200);
    expect(doc.guaranteeDaily).toBe(1000);
    expect(doc.guaranteedFloor).toBe(1000);
    expect(doc.topUp).toBe(800);
    expect(doc.guaranteedDf).toBe(1000);
    expect(s.totalTopUp).toBe(800);
    expect(s.totalGuaranteedDf).toBe(1000); // totalDf 200 + topUp 800
  });

  it('scopes the query to a single doctor when doctorId is given', async () => {
    drFind.mockResolvedValue([]);

    await getPeriodSummary('2026-06-01', '2026-06-05', 'doc-9');

    expect(drFind).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ doctorId: 'doc-9' }) }),
    );
  });

  it('rejects an inverted range with INVALID_RANGE', async () => {
    await expect(getPeriodSummary('2026-06-10', '2026-06-01', null)).rejects.toThrow('INVALID_RANGE');
  });

  it('rejects a span wider than the cap with INVALID_RANGE', async () => {
    await expect(getPeriodSummary('2024-01-01', '2026-01-01', null)).rejects.toThrow('INVALID_RANGE');
  });

  it('rejects a malformed date with INVALID_DATE', async () => {
    await expect(getPeriodSummary('2026-6-1', '2026-06-02', null)).rejects.toThrow('INVALID_DATE');
  });
});
