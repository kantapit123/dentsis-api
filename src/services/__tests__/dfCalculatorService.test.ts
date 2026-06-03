import { Prisma } from '@prisma/client';
import { computeDf, calculateDf, DfRuleLike } from '../dfCalculatorService';
import { prisma } from '../../prisma';

// Mock Prisma client — only dfRule.findFirst is exercised by rule resolution.
jest.mock('../../prisma', () => ({
  prisma: {
    dfRule: {
      findFirst: jest.fn(),
    },
  },
}));

const findFirst = prisma.dfRule.findFirst as jest.Mock;
const D = (n: number | string) => new Prisma.Decimal(n);

describe('dfCalculatorService.computeDf (pure)', () => {
  it('PERCENTAGE + TREATMENT_FEE → percent of treatment fee only (ignores medicine)', () => {
    const rule: DfRuleLike = { dfType: 'PERCENTAGE', dfBase: 'TREATMENT_FEE', dfValue: 50 };
    expect(computeDf(rule, D(2000), D(50)).toString()).toBe('1000');
  });

  it('PERCENTAGE + TOTAL_AMOUNT → percent of (treatment + medicine)', () => {
    const rule: DfRuleLike = { dfType: 'PERCENTAGE', dfBase: 'TOTAL_AMOUNT', dfValue: 50 };
    expect(computeDf(rule, D(2000), D(50)).toString()).toBe('1025');
  });

  it('FIXED → flat amount regardless of base or fees', () => {
    const ruleTreatment: DfRuleLike = { dfType: 'FIXED', dfBase: 'TREATMENT_FEE', dfValue: 300 };
    const ruleTotal: DfRuleLike = { dfType: 'FIXED', dfBase: 'TOTAL_AMOUNT', dfValue: 300 };
    expect(computeDf(ruleTreatment, D(2000), D(50)).toString()).toBe('300');
    expect(computeDf(ruleTotal, D(2000), D(50)).toString()).toBe('300');
  });

  it('rounds to 2 decimal places (half-up)', () => {
    const rule: DfRuleLike = { dfType: 'PERCENTAGE', dfBase: 'TREATMENT_FEE', dfValue: 10 };
    // 333.33 * 10 / 100 = 33.333 → 33.33
    expect(computeDf(rule, D('333.33'), D(0)).toString()).toBe('33.33');
    // 333.35 * 10 / 100 = 33.335 → 33.34 (half-up)
    expect(computeDf(rule, D('333.35'), D(0)).toString()).toBe('33.34');
  });

  it('handles zero fees and 0% / 100%', () => {
    expect(computeDf({ dfType: 'PERCENTAGE', dfBase: 'TREATMENT_FEE', dfValue: 0 }, D(2000), D(0)).toString()).toBe('0');
    expect(computeDf({ dfType: 'PERCENTAGE', dfBase: 'TOTAL_AMOUNT', dfValue: 100 }, D(2000), D(500)).toString()).toBe('2500');
  });

  it('accepts a Prisma.Decimal dfValue (as stored in DB)', () => {
    const rule: DfRuleLike = { dfType: 'PERCENTAGE', dfBase: 'TREATMENT_FEE', dfValue: D('33.5') };
    // 1000 * 33.5 / 100 = 335
    expect(computeDf(rule, D(1000), D(0)).toString()).toBe('335');
  });
});

describe('dfCalculatorService.calculateDf (rule resolution)', () => {
  beforeEach(() => jest.clearAllMocks());

  const specificRule = {
    id: 'r-specific', doctorId: 'd1', treatmentTypeId: 't1', active: true,
    dfType: 'PERCENTAGE', dfBase: 'TREATMENT_FEE', dfValue: D(60),
  };
  const defaultRule = {
    id: 'r-default', doctorId: 'd1', treatmentTypeId: null, active: true,
    dfType: 'PERCENTAGE', dfBase: 'TREATMENT_FEE', dfValue: D(50),
  };

  it('prefers the specific (doctor+treatmentType) rule when present', async () => {
    findFirst.mockResolvedValueOnce(specificRule); // specific lookup hits
    const res = await calculateDf('d1', 't1', D(1000), D(0));
    expect(res.ruleUsed?.id).toBe('r-specific');
    expect(res.dfAmount.toString()).toBe('600');
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it('falls back to the doctor default when no specific rule', async () => {
    findFirst
      .mockResolvedValueOnce(null) // specific lookup misses
      .mockResolvedValueOnce(defaultRule); // default lookup hits
    const res = await calculateDf('d1', 't1', D(1000), D(0));
    expect(res.ruleUsed?.id).toBe('r-default');
    expect(res.dfAmount.toString()).toBe('500');
    expect(findFirst).toHaveBeenCalledTimes(2);
  });

  it('uses the default directly when treatmentTypeId is null (no specific lookup)', async () => {
    findFirst.mockResolvedValueOnce(defaultRule);
    const res = await calculateDf('d1', null, D(1000), D(0));
    expect(res.ruleUsed?.id).toBe('r-default');
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it('returns df=0 / ruleUsed=null when no active rule matches', async () => {
    findFirst.mockResolvedValue(null);
    const res = await calculateDf('d1', 't1', D(1000), D(500));
    expect(res.ruleUsed).toBeNull();
    expect(res.dfAmount.toString()).toBe('0');
  });
});
