import { prisma } from '../prisma';
import { Prisma, PaymentMethod, DfRule } from '@prisma/client';
import { Decimal, decimalToNumber, parseAmount } from '../utils/money';
import { parseRecordDate, isFutureDate, dayRangeUTC, recordDateKey } from '../utils/date';
import { calculateDf } from './dfCalculatorService';

const PAYMENT_METHODS: PaymentMethod[] = ['CASH', 'TRANSFER'];
const MAX_SEQUENCE_RETRIES = 5;

export interface DailyRecordResponse {
  id: string;
  recordDate: string; // YYYY-MM-DD
  sequenceNo: number;
  dn: string | null;
  patientId: string | null;
  patientName: string;
  doctorId: string;
  doctorName: string | null;
  treatmentNote: string;
  treatmentTypeIds: string[];
  treatmentFee: number | null;
  medicineFee: number | null;
  medicineNote: string | null;
  totalAmount: number | null;
  paymentMethod: PaymentMethod;
  dfAmount: number | null;
  dfRuleSnapshot: Prisma.JsonValue | null;
  notes: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDailyRecordInput {
  recordDate: string;
  patientId: string; // required: the record snapshots dn + patientName from this patient
  doctorId: string;
  treatmentNote: string;
  treatmentTypeIds?: string[];
  treatmentFee: number | string;
  medicineFee?: number | string;
  medicineNote?: string | null;
  paymentMethod: PaymentMethod;
  notes?: string | null;
}

export interface UpdateDailyRecordInput {
  patientId?: string | null;
  doctorId?: string;
  treatmentNote?: string;
  treatmentTypeIds?: string[];
  treatmentFee?: number | string;
  medicineFee?: number | string;
  medicineNote?: string | null;
  paymentMethod?: PaymentMethod;
  notes?: string | null;
}

export interface ListFilter {
  doctorId?: string | null;
  date?: string;
  from?: string;
  to?: string;
}

type RecordWithDoctor = Prisma.DailyRecordGetPayload<{ include: { doctor: { select: { name: true } } } }>;

const includeDoctor = { doctor: { select: { name: true } } } as const;

function toResponse(r: RecordWithDoctor): DailyRecordResponse {
  return {
    id: r.id,
    recordDate: recordDateKey(r.recordDate),
    sequenceNo: r.sequenceNo,
    dn: r.dn,
    patientId: r.patientId,
    patientName: r.patientName,
    doctorId: r.doctorId,
    doctorName: r.doctor?.name ?? null,
    treatmentNote: r.treatmentNote,
    treatmentTypeIds: r.treatmentTypeIds,
    treatmentFee: decimalToNumber(r.treatmentFee),
    medicineFee: decimalToNumber(r.medicineFee),
    medicineNote: r.medicineNote,
    totalAmount: decimalToNumber(r.totalAmount),
    paymentMethod: r.paymentMethod,
    dfAmount: decimalToNumber(r.dfAmount),
    dfRuleSnapshot: r.dfRuleSnapshot,
    notes: r.notes,
    createdById: r.createdById,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function validatePaymentMethod(pm: unknown): PaymentMethod {
  if (!PAYMENT_METHODS.includes(pm as PaymentMethod)) throw new Error('INVALID_PAYMENT_METHOD');
  return pm as PaymentMethod;
}

async function assertDoctorActive(doctorId: string): Promise<void> {
  const doctor = await prisma.doctor.findUnique({ where: { id: doctorId } });
  if (!doctor || !doctor.active) throw new Error('INACTIVE_DOCTOR');
}

// Validates every selected treatment type exists and is active. Empty list = valid (optional field).
async function assertTreatmentTypesActive(treatmentTypeIds: string[]): Promise<void> {
  if (treatmentTypeIds.length === 0) return;
  const found = await prisma.treatmentType.findMany({ where: { id: { in: treatmentTypeIds } } });
  const activeIds = new Set(found.filter((t) => t.active).map((t) => t.id));
  for (const id of treatmentTypeIds) {
    if (!activeIds.has(id)) throw new Error('INACTIVE_TREATMENT_TYPE');
  }
}

// Immutable point-in-time copy of the rule used, so editing the rule later never alters old records.
function buildRuleSnapshot(rule: DfRule | null): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (!rule) return Prisma.JsonNull;
  return {
    id: rule.id,
    doctorId: rule.doctorId,
    treatmentTypeId: rule.treatmentTypeId,
    dfType: rule.dfType,
    dfValue: rule.dfValue.toString(),
    dfBase: rule.dfBase,
    active: rule.active,
    capturedAt: new Date().toISOString(),
  };
}

export async function createDailyRecord(
  input: CreateDailyRecordInput,
  userId: string | null,
): Promise<DailyRecordResponse> {
  const recordDate = parseRecordDate(input.recordDate);
  if (isFutureDate(input.recordDate)) throw new Error('FUTURE_DATE');

  if (!input.patientId) throw new Error('INVALID_PATIENT');
  const patient = await prisma.patient.findUnique({
    where: { id: input.patientId },
    select: { id: true, dn: true, firstName: true, lastName: true },
  });
  if (!patient) throw new Error('INVALID_PATIENT');
  const patientName = `${patient.firstName} ${patient.lastName}`.trim();

  const treatmentNote = input.treatmentNote?.trim();
  if (!treatmentNote) throw new Error('INVALID_TREATMENT_NOTE');

  const paymentMethod = validatePaymentMethod(input.paymentMethod);
  const treatmentTypeIds = input.treatmentTypeIds ?? [];

  await assertDoctorActive(input.doctorId);
  await assertTreatmentTypesActive(treatmentTypeIds);

  const treatmentFee = parseAmount(input.treatmentFee);
  const medicineFee = parseAmount(input.medicineFee ?? 0);
  const totalAmount = treatmentFee.plus(medicineFee);

  // DF uses the doctor-default rule only; treatment types are informational tags (not a DF key).
  const { dfAmount, ruleUsed } = await calculateDf(input.doctorId, null, treatmentFee, medicineFee);
  const dfRuleSnapshot = buildRuleSnapshot(ruleUsed);

  const baseData = {
    recordDate,
    dn: patient.dn,
    patientId: patient.id,
    patientName,
    doctorId: input.doctorId,
    treatmentNote,
    treatmentTypeIds,
    treatmentFee,
    medicineFee,
    medicineNote: input.medicineNote ?? null,
    totalAmount,
    paymentMethod,
    dfAmount,
    dfRuleSnapshot,
    notes: input.notes ?? null,
    createdById: userId,
  };

  // Per-day sequenceNo = MAX+1. Concurrent same-day inserts can collide on the
  // (recordDate, sequenceNo) unique → retry a few times on P2002.
  for (let attempt = 1; attempt <= MAX_SEQUENCE_RETRIES; attempt++) {
    try {
      const record = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const agg = await tx.dailyRecord.aggregate({
          where: { recordDate },
          _max: { sequenceNo: true },
        });
        const sequenceNo = (agg._max.sequenceNo ?? 0) + 1;
        return tx.dailyRecord.create({
          data: { ...baseData, sequenceNo },
          include: includeDoctor,
        });
      });
      return toResponse(record);
    } catch (e: unknown) {
      if ((e as { code?: string }).code === 'P2002' && attempt < MAX_SEQUENCE_RETRIES) continue;
      throw e;
    }
  }
  throw new Error('SEQUENCE_CONFLICT');
}

export async function updateDailyRecord(
  id: string,
  input: UpdateDailyRecordInput,
): Promise<DailyRecordResponse> {
  const existing = await prisma.dailyRecord.findUnique({ where: { id } });
  if (!existing) throw new Error('DAILY_RECORD_NOT_FOUND');

  // recordDate and sequenceNo are immutable after creation (move = delete + recreate).
  const doctorId = input.doctorId ?? existing.doctorId;
  const treatmentTypeIds =
    input.treatmentTypeIds !== undefined ? input.treatmentTypeIds ?? [] : existing.treatmentTypeIds;

  if (input.doctorId !== undefined) await assertDoctorActive(doctorId);
  if (input.treatmentTypeIds !== undefined) await assertTreatmentTypesActive(treatmentTypeIds);

  const patientId = input.patientId !== undefined ? input.patientId : existing.patientId;
  if (!patientId) throw new Error('INVALID_PATIENT');
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { id: true, dn: true, firstName: true, lastName: true },
  });
  if (!patient) throw new Error('INVALID_PATIENT');
  const patientName = `${patient.firstName} ${patient.lastName}`.trim();

  const treatmentNote =
    input.treatmentNote !== undefined ? input.treatmentNote.trim() : existing.treatmentNote;
  if (!treatmentNote) throw new Error('INVALID_TREATMENT_NOTE');

  const paymentMethod =
    input.paymentMethod !== undefined ? validatePaymentMethod(input.paymentMethod) : existing.paymentMethod;

  const treatmentFee =
    input.treatmentFee !== undefined ? parseAmount(input.treatmentFee) : new Decimal(existing.treatmentFee);
  const medicineFee =
    input.medicineFee !== undefined ? parseAmount(input.medicineFee) : new Decimal(existing.medicineFee);
  const totalAmount = treatmentFee.plus(medicineFee);

  // DF uses the doctor-default rule only; treatment types are informational tags (not a DF key).
  const { dfAmount, ruleUsed } = await calculateDf(doctorId, null, treatmentFee, medicineFee);
  const dfRuleSnapshot = buildRuleSnapshot(ruleUsed);

  const record = await prisma.dailyRecord.update({
    where: { id },
    data: {
      dn: patient.dn,
      patientId: patient.id,
      patientName,
      doctorId,
      treatmentNote,
      treatmentTypeIds,
      treatmentFee,
      medicineFee,
      medicineNote: input.medicineNote !== undefined ? input.medicineNote : existing.medicineNote,
      totalAmount,
      paymentMethod,
      dfAmount,
      dfRuleSnapshot,
      notes: input.notes !== undefined ? input.notes : existing.notes,
    },
    include: includeDoctor,
  });
  return toResponse(record);
}

function buildDateWhere(filter: ListFilter): Prisma.DailyRecordWhereInput {
  const where: Prisma.DailyRecordWhereInput = {};
  if (filter.doctorId) where.doctorId = filter.doctorId;

  if (filter.date) {
    const { start, end } = dayRangeUTC(filter.date);
    where.recordDate = { gte: start, lt: end };
  } else if (filter.from || filter.to) {
    const range: Prisma.DateTimeFilter = {};
    if (filter.from) range.gte = dayRangeUTC(filter.from).start;
    if (filter.to) range.lt = dayRangeUTC(filter.to).end; // inclusive end day
    where.recordDate = range;
  }
  return where;
}

export async function listDailyRecords(filter: ListFilter): Promise<DailyRecordResponse[]> {
  const records = await prisma.dailyRecord.findMany({
    where: buildDateWhere(filter),
    include: includeDoctor,
    orderBy: [{ recordDate: 'desc' }, { sequenceNo: 'asc' }],
  });
  return records.map(toResponse);
}

export async function getDailyRecord(id: string): Promise<DailyRecordResponse> {
  const record = await prisma.dailyRecord.findUnique({ where: { id }, include: includeDoctor });
  if (!record) throw new Error('DAILY_RECORD_NOT_FOUND');
  return toResponse(record);
}

export async function deleteDailyRecord(id: string): Promise<void> {
  const existing = await prisma.dailyRecord.findUnique({ where: { id } });
  if (!existing) throw new Error('DAILY_RECORD_NOT_FOUND');
  await prisma.dailyRecord.delete({ where: { id } });
}
