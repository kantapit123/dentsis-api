import { Request, Response } from 'express';
import { AppointmentConfirmationStatus, AppointmentStatus } from '@prisma/client';
import * as appointmentService from '../services/appointmentService';

function handleDomainError(res: Response, msg: string): boolean {
  switch (msg) {
    case 'APPOINTMENT_NOT_FOUND':
      res.status(404).json({ code: 'APPOINTMENT_NOT_FOUND', message: 'Appointment not found' });
      return true;
    case 'PATIENT_NOT_FOUND':
      res.status(404).json({ code: 'PATIENT_NOT_FOUND', message: 'Patient not found' });
      return true;
    case 'DOCTOR_NOT_FOUND':
      res.status(404).json({ code: 'DOCTOR_NOT_FOUND', message: 'Doctor not found' });
      return true;
    case 'TREATMENT_TYPE_NOT_FOUND':
      res.status(404).json({ code: 'TREATMENT_TYPE_NOT_FOUND', message: 'Treatment type not found' });
      return true;
    case 'SLOT_UNAVAILABLE':
      res.status(409).json({ code: 'SLOT_UNAVAILABLE', message: 'Doctor has an overlapping appointment' });
      return true;
    case 'PATIENT_DOUBLE_BOOKED':
      res.status(409).json({ code: 'PATIENT_DOUBLE_BOOKED', message: 'Patient already has an overlapping appointment' });
      return true;
    case 'CANNOT_MODIFY_COMPLETED':
      res.status(422).json({ code: 'CANNOT_MODIFY_COMPLETED', message: 'Cannot modify a completed appointment' });
      return true;
    case 'CANNOT_MODIFY_CANCELLED':
      res.status(422).json({ code: 'CANNOT_MODIFY_CANCELLED', message: 'Cannot modify a cancelled appointment' });
      return true;
    case 'CANNOT_CANCEL_COMPLETED':
      res.status(422).json({ code: 'CANNOT_CANCEL_COMPLETED', message: 'Cannot cancel a completed appointment' });
      return true;
    case 'INVALID_DATE':
      res.status(400).json({ code: 'INVALID_DATE', message: 'Invalid date' });
      return true;
    case 'INVALID_RANGE':
      res.status(400).json({ code: 'INVALID_RANGE', message: 'Date range invalid or exceeds 31 days' });
      return true;
    case 'FORBIDDEN':
      res.status(403).json({ code: 'FORBIDDEN', message: 'Insufficient permissions' });
      return true;
    default:
      return false;
  }
}

export async function listAppointmentsHandler(req: Request, res: Response): Promise<void> {
  try {
    const { from, to, doctorId, status } = req.query;
    const doctorIds = doctorId
      ? (Array.isArray(doctorId) ? (doctorId as string[]) : [doctorId as string])
      : undefined;
    const statuses = status
      ? (Array.isArray(status) ? (status as AppointmentStatus[]) : [status as AppointmentStatus])
      : undefined;
    const result = await appointmentService.listAppointments(
      from as string,
      to as string,
      doctorIds,
      statuses,
      req.user!.role,
      req.user!.doctorId ?? null,
    );
    res.status(200).json(result);
  } catch (e: unknown) {
    const msg = (e as Error).message;
    if (handleDomainError(res, msg)) return;
    console.error('listAppointments error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getConfirmationSummaryHandler(req: Request, res: Response): Promise<void> {
  try {
    const { from, to } = req.query;
    const result = await appointmentService.getConfirmationSummary(
      from as string | undefined,
      to as string | undefined,
      req.user!.role,
      req.user!.doctorId ?? null,
    );
    res.status(200).json(result);
  } catch (e: unknown) {
    const msg = (e as Error).message;
    if (handleDomainError(res, msg)) return;
    console.error('getConfirmationSummary error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getAvailableSlotsHandler(req: Request, res: Response): Promise<void> {
  try {
    const { doctorId, date, durationMinutes } = req.query;
    const result = await appointmentService.getAvailableSlots(
      doctorId as string,
      date as string,
      Number(durationMinutes),
    );
    res.status(200).json(result);
  } catch (e: unknown) {
    const msg = (e as Error).message;
    if (handleDomainError(res, msg)) return;
    console.error('getAvailableSlots error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getDoctorsAvailabilityHandler(req: Request, res: Response): Promise<void> {
  try {
    const { date, treatmentTypeId } = req.query;
    const result = await appointmentService.getDoctorsAvailability(
      date as string,
      treatmentTypeId as string | undefined,
    );
    res.status(200).json(result);
  } catch (e: unknown) {
    const msg = (e as Error).message;
    if (handleDomainError(res, msg)) return;
    console.error('getDoctorsAvailability error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getAppointmentHandler(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const result = await appointmentService.getAppointment(id, req.user!.role, req.user!.doctorId ?? null);
    res.status(200).json(result);
  } catch (e: unknown) {
    const msg = (e as Error).message;
    if (handleDomainError(res, msg)) return;
    console.error('getAppointment error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function createAppointmentHandler(req: Request, res: Response): Promise<void> {
  try {
    const { patientId, doctorId, treatmentTypeId, date, startTime, notes } = req.body;
    const result = await appointmentService.createAppointment(
      { patientId, doctorId, treatmentTypeId, date, startTime, notes },
      req.user!.id,
    );
    res.status(201).json(result);
  } catch (e: unknown) {
    const msg = (e as Error).message;
    if (handleDomainError(res, msg)) return;
    console.error('createAppointment error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updateAppointmentHandler(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { date, startTime, treatmentTypeId, doctorId, notes, status } = req.body;
    const result = await appointmentService.updateAppointment(id, {
      date,
      startTime,
      treatmentTypeId,
      doctorId,
      notes,
      status,
    });
    res.status(200).json(result);
  } catch (e: unknown) {
    const msg = (e as Error).message;
    if (handleDomainError(res, msg)) return;
    console.error('updateAppointment error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updateConfirmationStatusHandler(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { confirmationStatus } = req.body;
    const result = await appointmentService.updateConfirmationStatus(
      id,
      confirmationStatus as AppointmentConfirmationStatus,
    );
    res.status(200).json(result);
  } catch (e: unknown) {
    const msg = (e as Error).message;
    if (handleDomainError(res, msg)) return;
    console.error('updateConfirmationStatus error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function cancelAppointmentHandler(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    await appointmentService.cancelAppointment(id);
    res.status(204).send();
  } catch (e: unknown) {
    const msg = (e as Error).message;
    if (handleDomainError(res, msg)) return;
    console.error('cancelAppointment error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function cancelAppointmentByPostHandler(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    await appointmentService.cancelAppointment(id, reason);
    res.status(200).json({ id, status: 'CANCELLED', cancellationReason: reason ?? null });
  } catch (e: unknown) {
    const msg = (e as Error).message;
    if (handleDomainError(res, msg)) return;
    console.error('cancelAppointment error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}
