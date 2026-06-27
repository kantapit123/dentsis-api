import { prisma } from '../prisma';
import { Prisma } from '@prisma/client';
import { Decimal, decimalToNumber, round2 } from '../utils/money';
import { parseRecordDate, isFutureDate, dayRangeUTC, recordDateKey } from '../utils/date';
import { computeDayFraction } from './guaranteeCalculatorService';

export interface WorkDayResponse {
  id: string;
  doctorId: string;
  doctorName: string | null;
  workDate: string; // YYYY-MM-DD
  startTime: string | null;
  endTime: string | null;
  dayFraction: number | null;
  workSessionTypeId: string | null;
  workSessionTypeName: string | null;
  guaranteedAmountOverride: number | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertWorkDayInput {
  doctorId: string;
  workDate: string;
  startTime?: string | null;
  endTime?: string | null;
  dayFraction?: number | string; // direct fallback used only when times are omitted
  workSessionTypeId?: string | null;
  guaranteedAmountOverride?: number | null;
  note?: string | null;
}

export interface UpdateWorkDayInput {
  startTime?: string | null;
  endTime?: string | null;
  dayFraction?: number | string;
  workSessionTypeId?: string | null;
  guaranteedAmountOverride?: number | null;
  note?: string | null;
}

export interface ListWorkDayFilter {
  doctorId?: string | null;
  date?: string;
  from?: string;
  to?: string;
}

type WorkDayWithDoctor = Prisma.DoctorWorkDayGetPayload<{
  include: {
    doctor: { select: { name: true } };
    workSessionType: { select: { name: true; label: true } };
  };
}>;

const includeDoctor = {
  doctor: { select: { name: true } },
  workSessionType: { select: { name: true, label: true } },
} as const;

function toResponse(w: WorkDayWithDoctor): WorkDayResponse {
  return {
    id: w.id,
    doctorId: w.doctorId,
    doctorName: w.doctor?.name ?? null,
    workDate: recordDateKey(w.workDate),
    startTime: w.startTime,
    endTime: w.endTime,
    dayFraction: decimalToNumber(w.dayFraction),
    workSessionTypeId: w.workSessionTypeId ?? null,
    workSessionTypeName: w.workSessionType?.name ?? null,
    guaranteedAmountOverride: w.guaranteedAmountOverride ? decimalToNumber(w.guaranteedAmountOverride) : null,
    note: w.note,
    createdAt: w.createdAt.toISOString(),
    updatedAt: w.updatedAt.toISOString(),
  };
}

async function assertDoctorActive(doctorId: string): Promise<void> {
  const doctor = await prisma.doctor.findUnique({ where: { id: doctorId } });
  if (!doctor || !doctor.active) throw new Error('INACTIVE_DOCTOR');
}

async function assertWorkSessionTypeActive(workSessionTypeId: string): Promise<void> {
  const type = await prisma.workSessionType.findUnique({ where: { id: workSessionTypeId } });
  if (!type || !type.active) throw new Error('SESSION_TYPE_NOT_FOUND');
}

// dayFraction entered directly (no times): must be in (0, 1].
function validateFraction(value: unknown): Prisma.Decimal {
  const num = typeof value === 'number' ? value : Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(num)) {
    throw new Error('INVALID_DAY_FRACTION');
  }
  if (num <= 0 || num > 1) throw new Error('INVALID_DAY_FRACTION');
  return round2(new Decimal(num));
}

// Resolve attendance into {startTime, endTime, dayFraction}. Times (both required) win and drive
// the computed fraction; otherwise a directly-entered fraction is used; otherwise a full day (1.0).
function resolveAttendance(
  startTime: string | null | undefined,
  endTime: string | null | undefined,
  dayFraction: number | string | undefined,
): { startTime: string | null; endTime: string | null; dayFraction: Prisma.Decimal } {
  const hasStart = startTime !== null && startTime !== undefined && startTime !== '';
  const hasEnd = endTime !== null && endTime !== undefined && endTime !== '';

  if (hasStart || hasEnd) {
    if (!hasStart || !hasEnd) throw new Error('INVALID_TIME_RANGE'); // both or neither
    return { startTime: startTime!, endTime: endTime!, dayFraction: computeDayFraction(startTime, endTime) };
  }
  if (dayFraction !== undefined && dayFraction !== null && (dayFraction as unknown) !== '') {
    return { startTime: null, endTime: null, dayFraction: validateFraction(dayFraction) };
  }
  return { startTime: null, endTime: null, dayFraction: new Decimal(1) };
}

function buildDateWhere(filter: ListWorkDayFilter): Prisma.DoctorWorkDayWhereInput {
  const where: Prisma.DoctorWorkDayWhereInput = {};
  if (filter.doctorId) where.doctorId = filter.doctorId;

  if (filter.date) {
    const { start, end } = dayRangeUTC(filter.date);
    where.workDate = { gte: start, lt: end };
  } else if (filter.from || filter.to) {
    const range: Prisma.DateTimeFilter = {};
    if (filter.from) range.gte = dayRangeUTC(filter.from).start;
    if (filter.to) range.lt = dayRangeUTC(filter.to).end; // inclusive end day
    where.workDate = range;
  }
  return where;
}

export async function listWorkDays(filter: ListWorkDayFilter): Promise<WorkDayResponse[]> {
  const rows = await prisma.doctorWorkDay.findMany({
    where: buildDateWhere(filter),
    include: includeDoctor,
    orderBy: [{ workDate: 'desc' }, { doctorId: 'asc' }],
  });
  return rows.map(toResponse);
}

// Create-or-replace the attendance row for a (doctor, date). One row per pair (unique constraint).
export async function upsertWorkDay(input: UpsertWorkDayInput): Promise<WorkDayResponse> {
  const workDate = parseRecordDate(input.workDate);
  if (isFutureDate(input.workDate)) throw new Error('FUTURE_DATE');
  await assertDoctorActive(input.doctorId);

  const { startTime, endTime, dayFraction } = resolveAttendance(
    input.startTime,
    input.endTime,
    input.dayFraction,
  );
  const note = input.note?.trim() || null;
  const workSessionTypeId = input.workSessionTypeId ?? null;
  const guaranteedAmountOverride = input.guaranteedAmountOverride ?? null;

  if (workSessionTypeId) await assertWorkSessionTypeActive(workSessionTypeId);

  const row = await prisma.doctorWorkDay.upsert({
    where: { doctorId_workDate: { doctorId: input.doctorId, workDate } },
    create: { doctorId: input.doctorId, workDate, startTime, endTime, dayFraction, workSessionTypeId, guaranteedAmountOverride, note },
    update: { startTime, endTime, dayFraction, workSessionTypeId, guaranteedAmountOverride, note },
    include: includeDoctor,
  });
  return toResponse(row);
}

export async function updateWorkDay(id: string, input: UpdateWorkDayInput): Promise<WorkDayResponse> {
  const existing = await prisma.doctorWorkDay.findUnique({ where: { id } });
  if (!existing) throw new Error('WORK_DAY_NOT_FOUND');

  let startTime = existing.startTime;
  let endTime = existing.endTime;
  let dayFraction: Prisma.Decimal = existing.dayFraction;

  if (input.startTime !== undefined || input.endTime !== undefined) {
    // A time change re-derives the fraction (both times required).
    const s = input.startTime !== undefined ? input.startTime : existing.startTime;
    const e = input.endTime !== undefined ? input.endTime : existing.endTime;
    if (!s || !e) throw new Error('INVALID_TIME_RANGE');
    dayFraction = computeDayFraction(s, e);
    startTime = s;
    endTime = e;
  } else if (input.dayFraction !== undefined) {
    dayFraction = validateFraction(input.dayFraction);
    startTime = null;
    endTime = null;
  }

  const note = input.note !== undefined ? input.note?.trim() || null : existing.note;

  let workSessionTypeId: string | null = existing.workSessionTypeId ?? null;
  if (input.workSessionTypeId !== undefined) {
    workSessionTypeId = input.workSessionTypeId ?? null;
    if (workSessionTypeId) await assertWorkSessionTypeActive(workSessionTypeId);
  }

  const guaranteedAmountOverride =
    input.guaranteedAmountOverride !== undefined
      ? (input.guaranteedAmountOverride !== null ? new Decimal(input.guaranteedAmountOverride) : null)
      : existing.guaranteedAmountOverride;

  const row = await prisma.doctorWorkDay.update({
    where: { id },
    data: { startTime, endTime, dayFraction, workSessionTypeId, guaranteedAmountOverride, note },
    include: includeDoctor,
  });
  return toResponse(row);
}

export async function deleteWorkDay(id: string): Promise<void> {
  const existing = await prisma.doctorWorkDay.findUnique({ where: { id } });
  if (!existing) throw new Error('WORK_DAY_NOT_FOUND');
  await prisma.doctorWorkDay.delete({ where: { id } });
}
