import { prisma } from '../prisma';
import { Prisma } from '@prisma/client';
import { Decimal, round2 } from '../utils/money';
import { dayRangeUTC, monthRangeUTC, rangeUTC, recordDateKey } from '../utils/date';
import { computeTopUp } from './guaranteeCalculatorService';

export interface DfByDoctorEntry {
  doctorId: string;
  doctorName: string | null;
  dfAmount: number; // actual DF earned (never altered by the guarantee)
  recordCount: number;
  daysWorked: number; // worked calendar days in the period (records ∪ work-day rows)
  dayFraction: number | null; // daily summary: that day's fraction; null in monthly
  guaranteeDaily: number | null; // configured guarantee per FULL day, null when none
  guaranteedFloor: number; // Σ pro-rated floor over worked days (rate × fraction)
  topUp: number; // Σ per-day shortfall paid by the clinic (≥ 0)
  guaranteedDf: number; // dfAmount + topUp (what the doctor is actually owed)
}

interface SummaryFields {
  totalCash: number;
  totalTransfer: number;
  totalRevenue: number;
  totalDf: number;
  netRevenue: number; // totalRevenue − totalDf (actual DF; unchanged for back-compat)
  totalTopUp: number; // Σ income-guarantee top-ups
  totalGuaranteedDf: number; // totalDf + totalTopUp
  netRevenueAfterGuarantee: number; // totalRevenue − totalGuaranteedDf
  recordCount: number;
  dfByDoctor: DfByDoctorEntry[];
}

export interface DailySummary extends SummaryFields {
  date: string;
}

export interface ByDateEntry {
  date: string;
  totalRevenue: number;
  totalDf: number;
}

export interface MonthlySummary extends SummaryFields {
  month: string;
  byDate: ByDateEntry[];
}

export interface PeriodSummary extends SummaryFields {
  from: string;
  to: string;
  byDate: ByDateEntry[];
}

type SummaryRecord = Prisma.DailyRecordGetPayload<{ include: { doctor: { select: { name: true } } } }>;

const includeDoctor = { doctor: { select: { name: true } } } as const;
const includeWorkDayRelations = {
  doctor: { select: { name: true } },
  workSessionType: { select: { name: true } },
} as const;

const unique = (ids: string[]): string[] => [...new Set(ids)];

async function fetchRecords(
  range: { start: Date; end: Date },
  doctorId: string | null,
): Promise<SummaryRecord[]> {
  return prisma.dailyRecord.findMany({
    where: {
      recordDate: { gte: range.start, lt: range.end },
      ...(doctorId ? { doctorId } : {}),
    },
    include: includeDoctor,
    orderBy: [{ recordDate: 'asc' }, { sequenceNo: 'asc' }],
  });
}

interface Totals {
  totalCash: Prisma.Decimal;
  totalTransfer: Prisma.Decimal;
  totalRevenue: Prisma.Decimal;
  totalDf: Prisma.Decimal;
}

interface DoctorBase {
  name: string | null;
  df: Prisma.Decimal;
  recordCount: number;
}

function aggregate(records: SummaryRecord[]): { totals: Totals; byDoctor: Map<string, DoctorBase> } {
  let totalCash = new Decimal(0);
  let totalTransfer = new Decimal(0);
  let totalRevenue = new Decimal(0);
  let totalDf = new Decimal(0);

  const byDoctor = new Map<string, DoctorBase>();

  for (const r of records) {
    totalRevenue = totalRevenue.plus(r.totalAmount);
    totalDf = totalDf.plus(r.dfAmount);
    if (r.paymentMethod === 'CASH') totalCash = totalCash.plus(r.totalAmount);
    else totalTransfer = totalTransfer.plus(r.totalAmount);

    const entry = byDoctor.get(r.doctorId) ?? { name: r.doctor?.name ?? null, df: new Decimal(0), recordCount: 0 };
    entry.df = entry.df.plus(r.dfAmount);
    entry.recordCount += 1;
    byDoctor.set(r.doctorId, entry);
  }

  return { totals: { totalCash, totalTransfer, totalRevenue, totalDf }, byDoctor };
}

async function fetchActiveGuarantees(doctorIds: string[]): Promise<Map<string, Prisma.Decimal>> {
  if (doctorIds.length === 0) return new Map();
  const rows = await prisma.incomeGuarantee.findMany({
    where: { active: true, doctorId: { in: doctorIds } },
    select: { doctorId: true, dailyAmount: true },
  });
  return new Map(rows.map((r) => [r.doctorId, r.dailyAmount]));
}

type WorkRow = Prisma.DoctorWorkDayGetPayload<{
  include: {
    doctor: { select: { name: true } };
    workSessionType: { select: { name: true } };
  };
}>;

async function fetchWorkDays(
  range: { start: Date; end: Date },
  doctorId: string | null,
): Promise<WorkRow[]> {
  return prisma.doctorWorkDay.findMany({
    where: {
      workDate: { gte: range.start, lt: range.end },
      ...(doctorId ? { doctorId } : {}),
    },
    include: includeWorkDayRelations,
  });
}

/**
 * Look up the applicable DoctorSessionRate for a specific (doctorId, workSessionTypeId, workDate).
 * Returns the amount or null if none found.
 */
async function fetchSessionRateForDay(
  doctorId: string,
  workSessionTypeId: string,
  workDate: Date,
): Promise<Prisma.Decimal | null> {
  const rate = await prisma.doctorSessionRate.findFirst({
    where: {
      doctorId,
      workSessionTypeId,
      effectiveFrom: { lte: workDate },
      OR: [
        { effectiveTo: null },
        { effectiveTo: { gte: workDate } },
      ],
    },
    orderBy: { effectiveFrom: 'desc' },
    select: { amount: true },
  });
  return rate?.amount ?? null;
}

/**
 * Batch-fetch all DoctorSessionRate rows for the given (doctorId, workSessionTypeId) pairs
 * that overlap the range. Returns a Map keyed by `${doctorId}:${workSessionTypeId}` →
 * sorted array of rate records (effectiveFrom asc) for in-memory per-date lookup.
 */
async function fetchSessionRates(
  pairs: Array<{ doctorId: string; workSessionTypeId: string }>,
  range: { start: Date; end: Date },
): Promise<Map<string, Array<{ effectiveFrom: Date; effectiveTo: Date | null; amount: Prisma.Decimal }>>> {
  if (pairs.length === 0) return new Map();

  // Build OR conditions for each pair
  const orConditions = pairs.map((p) => ({
    doctorId: p.doctorId,
    workSessionTypeId: p.workSessionTypeId,
    // Rate overlaps the range if effectiveFrom <= range.end AND (effectiveTo >= range.start OR effectiveTo null)
    effectiveFrom: { lte: range.end },
    OR: [{ effectiveTo: null }, { effectiveTo: { gte: range.start } }],
  }));

  const rows = await prisma.doctorSessionRate.findMany({
    where: { OR: orConditions },
    select: { doctorId: true, workSessionTypeId: true, effectiveFrom: true, effectiveTo: true, amount: true },
    orderBy: { effectiveFrom: 'asc' },
  });

  const result = new Map<
    string,
    Array<{ effectiveFrom: Date; effectiveTo: Date | null; amount: Prisma.Decimal }>
  >();
  for (const row of rows) {
    const key = `${row.doctorId}:${row.workSessionTypeId}`;
    const arr = result.get(key) ?? [];
    arr.push({ effectiveFrom: row.effectiveFrom, effectiveTo: row.effectiveTo, amount: row.amount });
    result.set(key, arr);
  }
  return result;
}

/**
 * Find the applicable rate for a given workDate from a pre-fetched sorted array of rate records.
 */
function findRateForDate(
  rates: Array<{ effectiveFrom: Date; effectiveTo: Date | null; amount: Prisma.Decimal }>,
  workDate: Date,
): Prisma.Decimal | null {
  // Rates are sorted effectiveFrom asc; find the last one whose from <= workDate AND (to >= workDate OR to null)
  let found: Prisma.Decimal | null = null;
  for (const r of rates) {
    if (r.effectiveFrom <= workDate) {
      if (r.effectiveTo === null || r.effectiveTo >= workDate) {
        found = r.amount;
      }
    }
  }
  return found;
}

// Build the period summary fields shared by daily & monthly from already-computed totals + per-doctor rollups.
function buildSummaryFields(
  totals: Totals,
  dfByDoctor: DfByDoctorEntry[],
  totalTopUp: Prisma.Decimal,
  recordCount: number,
): SummaryFields {
  const totalGuaranteedDf = totals.totalDf.plus(totalTopUp);
  return {
    totalCash: totals.totalCash.toNumber(),
    totalTransfer: totals.totalTransfer.toNumber(),
    totalRevenue: totals.totalRevenue.toNumber(),
    totalDf: totals.totalDf.toNumber(),
    netRevenue: totals.totalRevenue.minus(totals.totalDf).toNumber(),
    totalTopUp: totalTopUp.toNumber(),
    totalGuaranteedDf: totalGuaranteedDf.toNumber(),
    netRevenueAfterGuarantee: totals.totalRevenue.minus(totalGuaranteedDf).toNumber(),
    recordCount,
    dfByDoctor,
  };
}

export async function getDailySummary(date: string, doctorId: string | null): Promise<DailySummary> {
  const range = dayRangeUTC(date); // validates date format
  const workDate = range.start; // the single date for the query
  const records = await fetchRecords(range, doctorId);
  const { totals, byDoctor } = aggregate(records);

  // Attendance rows for the day are the authoritative "worked" + fraction signal (handles the
  // paid-but-zero-patient case: such a doctor has no record yet must still appear with a top-up).
  const workRows = await fetchWorkDays(range, doctorId);
  const workByDoctor = new Map(
    workRows.map((w) => [
      w.doctorId,
      {
        fraction: w.dayFraction,
        name: w.doctor?.name ?? null,
        workSessionTypeId: w.workSessionTypeId ?? null,
        guaranteedAmountOverride: w.guaranteedAmountOverride ?? null,
      },
    ]),
  );

  const doctorIds = unique([...byDoctor.keys(), ...workByDoctor.keys()]);
  const guarantees = await fetchActiveGuarantees(doctorIds);

  let totalTopUp = new Decimal(0);
  const dfByDoctor: DfByDoctorEntry[] = await Promise.all(
    doctorIds.map(async (id) => {
      const base = byDoctor.get(id);
      const work = workByDoctor.get(id);
      const df = base?.df ?? new Decimal(0);
      const fraction = work?.fraction ?? new Decimal(1); // worked (in union) but no row ⇒ full day
      const workSessionTypeId = work?.workSessionTypeId ?? null;

      // Resolve rate: guaranteedAmountOverride > session-type rate > IncomeGuarantee
      const guaranteedAmountOverride = work?.guaranteedAmountOverride ?? null;
      let rate: Prisma.Decimal | null = null;
      if (guaranteedAmountOverride !== null) {
        rate = guaranteedAmountOverride;
      } else if (workSessionTypeId) {
        rate = await fetchSessionRateForDay(id, workSessionTypeId, workDate);
      }
      if (rate === null) {
        rate = guarantees.get(id) ?? null;
      }

      const floor = rate ? round2(rate.times(fraction)) : new Decimal(0);
      const topUp = rate ? computeTopUp(rate, fraction, df) : new Decimal(0);
      totalTopUp = totalTopUp.plus(topUp);
      return {
        doctorId: id,
        doctorName: base?.name ?? work?.name ?? null,
        dfAmount: df.toNumber(),
        recordCount: base?.recordCount ?? 0,
        daysWorked: 1,
        dayFraction: fraction.toNumber(),
        guaranteeDaily: rate ? rate.toNumber() : null,
        guaranteedFloor: floor.toNumber(),
        topUp: topUp.toNumber(),
        guaranteedDf: df.plus(topUp).toNumber(),
      };
    }),
  );

  return { date, ...buildSummaryFields(totals, dfByDoctor, totalTopUp, records.length) };
}

/**
 * Core per-range rollup shared by the monthly and custom-period summaries. The income guarantee
 * is evaluated **per (doctor, worked day)** across the range (worked = has a record OR a work-day row).
 */
async function summarizeRange(
  range: { start: Date; end: Date },
  doctorId: string | null,
): Promise<SummaryFields & { byDate: ByDateEntry[] }> {
  const records = await fetchRecords(range, doctorId);
  const { totals, byDoctor } = aggregate(records);

  // Revenue/DF by calendar day for charting (unchanged).
  const dayMap = new Map<string, { totalRevenue: Prisma.Decimal; totalDf: Prisma.Decimal }>();
  // DF per (doctor, day) — the guarantee is evaluated per worked day (D1).
  const dfByDoctorDate = new Map<string, Map<string, Prisma.Decimal>>();
  const nameByDoctor = new Map<string, string | null>();

  for (const r of records) {
    const key = recordDateKey(r.recordDate);
    const d = dayMap.get(key) ?? { totalRevenue: new Decimal(0), totalDf: new Decimal(0) };
    d.totalRevenue = d.totalRevenue.plus(r.totalAmount);
    d.totalDf = d.totalDf.plus(r.dfAmount);
    dayMap.set(key, d);

    let perDay = dfByDoctorDate.get(r.doctorId);
    if (!perDay) {
      perDay = new Map();
      dfByDoctorDate.set(r.doctorId, perDay);
    }
    perDay.set(key, (perDay.get(key) ?? new Decimal(0)).plus(r.dfAmount));
    nameByDoctor.set(r.doctorId, r.doctor?.name ?? null);
  }

  const byDate: ByDateEntry[] = [...dayMap.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([d, v]) => ({ date: d, totalRevenue: v.totalRevenue.toNumber(), totalDf: v.totalDf.toNumber() }));

  // Attendance fractions + session type per (doctor, day).
  const workRows = await fetchWorkDays(range, doctorId);
  const fractionByDoctorDate = new Map<string, Map<string, Prisma.Decimal>>();
  // Track the workSessionTypeId per (doctorId, dateKey) for session-rate lookup
  const sessionTypeByDoctorDate = new Map<string, Map<string, string>>();
  // Track guaranteedAmountOverride per (doctorId, dateKey); takes priority over session-type rate
  const overrideByDoctorDate = new Map<string, Map<string, Prisma.Decimal>>();

  for (const w of workRows) {
    const key = recordDateKey(w.workDate);

    let frPerDay = fractionByDoctorDate.get(w.doctorId);
    if (!frPerDay) {
      frPerDay = new Map();
      fractionByDoctorDate.set(w.doctorId, frPerDay);
    }
    frPerDay.set(key, w.dayFraction);

    if (w.workSessionTypeId) {
      let stPerDay = sessionTypeByDoctorDate.get(w.doctorId);
      if (!stPerDay) {
        stPerDay = new Map();
        sessionTypeByDoctorDate.set(w.doctorId, stPerDay);
      }
      stPerDay.set(key, w.workSessionTypeId);
    }

    if (w.guaranteedAmountOverride) {
      let ovPerDay = overrideByDoctorDate.get(w.doctorId);
      if (!ovPerDay) {
        ovPerDay = new Map();
        overrideByDoctorDate.set(w.doctorId, ovPerDay);
      }
      ovPerDay.set(key, w.guaranteedAmountOverride);
    }

    if (!nameByDoctor.has(w.doctorId)) nameByDoctor.set(w.doctorId, w.doctor?.name ?? null);
  }

  const doctorIds = unique([...dfByDoctorDate.keys(), ...fractionByDoctorDate.keys()]);
  const guarantees = await fetchActiveGuarantees(doctorIds);

  // Batch-fetch all session rates for the pairs that appear in workRows
  const sessionTypePairs: Array<{ doctorId: string; workSessionTypeId: string }> = [];
  for (const [dId, stMap] of sessionTypeByDoctorDate.entries()) {
    for (const stId of stMap.values()) {
      if (!sessionTypePairs.some((p) => p.doctorId === dId && p.workSessionTypeId === stId)) {
        sessionTypePairs.push({ doctorId: dId, workSessionTypeId: stId });
      }
    }
  }
  const sessionRatesMap = await fetchSessionRates(sessionTypePairs, range);

  let totalTopUp = new Decimal(0);
  const dfByDoctor: DfByDoctorEntry[] = doctorIds.map((id) => {
    const dfDates = dfByDoctorDate.get(id) ?? new Map<string, Prisma.Decimal>();
    const frDates = fractionByDoctorDate.get(id) ?? new Map<string, Prisma.Decimal>();
    const stDates = sessionTypeByDoctorDate.get(id) ?? new Map<string, string>();
    const ovDates = overrideByDoctorDate.get(id) ?? new Map<string, Prisma.Decimal>();
    const workedDates = unique([...dfDates.keys(), ...frDates.keys()]);
    const fallbackRate = guarantees.get(id) ?? null;

    let df = new Decimal(0);
    let floor = new Decimal(0);
    let topUp = new Decimal(0);
    for (const key of workedDates) {
      const dfDay = dfDates.get(key) ?? new Decimal(0);
      df = df.plus(dfDay);

      // Resolve rate: guaranteedAmountOverride > session-type rate > IncomeGuarantee
      const overrideAmt = ovDates.get(key) ?? null;
      let rate: Prisma.Decimal | null = null;
      if (overrideAmt !== null) {
        rate = overrideAmt;
      } else {
        const workSessionTypeId = stDates.get(key) ?? null;
        if (workSessionTypeId) {
          const rateKey = `${id}:${workSessionTypeId}`;
          const rateRecords = sessionRatesMap.get(rateKey) ?? [];
          const workDate = new Date(`${key}T00:00:00.000Z`);
          rate = findRateForDate(rateRecords, workDate);
        }
      }
      if (rate === null) {
        rate = fallbackRate;
      }

      if (rate) {
        const fraction = frDates.get(key) ?? new Decimal(1); // record day with no row ⇒ full day
        floor = floor.plus(round2(rate.times(fraction)));
        topUp = topUp.plus(computeTopUp(rate, fraction, dfDay));
      }
    }
    totalTopUp = totalTopUp.plus(topUp);
    return {
      doctorId: id,
      doctorName: nameByDoctor.get(id) ?? null,
      dfAmount: df.toNumber(),
      recordCount: byDoctor.get(id)?.recordCount ?? 0,
      daysWorked: workedDates.length,
      dayFraction: null,
      guaranteeDaily: fallbackRate ? fallbackRate.toNumber() : null,
      guaranteedFloor: floor.toNumber(),
      topUp: topUp.toNumber(),
      guaranteedDf: df.plus(topUp).toNumber(),
    };
  });

  return { ...buildSummaryFields(totals, dfByDoctor, totalTopUp, records.length), byDate };
}

export async function getMonthlySummary(month: string, doctorId: string | null): Promise<MonthlySummary> {
  const range = monthRangeUTC(month); // validates YYYY-MM
  return { month, ...(await summarizeRange(range, doctorId)) };
}

export async function getPeriodSummary(
  from: string,
  to: string,
  doctorId: string | null,
): Promise<PeriodSummary> {
  const range = rangeUTC(from, to); // validates both bounds + range width
  return { from, to, ...(await summarizeRange(range, doctorId)) };
}
