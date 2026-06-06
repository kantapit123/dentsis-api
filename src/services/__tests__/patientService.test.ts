import {
  createPatient,
  computeAge,
  formatPatientResponse,
  listPatients,
  getPatientByDn,
} from '../patientService';
import { CreatePatientRequest } from '../../types/patient.types';
import { prisma } from '../../prisma';

// Mock Prisma client
jest.mock('../../prisma', () => ({
  prisma: {
    patient: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

// Pin "today" so age assertions are deterministic regardless of the real date.
beforeAll(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 3, 6, 12, 0, 0)); // 2026-04-06 (local), month is 0-indexed
});
afterAll(() => {
  jest.useRealTimers();
});

const baseMockPatient = {
  id: 'patient-1',
  dn: '6910001',
  datestamp: new Date('2026-04-06'),
  nationalId: '1234567890123',
  titlePrefix: 'MISTER',
  firstName: 'John',
  lastName: 'Doe',
  dateOfBirth: new Date('1990-05-15'),
  gender: 'MALE',
  cardNo: 'CARD001',
  address: '123 Main St',
  note: null,
  photoBase64: null,
  createdAt: new Date('2026-04-06T10:30:00Z'),
  updatedAt: new Date('2026-04-06T10:30:00Z'),
};

describe('patientService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createPatient', () => {
    const requestData: CreatePatientRequest = {
      dn: '6910001',
      nationalId: '1234567890123',
      titlePrefix: 'MISTER',
      firstName: 'John',
      lastName: 'Doe',
      dateOfBirth: '1990-05-15',
      gender: 'MALE',
      cardNo: 'CARD001',
      address: '123 Main St',
    };

    it('creates and returns a PatientResponse with dn and computed age', async () => {
      (prisma.patient.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.patient.create as jest.Mock).mockResolvedValue(baseMockPatient);

      const result = await createPatient(requestData);

      expect(result.id).toBe('patient-1');
      expect(result.dn).toBe('6910001');
      expect(result.firstName).toBe('John');
      expect(result.age).toBe(35); // born 1990-05-15, today 2026-04-06 → birthday not passed
      expect(prisma.patient.create).toHaveBeenCalled();
    });

    it('throws DUPLICATE_NATIONAL_ID when nationalId already exists', async () => {
      (prisma.patient.findFirst as jest.Mock).mockResolvedValue({ dn: 'OTHER', nationalId: '1234567890123' });

      await expect(createPatient(requestData)).rejects.toThrow('DUPLICATE_NATIONAL_ID');
      expect(prisma.patient.create).not.toHaveBeenCalled();
    });

    it('throws DUPLICATE_DN when dn already exists', async () => {
      (prisma.patient.findFirst as jest.Mock).mockResolvedValue({ dn: '6910001', nationalId: 'other' });

      await expect(createPatient(requestData)).rejects.toThrow('DUPLICATE_DN');
      expect(prisma.patient.create).not.toHaveBeenCalled();
    });
  });

  describe('listPatients', () => {
    it('maps results and queries with a search filter', async () => {
      (prisma.patient.findMany as jest.Mock).mockResolvedValue([baseMockPatient]);

      const result = await listPatients({ search: 'john' });

      expect(result).toHaveLength(1);
      expect(result[0].dn).toBe('6910001');
      expect(prisma.patient.findMany).toHaveBeenCalled();
    });
  });

  describe('getPatientByDn', () => {
    it('throws PATIENT_NOT_FOUND when no patient matches', async () => {
      (prisma.patient.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(getPatientByDn('nope')).rejects.toThrow('PATIENT_NOT_FOUND');
    });
  });

  describe('computeAge', () => {
    it('returns age - 1 when birthday has not passed yet this year', () => {
      expect(computeAge(new Date('2000-05-15'))).toBe(25);
    });

    it('returns full year difference when birthday has passed this year', () => {
      expect(computeAge(new Date('1990-03-10'))).toBe(36);
    });

    it('returns full year difference when birthday is today', () => {
      expect(computeAge(new Date('1990-04-06'))).toBe(36);
    });
  });

  describe('formatPatientResponse', () => {
    it('converts DateTime fields to ISO strings and includes dn/note/age', () => {
      const result = formatPatientResponse(baseMockPatient);

      expect(typeof result.datestamp).toBe('string');
      expect(typeof result.dateOfBirth).toBe('string');
      expect(result.dn).toBe('6910001');
      expect(result.note).toBeNull();
      expect(result.age).toBe(35);
    });
  });
});
