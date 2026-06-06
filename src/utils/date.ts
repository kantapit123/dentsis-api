/**
 * Date helpers for the Finance module.
 *
 * recordDate is stored as Prisma @db.Date (date-only) and read back as a DateTime at UTC midnight.
 * The clinic operates in Asia/Bangkok (UTC+7). To stay consistent we treat every record date as a
 * plain `YYYY-MM-DD` key, store it as UTC-midnight, and build range queries on the same UTC basis.
 * "Today / not in the future" is evaluated against the clinic's local calendar day, not server UTC.
 */

export const CLINIC_TZ = 'Asia/Bangkok';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

/** Largest custom period a report may span, to keep range queries bounded. */
export const MAX_RANGE_DAYS = 366;

/** Current calendar day in the clinic timezone as `YYYY-MM-DD`. */
export function clinicToday(): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: CLINIC_TZ }).format(new Date());
}

/** Validate a `YYYY-MM-DD` string and return the UTC-midnight Date used for storage. */
export function parseRecordDate(value: unknown): Date {
  if (typeof value !== 'string' || !DATE_RE.test(value)) throw new Error('INVALID_DATE');
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new Error('INVALID_DATE');
  // Guard against rollovers like 2026-02-30 → 2026-03-02.
  if (d.toISOString().slice(0, 10) !== value) throw new Error('INVALID_DATE');
  return d;
}

/** True when the given `YYYY-MM-DD` is after the clinic's current calendar day. */
export function isFutureDate(value: string): boolean {
  return value > clinicToday(); // lexicographic compare is valid for zero-padded ISO dates
}

/** UTC [start, end) range covering a single `YYYY-MM-DD`. */
export function dayRangeUTC(value: string): { start: Date; end: Date } {
  const start = parseRecordDate(value);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

/** Validate `YYYY-MM` and return the UTC [start, end) range covering that month. */
export function monthRangeUTC(month: unknown): { start: Date; end: Date } {
  if (typeof month !== 'string' || !MONTH_RE.test(month)) throw new Error('INVALID_MONTH');
  const start = new Date(`${month}-01T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) throw new Error('INVALID_MONTH');
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  return { start, end };
}

/**
 * Validate two `YYYY-MM-DD` strings and return the UTC [start, end) range covering
 * [from..to] **inclusive**. Rejects `to < from` and spans wider than MAX_RANGE_DAYS
 * with INVALID_RANGE; either malformed bound throws INVALID_DATE (via parseRecordDate).
 */
export function rangeUTC(from: unknown, to: unknown): { start: Date; end: Date } {
  const start = parseRecordDate(from);
  const last = parseRecordDate(to);
  if (last.getTime() < start.getTime()) throw new Error('INVALID_RANGE');
  const spanDays = Math.round((last.getTime() - start.getTime()) / 86_400_000) + 1;
  if (spanDays > MAX_RANGE_DAYS) throw new Error('INVALID_RANGE');
  const end = new Date(last.getTime() + 24 * 60 * 60 * 1000); // exclusive upper bound
  return { start, end };
}

/** Format a stored recordDate (UTC-midnight Date) back to its `YYYY-MM-DD` key. */
export function recordDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}
