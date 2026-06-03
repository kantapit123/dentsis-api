import { prisma } from '../prisma';
import { Prisma } from '@prisma/client';
import { decimalToNumber, parseAmount } from '../utils/money';

export interface IncomeGuaranteeResponse {
  id: string;
  doctorId: string;
  doctorName: string | null;
  dailyAmount: number | null;
  active: boolean;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CreateInput {
  doctorId: string;
  dailyAmount: number | string;
  note?: string | null;
}

interface UpdateInput {
  dailyAmount?: number | string;
  active?: boolean;
  note?: string | null;
}

type GuaranteeWithDoctor = Prisma.IncomeGuaranteeGetPayload<{
  include: { doctor: { select: { name: true } } };
}>;

const includeDoctor = { doctor: { select: { name: true } } } as const;

function toResponse(g: GuaranteeWithDoctor): IncomeGuaranteeResponse {
  return {
    id: g.id,
    doctorId: g.doctorId,
    doctorName: g.doctor?.name ?? null,
    dailyAmount: decimalToNumber(g.dailyAmount),
    active: g.active,
    note: g.note,
    createdAt: g.createdAt.toISOString(),
    updatedAt: g.updatedAt.toISOString(),
  };
}

async function assertDoctorActive(doctorId: string): Promise<void> {
  const doctor = await prisma.doctor.findUnique({ where: { id: doctorId } });
  if (!doctor || !doctor.active) throw new Error('INACTIVE_DOCTOR');
}

// Guard against two active guarantees for the same doctor. The DB partial unique index
// (WHERE active = true) is the source of truth; this pre-check yields a clean error first.
async function assertNoDuplicateActiveGuarantee(doctorId: string, excludeId?: string): Promise<void> {
  const dup = await prisma.incomeGuarantee.findFirst({
    where: { doctorId, active: true, ...(excludeId ? { id: { not: excludeId } } : {}) },
  });
  if (dup) throw new Error('DUPLICATE_ACTIVE_GUARANTEE');
}

function mapPrismaError(e: unknown): never {
  if ((e as { code?: string }).code === 'P2002') throw new Error('DUPLICATE_ACTIVE_GUARANTEE');
  throw e;
}

export async function listIncomeGuarantees(doctorId?: string | null): Promise<IncomeGuaranteeResponse[]> {
  const rows = await prisma.incomeGuarantee.findMany({
    where: doctorId ? { doctorId } : undefined,
    include: includeDoctor,
    orderBy: [{ doctorId: 'asc' }, { createdAt: 'desc' }],
  });
  return rows.map(toResponse);
}

export async function createIncomeGuarantee(data: CreateInput): Promise<IncomeGuaranteeResponse> {
  const dailyAmount = parseAmount(data.dailyAmount, { allowZero: false });
  await assertDoctorActive(data.doctorId);
  await assertNoDuplicateActiveGuarantee(data.doctorId);

  try {
    const row = await prisma.incomeGuarantee.create({
      data: { doctorId: data.doctorId, dailyAmount, note: data.note?.trim() || null },
      include: includeDoctor,
    });
    return toResponse(row);
  } catch (e: unknown) {
    mapPrismaError(e);
  }
}

export async function updateIncomeGuarantee(id: string, data: UpdateInput): Promise<IncomeGuaranteeResponse> {
  const existing = await prisma.incomeGuarantee.findUnique({ where: { id } });
  if (!existing) throw new Error('GUARANTEE_NOT_FOUND');

  const dailyAmount =
    data.dailyAmount !== undefined ? parseAmount(data.dailyAmount, { allowZero: false }) : existing.dailyAmount;
  const active = data.active !== undefined ? data.active : existing.active;
  const note = data.note !== undefined ? data.note?.trim() || null : existing.note;

  // Only an active guarantee occupies the unique slot.
  if (active) await assertNoDuplicateActiveGuarantee(existing.doctorId, id);

  try {
    const row = await prisma.incomeGuarantee.update({
      where: { id },
      data: { dailyAmount, active, note },
      include: includeDoctor,
    });
    return toResponse(row);
  } catch (e: unknown) {
    mapPrismaError(e);
  }
}

export async function softDeleteIncomeGuarantee(id: string): Promise<void> {
  const existing = await prisma.incomeGuarantee.findUnique({ where: { id } });
  if (!existing) throw new Error('GUARANTEE_NOT_FOUND');
  await prisma.incomeGuarantee.update({ where: { id }, data: { active: false } });
}
