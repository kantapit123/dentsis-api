import { Prisma } from '@prisma/client';
import {
  parseHHMM,
  computeDayFraction,
  computeTopUp,
  FULL_DAY_MIN,
} from '../guaranteeCalculatorService';

const D = (n: number | string) => new Prisma.Decimal(n);

describe('guaranteeCalculatorService.parseHHMM', () => {
  it('parses valid HH:MM to minutes from midnight', () => {
    expect(parseHHMM('00:00')).toBe(0);
    expect(parseHHMM('11:00')).toBe(660);
    expect(parseHHMM('15:30')).toBe(930);
    expect(parseHHMM('20:00')).toBe(1200);
    expect(parseHHMM('23:59')).toBe(1439);
  });

  it('throws INVALID_TIME on bad format or out-of-range values', () => {
    expect(() => parseHHMM('25:00')).toThrow('INVALID_TIME');
    expect(() => parseHHMM('11:60')).toThrow('INVALID_TIME');
    expect(() => parseHHMM('9:00')).toThrow('INVALID_TIME'); // not zero-padded
    expect(() => parseHHMM('abc')).toThrow('INVALID_TIME');
    expect(() => parseHHMM('')).toThrow('INVALID_TIME');
    expect(() => parseHHMM(undefined)).toThrow('INVALID_TIME');
  });
});

describe('guaranteeCalculatorService.computeDayFraction', () => {
  it('clinic full day 11:00–20:00 → 1.00', () => {
    expect(FULL_DAY_MIN).toBe(540);
    expect(computeDayFraction('11:00', '20:00').toString()).toBe('1');
  });

  it('half day 11:00–15:30 → 0.5', () => {
    expect(computeDayFraction('11:00', '15:30').toString()).toBe('0.5');
  });

  it('clamps to 1.00 when the doctor works longer than a full day', () => {
    expect(computeDayFraction('11:00', '21:00').toString()).toBe('1');
  });

  it('rounds the fraction to 2 dp (half-up)', () => {
    // 14:00–20:00 = 360 / 540 = 0.6666… → 0.67
    expect(computeDayFraction('14:00', '20:00').toString()).toBe('0.67');
  });

  it('throws INVALID_TIME_RANGE when end ≤ start', () => {
    expect(() => computeDayFraction('20:00', '11:00')).toThrow('INVALID_TIME_RANGE');
    expect(() => computeDayFraction('11:00', '11:00')).toThrow('INVALID_TIME_RANGE');
  });

  it('propagates INVALID_TIME from a malformed time', () => {
    expect(() => computeDayFraction('11:00', '99:99')).toThrow('INVALID_TIME');
  });
});

describe('guaranteeCalculatorService.computeTopUp', () => {
  it('tops up the difference when DF is below the floor', () => {
    // floor = 4000 × 1 = 4000; DF 3000 → top-up 1000
    expect(computeTopUp(D(4000), D(1), D(3000)).toString()).toBe('1000');
  });

  it('is 0 when DF meets or exceeds the floor', () => {
    expect(computeTopUp(D(4000), D(1), D(4000)).toString()).toBe('0');
    expect(computeTopUp(D(4000), D(1), D(5000)).toString()).toBe('0');
  });

  it('pro-rates the floor by dayFraction (half day halves the floor)', () => {
    // floor = 4000 × 0.5 = 2000; DF 1500 → top-up 500
    expect(computeTopUp(D(4000), D('0.5'), D(1500)).toString()).toBe('500');
  });

  it('pays the full pro-rated floor on a worked day with zero patients (DF = 0)', () => {
    expect(computeTopUp(D(4000), D(1), D(0)).toString()).toBe('4000');
    expect(computeTopUp(D(4000), D('0.5'), D(0)).toString()).toBe('2000');
  });

  it('rounds the floor to 2 dp (half-up) before comparing', () => {
    // floor = 333.33 × 0.5 = 166.665 → 166.67; DF 0 → top-up 166.67
    expect(computeTopUp(D('333.33'), D('0.5'), D(0)).toString()).toBe('166.67');
  });

  it('accepts number/string inputs as well as Decimal', () => {
    expect(computeTopUp(4000, 0.5, 1000).toString()).toBe('1000');
  });
});
