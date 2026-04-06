import { Request, Response } from 'express';
import { createPatient } from '../services/patientService';
import { CreatePatientRequest } from '../types/patient.types';

const VALID_TITLE_PREFIXES = ['MISTER', 'MRS', 'MISS', 'YOUNG_BOY', 'YOUNG_GIRL', 'OTHER'];
const VALID_GENDERS = ['MALE', 'FEMALE', 'OTHER'];
const NATIONAL_ID_REGEX = /^\d{13}$/;
const PHOTO_REGEX = /^data:image\//;

export async function createPatientHandler(req: Request, res: Response): Promise<void> {
  try {
    const {
      nationalId,
      titlePrefix,
      firstName,
      lastName,
      dateOfBirth,
      gender,
      cardNo,
      address,
      photoBase64,
    } = req.body;

    // Validate required fields
    if (!nationalId) {
      res.status(400).json({ error: 'Missing required field: nationalId' });
      return;
    }
    if (!titlePrefix) {
      res.status(400).json({ error: 'Missing required field: titlePrefix' });
      return;
    }
    if (!firstName) {
      res.status(400).json({ error: 'Missing required field: firstName' });
      return;
    }
    if (!lastName) {
      res.status(400).json({ error: 'Missing required field: lastName' });
      return;
    }
    if (!dateOfBirth) {
      res.status(400).json({ error: 'Missing required field: dateOfBirth' });
      return;
    }
    if (!gender) {
      res.status(400).json({ error: 'Missing required field: gender' });
      return;
    }

    // Validate nationalId format (13 digits)
    if (!NATIONAL_ID_REGEX.test(nationalId)) {
      res.status(400).json({ error: 'Invalid nationalId format. Must be 13 digits.' });
      return;
    }

    // Validate titlePrefix enum
    if (!VALID_TITLE_PREFIXES.includes(titlePrefix)) {
      res.status(400).json({
        error: `Invalid titlePrefix. Must be one of: ${VALID_TITLE_PREFIXES.join(', ')}`,
      });
      return;
    }

    // Validate gender enum
    if (!VALID_GENDERS.includes(gender)) {
      res.status(400).json({
        error: `Invalid gender. Must be one of: ${VALID_GENDERS.join(', ')}`,
      });
      return;
    }

    // Validate dateOfBirth is a valid date
    const dateOfBirthDate = new Date(dateOfBirth);
    if (isNaN(dateOfBirthDate.getTime())) {
      res.status(400).json({ error: 'Invalid dateOfBirth format. Must be a valid date string.' });
      return;
    }

    // Validate dateOfBirth is not in the future
    if (dateOfBirthDate > new Date()) {
      res.status(400).json({ error: 'dateOfBirth cannot be in the future.' });
      return;
    }

    // Validate photoBase64 if present
    if (photoBase64 && !PHOTO_REGEX.test(photoBase64)) {
      res.status(400).json({ error: 'Invalid photoBase64 format. Must start with "data:image/"' });
      return;
    }

    // Call service to create patient
    const patientData: CreatePatientRequest = {
      nationalId,
      titlePrefix,
      firstName,
      lastName,
      dateOfBirth,
      gender,
      cardNo,
      address,
      photoBase64,
    };

    const patient = await createPatient(patientData);
    res.status(201).json(patient);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (errorMessage === 'DUPLICATE_NATIONAL_ID') {
      res.status(409).json({
        error: 'DUPLICATE_NATIONAL_ID',
        message: 'A patient with this national ID already exists',
      });
      return;
    }

    console.error('Error creating patient:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: errorMessage,
    });
  }
}
