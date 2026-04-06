import { createPatient, computeAge, formatPatientResponse } from '../patientService';
import { CreatePatientRequest, PatientResponse } from '../../types/patient.types';
import { prisma } from '../../prisma';

// Mock Prisma client
jest.mock('../../prisma', () => ({
  prisma: {
    patient: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  },
}));

describe('patientService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createPatient with unique nationalId', () => {
    it('should create and return PatientResponse with correct age', async () => {
      const mockPatient = {
        id: 'patient-1',
        datestamp: new Date('2026-04-06'),
        nationalId: '1234567890123',
        titlePrefix: 'MISTER',
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: new Date('1990-05-15'),
        gender: 'MALE',
        cardNo: 'CARD001',
        address: '123 Main St',
        photoBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        createdAt: new Date('2026-04-06'),
        updatedAt: new Date('2026-04-06'),
      };

      const requestData: CreatePatientRequest = {
        nationalId: '1234567890123',
        titlePrefix: 'MISTER',
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: '1990-05-15',
        gender: 'MALE',
        cardNo: 'CARD001',
        address: '123 Main St',
        photoBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      };

      (prisma.patient.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.patient.create as jest.Mock).mockResolvedValue(mockPatient);

      const result = await createPatient(requestData);

      expect(result).toBeDefined();
      expect(result.id).toBe('patient-1');
      expect(result.nationalId).toBe('1234567890123');
      expect(result.firstName).toBe('John');
      expect(result.lastName).toBe('Doe');
      expect(result.age).toBe(35); // Born 1990-05-15, today 2026-04-06, birthday has not passed yet (May is after April)
      expect(result.createdAt).toBe('2026-04-06T00:00:00.000Z');
      expect(prisma.patient.findUnique).toHaveBeenCalledWith({
        where: { nationalId: '1234567890123' },
      });
      expect(prisma.patient.create).toHaveBeenCalled();
    });
  });

  describe('createPatient with duplicate nationalId', () => {
    it('should throw DUPLICATE_NATIONAL_ID error', async () => {
      const existingPatient = {
        id: 'patient-1',
        datestamp: new Date('2026-04-06'),
        nationalId: '1234567890123',
        titlePrefix: 'MISTER',
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: new Date('1990-05-15'),
        gender: 'MALE',
        cardNo: 'CARD001',
        address: '123 Main St',
        photoBase64: null,
        createdAt: new Date('2026-04-06'),
        updatedAt: new Date('2026-04-06'),
      };

      const requestData: CreatePatientRequest = {
        nationalId: '1234567890123',
        titlePrefix: 'MRS',
        firstName: 'Jane',
        lastName: 'Smith',
        dateOfBirth: '1992-03-20',
        gender: 'FEMALE',
      };

      (prisma.patient.findUnique as jest.Mock).mockResolvedValue(existingPatient);

      await expect(createPatient(requestData)).rejects.toThrow('DUPLICATE_NATIONAL_ID');
      expect(prisma.patient.create).not.toHaveBeenCalled();
    });
  });

  describe('computeAge', () => {
    it('should return age - 1 when birthday has not passed yet this year', () => {
      // Today is 2026-04-06, birthday is 2000-05-15
      // Birthday hasn't passed yet (May is after April), so age should be 25, not 26
      const dateOfBirth = new Date('2000-05-15');
      const age = computeAge(dateOfBirth);
      expect(age).toBe(25);
    });

    it('should return full year difference when birthday has passed this year', () => {
      // Today is 2026-04-06, birthday is 1990-03-10
      // Birthday has passed (March is before April), so age should be 36
      const dateOfBirth = new Date('1990-03-10');
      const age = computeAge(dateOfBirth);
      expect(age).toBe(36);
    });

    it('should return full year difference when birthday is today', () => {
      // Today is 2026-04-06, birthday is 1990-04-06
      // Birthday is today, so age should be 36 (full years difference)
      const dateOfBirth = new Date('1990-04-06');
      const age = computeAge(dateOfBirth);
      expect(age).toBe(36);
    });
  });

  describe('formatPatientResponse', () => {
    it('should convert DateTime fields to ISO strings and include computed age', () => {
      const mockPatient = {
        id: 'patient-1',
        datestamp: new Date('2026-04-06'),
        nationalId: '1234567890123',
        titlePrefix: 'MISTER',
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: new Date('1990-05-15'),
        gender: 'MALE',
        cardNo: 'CARD001',
        address: '123 Main St',
        photoBase64: 'data:image/png;base64,xxx',
        createdAt: new Date('2026-04-06T10:30:00Z'),
        updatedAt: new Date('2026-04-06T10:30:00Z'),
      };

      const result = formatPatientResponse(mockPatient);

      expect(result.id).toBe('patient-1');
      expect(typeof result.datestamp).toBe('string');
      expect(typeof result.dateOfBirth).toBe('string');
      expect(typeof result.createdAt).toBe('string');
      expect(typeof result.updatedAt).toBe('string');
      expect(result.age).toBe(35);
      expect(result.nationalId).toBe('1234567890123');
      expect(result.firstName).toBe('John');
    });
  });
});
