export type PatientGender = 'MALE' | 'FEMALE' | 'OTHER';
export type PatientTitlePrefix = 'MISTER' | 'MRS' | 'MISS' | 'YOUNG_BOY' | 'YOUNG_GIRL' | 'OTHER';

export interface CreatePatientRequest {
  nationalId: string;
  titlePrefix: PatientTitlePrefix;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: PatientGender;
  cardNo?: string;
  address?: string;
  photoBase64?: string;
}

export interface PatientResponse {
  id: string;
  datestamp: string;
  nationalId: string;
  titlePrefix: PatientTitlePrefix;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: PatientGender;
  cardNo: string | null;
  address: string | null;
  photoBase64: string | null;
  age: number;
  createdAt: string;
  updatedAt: string;
}
