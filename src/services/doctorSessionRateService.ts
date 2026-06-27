import { prisma } from '../prisma';
import { Prisma } from '@prisma/client';
import { decimalToNumber, parseAmount } from '../utils/money';
import { recordDateKey } from '../utils/date';

export interface DoctorSessionRateResponse {
  id: string;
  doctorId: string;
  workSessionTypeId: string;
  workSessionTypeName: string;
  workSessionTypeLabel: string;
  amount: number | null;
  effectiveFrom: string; // YYYY-MM-DD
  effectiveTo: string | null; // YYYY-MM-DD or null
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CreateRateInput {
  doctorId: string;
  workSessionTypeId: string;
  amount: number | string;
  effectiveFrom: string; // YYYY-MM-DD
  effectiveTo?: string | null; // YYYY-MM-DD or null
  note?: string | null;
}

interface UpdateRateInput {
  amount?: number | string;
  effectiveFrom?: string;
  effectiveTo?: string | null;
  note?: string | null;
}

// A large date used as a sentinel for "open-ended" end date during overlap checking
const MAX_DATE = new Date('9999-12-31T00:00:00.000Z');

type RateWithRelations = Prisma.DoctorSessionRateGetPayload<{
  include: { workSessionType: { select: { name: true; label: true } } };
}>;

const includeRelations = {
  workSessionType: { select: { name: true, label: true } },
} as const;

function toResponse(row: RateWithRelations): DoctorSessionRateResponse {
  return {
    id: row.id,
    doctorId: row.doctorId,
    workSessionTypeId: row.workSessionTypeId,
    workSessionTypeName: row.workSessionType.name,
    workSessionTypeLabel: row.workSessionType.label,
    amount: decimalToNumber(row.amount),
    effectiveFrom: recordDateKey(row.effectiveFrom),
    effectiveTo: row.effectiveTo ? recordDateKey(row.effectiveTo) : null,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function parseDate(value: string): Date {
  // Parse YYYY-MM-DD as UTC midnight
  const d = new Date(`${value}T00:00:00.000Z`);
  if (isNaN(d.getTime())) throw new Error('INVALID_DATE_RANGE');
  return d;
}

async function checkOverlap(
  doctorId: string,
  workSessionTypeId: string,
  effectiveFrom: Date,
  effectiveTo: Date | null,
  excludeId?: string,
): Promise<void> {
  // Fetch all existing rates for the same (doctor, sessionType) pair, excluding the current record
  const existing = await prisma.doctorSessionRate.findMany({
    where: {
      doctorId,
      workSessionTypeId,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true, effectiveFrom: true, effectiveTo: true },
  });

  const newTo = effectiveTo ?? MAX_DATE;

  for (const row of existing) {
    const rowTo = row.effectiveTo ?? MAX_DATE;
    // Two ranges overlap if: row.from <= newTo AND rowTo >= newFrom
    const overlaps = row.effectiveFrom <= newTo && rowTo >= effectiveFrom;
    if (overlaps) throw new Error('RATE_OVERLAP');
  }
}

async function assertDoctorActive(doctorId: string): Promise<void> {
  const doctor = await prisma.doctor.findUnique({ where: { id: doctorId } });
  if (!doctor || !doctor.active) throw new Error('DOCTOR_NOT_FOUND');
}

async function assertSessionTypeActive(workSessionTypeId: string): Promise<void> {
  const type = await prisma.workSessionType.findUnique({ where: { id: workSessionTypeId } });
  if (!type || !type.active) throw new Error('SESSION_TYPE_NOT_FOUND');
}

export async function listRates(doctorId: string): Promise<DoctorSessionRateResponse[]> {
  const rows = await prisma.doctorSessionRate.findMany({
    where: { doctorId },
    include: includeRelations,
    orderBy: [{ workSessionTypeId: 'asc' }, { effectiveFrom: 'desc' }],
  });
  return rows.map(toResponse);
}

export async function createRate(input: CreateRateInput): Promise<DoctorSessionRateResponse> {
  await assertDoctorActive(input.doctorId);
  await assertSessionTypeActive(input.workSessionTypeId);

  const amount = parseAmount(input.amount, { allowZero: false });
  const effectiveFrom = parseDate(input.effectiveFrom);
  const effectiveTo = input.effectiveTo ? parseDate(input.effectiveTo) : null;

  if (effectiveTo && effectiveTo < effectiveFrom) throw new Error('INVALID_DATE_RANGE');

  await checkOverlap(input.doctorId, input.workSessionTypeId, effectiveFrom, effectiveTo);

  const row = await prisma.doctorSessionRate.create({
    data: {
      doctorId: input.doctorId,
      workSessionTypeId: input.workSessionTypeId,
      amount,
      effectiveFrom,
      effectiveTo,
      note: input.note?.trim() || null,
    },
    include: includeRelations,
  });
  return toResponse(row);
}

export async function updateRate(id: string, input: UpdateRateInput): Promise<DoctorSessionRateResponse> {
  const existing = await prisma.doctorSessionRate.findUnique({
    where: { id },
    include: includeRelations,
  });
  if (!existing) throw new Error('RATE_NOT_FOUND');

  const amount = input.amount !== undefined ? parseAmount(input.amount, { allowZero: false }) : existing.amount;
  const effectiveFrom = input.effectiveFrom !== undefined ? parseDate(input.effectiveFrom) : existing.effectiveFrom;
  const effectiveTo =
    input.effectiveTo !== undefined
      ? input.effectiveTo
        ? parseDate(input.effectiveTo)
        : null
      : existing.effectiveTo;
  const note = input.note !== undefined ? input.note?.trim() || null : existing.note;

  if (effectiveTo && effectiveTo < effectiveFrom) throw new Error('INVALID_DATE_RANGE');

  // Re-validate overlap after the proposed change
  await checkOverlap(existing.doctorId, existing.workSessionTypeId, effectiveFrom, effectiveTo, id);

  const row = await prisma.doctorSessionRate.update({
    where: { id },
    data: { amount, effectiveFrom, effectiveTo, note },
    include: includeRelations,
  });
  return toResponse(row);
}

export async function deleteRate(id: string): Promise<void> {
  const existing = await prisma.doctorSessionRate.findUnique({ where: { id } });
  if (!existing) throw new Error('RATE_NOT_FOUND');
  await prisma.doctorSessionRate.delete({ where: { id } });
}
