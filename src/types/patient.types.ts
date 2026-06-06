export type PatientGender = 'MALE' | 'FEMALE' | 'OTHER';
export type PatientTitlePrefix = 'MISTER' | 'MRS' | 'MISS' | 'YOUNG_BOY' | 'YOUNG_GIRL' | 'OTHER';

export interface CreatePatientRequest {
  dn: string; // clinic patient number (DN), e.g. "6910001" — required
  nationalId: string; // Thai 13-digit national ID or passport number
  titlePrefix?: PatientTitlePrefix;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: PatientGender;
  cardNo?: string;
  address?: string;
  note?: string;
  photoBase64?: string;
}

export interface UpdatePatientRequest {
  dn?: string;
  nationalId?: string;
  titlePrefix?: PatientTitlePrefix | null;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  gender?: PatientGender;
  cardNo?: string | null;
  address?: string | null;
  note?: string | null;
  photoBase64?: string | null;
}

export interface PatientResponse {
  id: string;
  dn: string | null;
  datestamp: string;
  nationalId: string;
  titlePrefix: PatientTitlePrefix | null;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: PatientGender;
  cardNo: string | null;
  address: string | null;
  note: string | null;
  photoBase64: string | null;
  age: number;
  createdAt: string;
  updatedAt: string;
}
