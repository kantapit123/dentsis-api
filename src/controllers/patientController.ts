import { Request, Response } from 'express';
import {
  createPatient,
  listPatients,
  getPatientById,
  getPatientByDn,
  updatePatient,
  deletePatient,
} from '../services/patientService';
import { CreatePatientRequest, UpdatePatientRequest } from '../types/patient.types';

const VALID_TITLE_PREFIXES = ['MISTER', 'MRS', 'MISS', 'YOUNG_BOY', 'YOUNG_GIRL', 'OTHER'];
const VALID_GENDERS = ['MALE', 'FEMALE', 'OTHER'];
// Accept a Thai 13-digit national ID OR a passport number (alphanumeric, 6-20 chars).
const NATIONAL_ID_REGEX = /^([0-9]{13}|[A-Za-z0-9]{6,20})$/;
const PHOTO_REGEX = /^data:image\//;

function handleDomainError(res: Response, msg: string): boolean {
  switch (msg) {
    case 'DUPLICATE_NATIONAL_ID':
      res.status(409).json({ error: 'DUPLICATE_NATIONAL_ID', message: 'A patient with this national ID already exists' });
      return true;
    case 'DUPLICATE_DN':
      res.status(409).json({ error: 'DUPLICATE_DN', message: 'A patient with this DN already exists' });
      return true;
    case 'PATIENT_NOT_FOUND':
      res.status(404).json({ error: 'PATIENT_NOT_FOUND', message: 'Patient not found' });
      return true;
    default:
      return false;
  }
}

export async function createPatientHandler(req: Request, res: Response): Promise<void> {
  try {
    const { dn, nationalId, titlePrefix, firstName, lastName, dateOfBirth, gender, cardNo, address, note, photoBase64 } =
      req.body;

    const required: Record<string, unknown> = { dn, nationalId, firstName, lastName, dateOfBirth, gender };
    for (const [field, value] of Object.entries(required)) {
      if (!value) {
        res.status(400).json({ error: `Missing required field: ${field}` });
        return;
      }
    }

    if (!NATIONAL_ID_REGEX.test(nationalId)) {
      res.status(400).json({ error: 'Invalid nationalId format. Must be a 13-digit Thai ID or a 6-20 char passport number.' });
      return;
    }
    if (titlePrefix && !VALID_TITLE_PREFIXES.includes(titlePrefix)) {
      res.status(400).json({ error: `Invalid titlePrefix. Must be one of: ${VALID_TITLE_PREFIXES.join(', ')}` });
      return;
    }
    if (!VALID_GENDERS.includes(gender)) {
      res.status(400).json({ error: `Invalid gender. Must be one of: ${VALID_GENDERS.join(', ')}` });
      return;
    }
    const dob = new Date(dateOfBirth);
    if (isNaN(dob.getTime())) {
      res.status(400).json({ error: 'Invalid dateOfBirth format. Must be a valid date string.' });
      return;
    }
    if (dob > new Date()) {
      res.status(400).json({ error: 'dateOfBirth cannot be in the future.' });
      return;
    }
    if (photoBase64 && !PHOTO_REGEX.test(photoBase64)) {
      res.status(400).json({ error: 'Invalid photoBase64 format. Must start with "data:image/"' });
      return;
    }

    const payload: CreatePatientRequest = {
      dn, nationalId, titlePrefix, firstName, lastName, dateOfBirth, gender, cardNo, address, note, photoBase64,
    };
    const patient = await createPatient(payload);
    res.status(201).json(patient);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    if (handleDomainError(res, msg)) return;
    console.error('Error creating patient:', error);
    res.status(500).json({ error: 'Internal server error', message: msg });
  }
}

export async function listPatientsHandler(req: Request, res: Response): Promise<void> {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const all = req.query.all === 'true';
    const patients = await listPatients({ search, limit, all });
    res.status(200).json({ patients });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error listing patients:', error);
    res.status(500).json({ error: 'Internal server error', message: msg });
  }
}

export async function getPatientHandler(req: Request, res: Response): Promise<void> {
  try {
    const patient = await getPatientById(req.params.id);
    res.status(200).json(patient);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    if (handleDomainError(res, msg)) return;
    console.error('Error fetching patient:', error);
    res.status(500).json({ error: 'Internal server error', message: msg });
  }
}

export async function getPatientByDnHandler(req: Request, res: Response): Promise<void> {
  try {
    const patient = await getPatientByDn(req.params.dn);
    res.status(200).json(patient);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    if (handleDomainError(res, msg)) return;
    console.error('Error fetching patient by dn:', error);
    res.status(500).json({ error: 'Internal server error', message: msg });
  }
}

export async function updatePatientHandler(req: Request, res: Response): Promise<void> {
  try {
    const { dn, nationalId, titlePrefix, firstName, lastName, dateOfBirth, gender, cardNo, address, note, photoBase64 } =
      req.body;

    if (nationalId !== undefined && !NATIONAL_ID_REGEX.test(nationalId)) {
      res.status(400).json({ error: 'Invalid nationalId format. Must be a 13-digit Thai ID or a 6-20 char passport number.' });
      return;
    }
    if (titlePrefix !== undefined && titlePrefix !== null && !VALID_TITLE_PREFIXES.includes(titlePrefix)) {
      res.status(400).json({ error: `Invalid titlePrefix. Must be one of: ${VALID_TITLE_PREFIXES.join(', ')}` });
      return;
    }
    if (gender !== undefined && !VALID_GENDERS.includes(gender)) {
      res.status(400).json({ error: `Invalid gender. Must be one of: ${VALID_GENDERS.join(', ')}` });
      return;
    }
    if (dateOfBirth !== undefined) {
      const dob = new Date(dateOfBirth);
      if (isNaN(dob.getTime())) {
        res.status(400).json({ error: 'Invalid dateOfBirth format. Must be a valid date string.' });
        return;
      }
      if (dob > new Date()) {
        res.status(400).json({ error: 'dateOfBirth cannot be in the future.' });
        return;
      }
    }
    if (photoBase64 && !PHOTO_REGEX.test(photoBase64)) {
      res.status(400).json({ error: 'Invalid photoBase64 format. Must start with "data:image/"' });
      return;
    }

    const patch: UpdatePatientRequest = {
      dn, nationalId, titlePrefix, firstName, lastName, dateOfBirth, gender, cardNo, address, note, photoBase64,
    };
    const patient = await updatePatient(req.params.id, patch);
    res.status(200).json(patient);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    if (handleDomainError(res, msg)) return;
    console.error('Error updating patient:', error);
    res.status(500).json({ error: 'Internal server error', message: msg });
  }
}

export async function deletePatientHandler(req: Request, res: Response): Promise<void> {
  try {
    await deletePatient(req.params.id);
    res.status(204).send();
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    if (handleDomainError(res, msg)) return;
    console.error('Error deleting patient:', error);
    res.status(500).json({ error: 'Internal server error', message: msg });
  }
}
