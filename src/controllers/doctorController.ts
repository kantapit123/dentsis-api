import { Request, Response } from 'express';
import * as doctorService from '../services/doctorService';

function handleDomainError(res: Response, msg: string): boolean {
  switch (msg) {
    case 'INVALID_NAME':
      res.status(400).json({ code: 'INVALID_NAME', message: 'Doctor name is required' });
      return true;
    case 'DOCTOR_NOT_FOUND':
      res.status(404).json({ code: 'DOCTOR_NOT_FOUND', message: 'Doctor not found' });
      return true;
    default:
      return false;
  }
}

export async function listDoctorsHandler(req: Request, res: Response): Promise<void> {
  try {
    const activeOnly = req.query.active === 'true';
    const doctors = await doctorService.listDoctors(activeOnly);
    res.status(200).json({ doctors });
  } catch (e) {
    console.error('listDoctors error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function createDoctorHandler(req: Request, res: Response): Promise<void> {
  try {
    const { name, nickname } = req.body;
    const doctor = await doctorService.createDoctor({ name, nickname });
    res.status(201).json({ doctor });
  } catch (e: unknown) {
    const msg = (e as Error).message;
    if (handleDomainError(res, msg)) return;
    console.error('createDoctor error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updateDoctorHandler(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { name, nickname, active } = req.body;
    const doctor = await doctorService.updateDoctor(id, { name, nickname, active });
    res.status(200).json({ doctor });
  } catch (e: unknown) {
    const msg = (e as Error).message;
    if (handleDomainError(res, msg)) return;
    console.error('updateDoctor error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function deleteDoctorHandler(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    await doctorService.softDeleteDoctor(id);
    res.status(204).send();
  } catch (e: unknown) {
    const msg = (e as Error).message;
    if (handleDomainError(res, msg)) return;
    console.error('deleteDoctor error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}
