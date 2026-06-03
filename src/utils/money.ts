import { Prisma } from '@prisma/client';

/**
 * Money is stored as Prisma.Decimal (db Decimal(10,2)) for exactness. Prisma returns Decimal
 * objects, which JSON.stringify would emit as strings — so responses must convert explicitly.
 * All money ARITHMETIC must use Decimal methods (.plus/.times/.div), never JS + / *.
 */

export const Decimal = Prisma.Decimal;
export type Decimal = Prisma.Decimal;

/** Convert a (nullable) Decimal column to a JSON number for API responses. */
export function decimalToNumber(d: Prisma.Decimal | null | undefined): number | null {
  return d == null ? null : d.toNumber();
}

/** Round a Decimal to 2 dp using half-up rounding (THB satang precision). */
export function round2(d: Prisma.Decimal): Prisma.Decimal {
  return d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/**
 * Validate that a raw numeric input is a finite, non-negative amount.
 * Returns a Decimal on success; throws Error('INVALID_AMOUNT') otherwise.
 */
export function parseAmount(value: unknown, { allowZero = true } = {}): Prisma.Decimal {
  if (value === null || value === undefined || value === '') throw new Error('INVALID_AMOUNT');
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) throw new Error('INVALID_AMOUNT');
  if (num < 0) throw new Error('INVALID_AMOUNT');
  if (!allowZero && num === 0) throw new Error('INVALID_AMOUNT');
  return round2(new Prisma.Decimal(num));
}
