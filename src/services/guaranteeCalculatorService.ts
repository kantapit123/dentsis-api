import { Prisma } from '@prisma/client';
import { Decimal, round2 } from '../utils/money';

/**
 * Income-guarantee (ประกันรายได้) math. Pure + unit-tested, like dfCalculatorService.
 *
 * A doctor is guaranteed `dailyAmount` THB for a FULL working day. The clinic full day spans
 * CLINIC_OPEN..CLINIC_CLOSE; a doctor who works fewer hours earns a pro-rated floor. The top-up
 * is the shortfall between that floor and the doctor's actual DF for the day — a reporting value
 * applied in financeSummaryService, never written onto DailyRecord.dfAmount.
 *
 * Clinic hours are constants for now; promote to a DB-backed setting if they ever vary per branch.
 */
export const CLINIC_OPEN = '11:00';
export const CLINIC_CLOSE = '20:00';

const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Parse a zero-padded "HH:MM" (00:00–23:59) to minutes from midnight. Throws INVALID_TIME. */
export function parseHHMM(value: unknown): number {
  if (typeof value !== 'string') throw new Error('INVALID_TIME');
  const m = HHMM_RE.exec(value);
  if (!m) throw new Error('INVALID_TIME');
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Minutes in a full clinic day (CLINIC_CLOSE − CLINIC_OPEN). */
export const FULL_DAY_MIN = parseHHMM(CLINIC_CLOSE) - parseHHMM(CLINIC_OPEN);

/**
 * Fraction of a full clinic day worked, from check-in/out times:
 *   clamp(round2((endMin − startMin) / FULL_DAY_MIN), 0, 1)
 * Throws INVALID_TIME_RANGE when end ≤ start; INVALID_TIME on a malformed time.
 */
export function computeDayFraction(startTime: unknown, endTime: unknown): Prisma.Decimal {
  const startMin = parseHHMM(startTime);
  const endMin = parseHHMM(endTime);
  if (endMin <= startMin) throw new Error('INVALID_TIME_RANGE');

  const fraction = round2(new Decimal(endMin - startMin).div(FULL_DAY_MIN));
  if (fraction.greaterThan(1)) return new Decimal(1);
  if (fraction.lessThan(0)) return new Decimal(0);
  return fraction;
}

/**
 * Income-guarantee top-up for one worked day:
 *   floor  = round2(dailyAmount × dayFraction)
 *   topUp  = max(0, floor − dfForDay)
 * A worked day with zero patients (dfForDay = 0) therefore pays the full pro-rated floor.
 */
export function computeTopUp(
  dailyAmount: Prisma.Decimal | number | string,
  dayFraction: Prisma.Decimal | number | string,
  dfForDay: Prisma.Decimal | number | string,
): Prisma.Decimal {
  const floor = round2(new Decimal(dailyAmount).times(new Decimal(dayFraction)));
  const topUp = floor.minus(new Decimal(dfForDay));
  return topUp.greaterThan(0) ? round2(topUp) : new Decimal(0);
}
