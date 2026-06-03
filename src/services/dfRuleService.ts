import { prisma } from '../prisma';
import { Prisma, DfType, DfBase } from '@prisma/client';
import { Decimal, decimalToNumber, round2 } from '../utils/money';
import { calculateDf } from './dfCalculatorService';

const DF_TYPES: DfType[] = ['PERCENTAGE', 'FIXED'];
const DF_BASES: DfBase[] = ['TREATMENT_FEE', 'TOTAL_AMOUNT'];

export interface DfRuleResponse {
  id: string;
  doctorId: string;
  doctorName: string | null;
  treatmentTypeId: string | null;
  treatmentTypeName: string | null;
  dfType: DfType;
  dfValue: number | null;
  dfBase: DfBase;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CreateInput {
  doctorId: string;
  treatmentTypeId?: string | null;
  dfType: DfType;
  dfValue: number | string;
  dfBase?: DfBase;
}

interface UpdateInput {
  treatmentTypeId?: string | null;
  dfType?: DfType;
  dfValue?: number | string;
  dfBase?: DfBase;
  active?: boolean;
}

type RuleWithRelations = Prisma.DfRuleGetPayload<{
  include: { doctor: { select: { name: true } }; treatmentType: { select: { name: true } } };
}>;

const includeRelations = {
  doctor: { select: { name: true } },
  treatmentType: { select: { name: true } },
} as const;

function toResponse(r: RuleWithRelations): DfRuleResponse {
  return {
    id: r.id,
    doctorId: r.doctorId,
    doctorName: r.doctor?.name ?? null,
    treatmentTypeId: r.treatmentTypeId,
    treatmentTypeName: r.treatmentType?.name ?? null,
    dfType: r.dfType,
    dfValue: decimalToNumber(r.dfValue),
    dfBase: r.dfBase,
    active: r.active,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function validateDfType(dfType: unknown): DfType {
  if (!DF_TYPES.includes(dfType as DfType)) throw new Error('INVALID_DF_TYPE');
  return dfType as DfType;
}

function validateDfBase(dfBase: unknown): DfBase {
  if (dfBase === undefined || dfBase === null) return 'TREATMENT_FEE';
  if (!DF_BASES.includes(dfBase as DfBase)) throw new Error('INVALID_DF_BASE');
  return dfBase as DfBase;
}

// PERCENTAGE → 0..100, FIXED → >= 0. Returns a 2dp Decimal.
function validateDfValue(dfType: DfType, dfValue: unknown): Prisma.Decimal {
  const num = typeof dfValue === 'number' ? dfValue : Number(dfValue);
  if (dfValue === null || dfValue === undefined || dfValue === '' || !Number.isFinite(num)) {
    throw new Error('INVALID_DF_VALUE');
  }
  if (num < 0) throw new Error('INVALID_DF_VALUE');
  if (dfType === 'PERCENTAGE' && num > 100) throw new Error('INVALID_DF_VALUE');
  return round2(new Decimal(num));
}

async function assertDoctorActive(doctorId: string): Promise<void> {
  const doctor = await prisma.doctor.findUnique({ where: { id: doctorId } });
  if (!doctor || !doctor.active) throw new Error('INACTIVE_DOCTOR');
}

async function assertTreatmentTypeActive(treatmentTypeId: string | null | undefined): Promise<void> {
  if (!treatmentTypeId) return;
  const tt = await prisma.treatmentType.findUnique({ where: { id: treatmentTypeId } });
  if (!tt || !tt.active) throw new Error('INACTIVE_TREATMENT_TYPE');
}

// Guard against two active rules for the same (doctor, treatmentType). The DB partial unique
// index is the source of truth; this pre-check just yields a clean error before relying on P2002.
async function assertNoDuplicateActiveRule(
  doctorId: string,
  treatmentTypeId: string | null,
  excludeId?: string,
): Promise<void> {
  const dup = await prisma.dfRule.findFirst({
    where: {
      doctorId,
      treatmentTypeId: treatmentTypeId ?? null,
      active: true,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });
  if (dup) throw new Error('DUPLICATE_ACTIVE_RULE');
}

function mapPrismaError(e: unknown): never {
  if ((e as { code?: string }).code === 'P2002') throw new Error('DUPLICATE_ACTIVE_RULE');
  throw e;
}

export async function listDfRules(doctorId?: string | null): Promise<DfRuleResponse[]> {
  const rules = await prisma.dfRule.findMany({
    where: doctorId ? { doctorId } : undefined,
    include: includeRelations,
    orderBy: [{ doctorId: 'asc' }, { treatmentTypeId: 'asc' }],
  });
  return rules.map(toResponse);
}

export async function createDfRule(data: CreateInput): Promise<DfRuleResponse> {
  const dfType = validateDfType(data.dfType);
  const dfBase = validateDfBase(data.dfBase);
  const dfValue = validateDfValue(dfType, data.dfValue);
  const treatmentTypeId = data.treatmentTypeId ?? null;

  await assertDoctorActive(data.doctorId);
  await assertTreatmentTypeActive(treatmentTypeId);
  await assertNoDuplicateActiveRule(data.doctorId, treatmentTypeId);

  try {
    const rule = await prisma.dfRule.create({
      data: { doctorId: data.doctorId, treatmentTypeId, dfType, dfValue, dfBase },
      include: includeRelations,
    });
    return toResponse(rule);
  } catch (e: unknown) {
    mapPrismaError(e);
  }
}

export async function updateDfRule(id: string, data: UpdateInput): Promise<DfRuleResponse> {
  const existing = await prisma.dfRule.findUnique({ where: { id } });
  if (!existing) throw new Error('DF_RULE_NOT_FOUND');

  const dfType = data.dfType !== undefined ? validateDfType(data.dfType) : existing.dfType;
  const dfBase = data.dfBase !== undefined ? validateDfBase(data.dfBase) : existing.dfBase;
  const dfValue =
    data.dfValue !== undefined ? validateDfValue(dfType, data.dfValue) : existing.dfValue;
  const treatmentTypeId =
    data.treatmentTypeId !== undefined ? data.treatmentTypeId ?? null : existing.treatmentTypeId;
  const active = data.active !== undefined ? data.active : existing.active;

  if (data.treatmentTypeId !== undefined) await assertTreatmentTypeActive(treatmentTypeId);

  // Only an active rule occupies the unique slot.
  if (active) await assertNoDuplicateActiveRule(existing.doctorId, treatmentTypeId, id);

  try {
    const rule = await prisma.dfRule.update({
      where: { id },
      data: { treatmentTypeId, dfType, dfValue, dfBase, active },
      include: includeRelations,
    });
    return toResponse(rule);
  } catch (e: unknown) {
    mapPrismaError(e);
  }
}

export async function softDeleteDfRule(id: string): Promise<void> {
  const existing = await prisma.dfRule.findUnique({ where: { id } });
  if (!existing) throw new Error('DF_RULE_NOT_FOUND');
  await prisma.dfRule.update({ where: { id }, data: { active: false } });
}

export interface PreviewInput {
  doctorId: string;
  treatmentTypeId?: string | null;
  treatmentFee: number | string;
  medicineFee?: number | string;
}

export async function previewDf(
  data: PreviewInput,
): Promise<{ dfAmount: number; dfRule: DfRuleResponse | null }> {
  await assertDoctorActive(data.doctorId);

  const treatmentFee = round2(new Decimal(Number(data.treatmentFee)));
  const medicineFee = round2(new Decimal(Number(data.medicineFee ?? 0)));
  if (treatmentFee.lessThan(0) || medicineFee.lessThan(0)) throw new Error('INVALID_AMOUNT');

  const { dfAmount, ruleUsed } = await calculateDf(
    data.doctorId,
    data.treatmentTypeId ?? null,
    treatmentFee,
    medicineFee,
  );

  let dfRule: DfRuleResponse | null = null;
  if (ruleUsed) {
    const full = await prisma.dfRule.findUnique({ where: { id: ruleUsed.id }, include: includeRelations });
    dfRule = full ? toResponse(full) : null;
  }

  return { dfAmount: dfAmount.toNumber(), dfRule };
}
