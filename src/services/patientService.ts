import { prisma } from '../prisma';
import { CreatePatientRequest, PatientResponse } from '../types/patient.types';

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
    datestamp: patient.datestamp.toISOString(),
    nationalId: patient.nationalId,
    titlePrefix: patient.titlePrefix,
    firstName: patient.firstName,
    lastName: patient.lastName,
    dateOfBirth: patient.dateOfBirth.toISOString(),
    gender: patient.gender,
    cardNo: patient.cardNo,
    address: patient.address,
    photoBase64: patient.photoBase64,
    age: computeAge(patient.dateOfBirth),
    createdAt: patient.createdAt.toISOString(),
    updatedAt: patient.updatedAt.toISOString(),
  };
}

/**
 * Create a new patient record.
 * Enforces uniqueness on nationalId.
 */
export async function createPatient(data: CreatePatientRequest): Promise<PatientResponse> {
  // Check for duplicate nationalId
  const existing = await prisma.patient.findUnique({
    where: { nationalId: data.nationalId },
  });

  if (existing) {
    throw new Error('DUPLICATE_NATIONAL_ID');
  }

  // Parse dateOfBirth string to Date object
  const dateOfBirth = new Date(data.dateOfBirth);

  // Create the patient
  const patient = await prisma.patient.create({
    data: {
      datestamp: new Date(),
      nationalId: data.nationalId,
      titlePrefix: data.titlePrefix,
      firstName: data.firstName,
      lastName: data.lastName,
      dateOfBirth,
      gender: data.gender,
      cardNo: data.cardNo,
      address: data.address,
      photoBase64: data.photoBase64,
    },
  });

  return formatPatientResponse(patient);
}
