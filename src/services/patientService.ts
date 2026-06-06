import { prisma } from '../prisma';
import { CreatePatientRequest, UpdatePatientRequest, PatientResponse } from '../types/patient.types';

/**
 * Compute age in full years from date of birth to today.
 * Accounts for whether the birthday has passed this year.
 */
export function computeAge(dateOfBirth: Date): number {
  const today = new Date();
  let age = today.getFullYear() - dateOfBirth.getFullYear();

  // Adjust if birthday hasn't occurred this year yet
  const currentYearBirthday = new Date(today.getFullYear(), dateOfBirth.getMonth(), dateOfBirth.getDate());
  if (today < currentYearBirthday) {
    age -= 1;
  }

  return age;
}

/**
 * Format a Prisma patient record into a PatientResponse.
 * Converts DateTime fields to ISO strings and appends computed age.
 */
export function formatPatientResponse(patient: any): PatientResponse {
  return {
    id: patient.id,
    dn: patient.dn,
    datestamp: patient.datestamp.toISOString(),
    nationalId: patient.nationalId,
    titlePrefix: patient.titlePrefix,
    firstName: patient.firstName,
    lastName: patient.lastName,
    dateOfBirth: patient.dateOfBirth.toISOString(),
    gender: patient.gender,
    cardNo: patient.cardNo,
    address: patient.address,
    note: patient.note,
    photoBase64: patient.photoBase64,
    age: computeAge(patient.dateOfBirth),
    createdAt: patient.createdAt.toISOString(),
    updatedAt: patient.updatedAt.toISOString(),
  };
}

/**
 * Create a new patient record.
 * Enforces uniqueness on both `dn` and `nationalId`.
 */
export async function createPatient(data: CreatePatientRequest): Promise<PatientResponse> {
  const existing = await prisma.patient.findFirst({
    where: { OR: [{ dn: data.dn }, { nationalId: data.nationalId }] },
    select: { dn: true, nationalId: true },
  });
  if (existing) {
    if (existing.dn === data.dn) throw new Error('DUPLICATE_DN');
    throw new Error('DUPLICATE_NATIONAL_ID');
  }

  const dateOfBirth = new Date(data.dateOfBirth);

  const patient = await prisma.patient.create({
    data: {
      dn: data.dn,
      datestamp: new Date(),
      nationalId: data.nationalId,
      titlePrefix: data.titlePrefix ?? null,
      firstName: data.firstName,
      lastName: data.lastName,
      dateOfBirth,
      gender: data.gender,
      cardNo: data.cardNo,
      address: data.address,
      note: data.note,
      photoBase64: data.photoBase64,
    },
  });

  return formatPatientResponse(patient);
}

export interface ListPatientsParams {
  search?: string;
  limit?: number;
}

/**
 * List patients, optionally filtered by a free-text search over
 * dn / firstName / lastName / nationalId (case-insensitive). Newest first.
 */
export async function listPatients(params: ListPatientsParams = {}): Promise<PatientResponse[]> {
  const search = params.search?.trim();
  const take = Math.min(Math.max(params.limit ?? 50, 1), 200);

  const where = search
    ? {
        OR: [
          { dn: { contains: search, mode: 'insensitive' as const } },
          { firstName: { contains: search, mode: 'insensitive' as const } },
          { lastName: { contains: search, mode: 'insensitive' as const } },
          { nationalId: { contains: search, mode: 'insensitive' as const } },
        ],
      }
    : {};

  const patients = await prisma.patient.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take,
  });
  return patients.map(formatPatientResponse);
}

export async function getPatientById(id: string): Promise<PatientResponse> {
  const patient = await prisma.patient.findUnique({ where: { id } });
  if (!patient) throw new Error('PATIENT_NOT_FOUND');
  return formatPatientResponse(patient);
}

export async function getPatientByDn(dn: string): Promise<PatientResponse> {
  const patient = await prisma.patient.findUnique({ where: { dn } });
  if (!patient) throw new Error('PATIENT_NOT_FOUND');
  return formatPatientResponse(patient);
}

/**
 * Update a patient. Re-checks uniqueness when `dn` or `nationalId` change.
 */
export async function updatePatient(id: string, data: UpdatePatientRequest): Promise<PatientResponse> {
  const existing = await prisma.patient.findUnique({ where: { id } });
  if (!existing) throw new Error('PATIENT_NOT_FOUND');

  const dnChanged = data.dn !== undefined && data.dn !== existing.dn;
  const nationalIdChanged = data.nationalId !== undefined && data.nationalId !== existing.nationalId;
  if (dnChanged || nationalIdChanged) {
    const clash = await prisma.patient.findFirst({
      where: {
        id: { not: id },
        OR: [
          ...(dnChanged ? [{ dn: data.dn }] : []),
          ...(nationalIdChanged ? [{ nationalId: data.nationalId }] : []),
        ],
      },
      select: { dn: true, nationalId: true },
    });
    if (clash) {
      if (dnChanged && clash.dn === data.dn) throw new Error('DUPLICATE_DN');
      throw new Error('DUPLICATE_NATIONAL_ID');
    }
  }

  const patient = await prisma.patient.update({
    where: { id },
    data: {
      ...(data.dn !== undefined ? { dn: data.dn } : {}),
      ...(data.nationalId !== undefined ? { nationalId: data.nationalId } : {}),
      ...(data.titlePrefix !== undefined ? { titlePrefix: data.titlePrefix } : {}),
      ...(data.firstName !== undefined ? { firstName: data.firstName } : {}),
      ...(data.lastName !== undefined ? { lastName: data.lastName } : {}),
      ...(data.dateOfBirth !== undefined ? { dateOfBirth: new Date(data.dateOfBirth) } : {}),
      ...(data.gender !== undefined ? { gender: data.gender } : {}),
      ...(data.cardNo !== undefined ? { cardNo: data.cardNo } : {}),
      ...(data.address !== undefined ? { address: data.address } : {}),
      ...(data.note !== undefined ? { note: data.note } : {}),
      ...(data.photoBase64 !== undefined ? { photoBase64: data.photoBase64 } : {}),
    },
  });
  return formatPatientResponse(patient);
}

/**
 * Hard-delete a patient. Linked daily_records keep their dn/patientName snapshot
 * (FK is ON DELETE SET NULL), so the income audit trail is preserved.
 */
export async function deletePatient(id: string): Promise<void> {
  const existing = await prisma.patient.findUnique({ where: { id } });
  if (!existing) throw new Error('PATIENT_NOT_FOUND');
  await prisma.patient.delete({ where: { id } });
}
