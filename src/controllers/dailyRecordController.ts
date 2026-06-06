import { Request, Response } from 'express';
import * as service from '../services/dailyRecordService';

function handleDomainError(res: Response, msg: string): boolean {
  switch (msg) {
    case 'INVALID_DATE':
      res.status(400).json({ code: 'INVALID_DATE', message: 'recordDate must be a valid YYYY-MM-DD' });
      return true;
    case 'FUTURE_DATE':
      res.status(400).json({ code: 'FUTURE_DATE', message: 'recordDate cannot be in the future' });
      return true;
    case 'INVALID_PATIENT_NAME':
      res.status(400).json({ code: 'INVALID_PATIENT_NAME', message: 'patientName is required' });
      return true;
    case 'INVALID_TREATMENT_NOTE':
      res.status(400).json({ code: 'INVALID_TREATMENT_NOTE', message: 'treatmentNote is required' });
      return true;
    case 'INVALID_PAYMENT_METHOD':
      res.status(400).json({ code: 'INVALID_PAYMENT_METHOD', message: 'paymentMethod must be CASH or TRANSFER' });
      return true;
    case 'INVALID_AMOUNT':
      res.status(400).json({ code: 'INVALID_AMOUNT', message: 'Fees must be non-negative numbers' });
      return true;
    case 'INACTIVE_DOCTOR':
      res.status(400).json({ code: 'INACTIVE_DOCTOR', message: 'Doctor does not exist or is inactive' });
      return true;
    case 'INACTIVE_TREATMENT_TYPE':
      res.status(400).json({ code: 'INACTIVE_TREATMENT_TYPE', message: 'Treatment type does not exist or is inactive' });
      return true;
    case 'SEQUENCE_CONFLICT':
      res.status(409).json({ code: 'SEQUENCE_CONFLICT', message: 'Could not assign a sequence number, please retry' });
      return true;
    case 'DAILY_RECORD_NOT_FOUND':
      res.status(404).json({ code: 'DAILY_RECORD_NOT_FOUND', message: 'Daily record not found' });
      return true;
    default:
      return false;
  }
}

export async function listDailyRecordsHandler(req: Request, res: Response): Promise<void> {
  try {
    // DOCTOR sees only their own records — ignore any client-supplied doctorId.
    const doctorId =
      req.user!.role === 'DOCTOR'
        ? req.user!.doctorId
        : (req.query.doctorId as string | undefined) ?? null;

    const dailyRecords = await service.listDailyRecords({
      doctorId,
      date: req.query.date as string | undefined,
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
    });
    res.status(200).json({ dailyRecords });
  } catch (e: unknown) {
    const msg = (e as Error).message;
    if (handleDomainError(res, msg)) return;
    console.error('listDailyRecords error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getDailyRecordHandler(req: Request, res: Response): Promise<void> {
  try {
    const record = await service.getDailyRecord(req.params.id);
    // DOCTOR may only read their own record.
    if (req.user!.role === 'DOCTOR' && record.doctorId !== req.user!.doctorId) {
      res.status(403).json({ code: 'FORBIDDEN', message: 'Insufficient permissions' });
      return;
    }
    res.status(200).json({ dailyRecord: record });
  } catch (e: unknown) {
    const msg = (e as Error).message;
    if (handleDomainError(res, msg)) return;
    console.error('getDailyRecord error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function createDailyRecordHandler(req: Request, res: Response): Promise<void> {
  try {
    const {
      recordDate, dn, patientId, patientName, doctorId, treatmentNote,
      treatmentTypeIds, treatmentFee, medicineFee, medicineNote, paymentMethod, notes,
    } = req.body;

    if (!recordDate || !patientName || !doctorId || !treatmentNote || treatmentFee === undefined || !paymentMethod) {
      res.status(400).json({
        error: 'Missing required fields: recordDate, patientName, doctorId, treatmentNote, treatmentFee, paymentMethod',
      });
      return;
    }

    const dailyRecord = await service.createDailyRecord(
      { recordDate, dn, patientId, patientName, doctorId, treatmentNote, treatmentTypeIds, treatmentFee, medicineFee, medicineNote, paymentMethod, notes },
      req.user!.id,
    );
    res.status(201).json({ dailyRecord });
  } catch (e: unknown) {
    const msg = (e as Error).message;
    if (handleDomainError(res, msg)) return;
    console.error('createDailyRecord error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updateDailyRecordHandler(req: Request, res: Response): Promise<void> {
  try {
    const {
      dn, patientId, patientName, doctorId, treatmentNote,
      treatmentTypeIds, treatmentFee, medicineFee, medicineNote, paymentMethod, notes,
    } = req.body;

    const dailyRecord = await service.updateDailyRecord(req.params.id, {
      dn, patientId, patientName, doctorId, treatmentNote, treatmentTypeIds, treatmentFee, medicineFee, medicineNote, paymentMethod, notes,
    });
    res.status(200).json({ dailyRecord });
  } catch (e: unknown) {
    const msg = (e as Error).message;
    if (handleDomainError(res, msg)) return;
    console.error('updateDailyRecord error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function deleteDailyRecordHandler(req: Request, res: Response): Promise<void> {
  try {
    await service.deleteDailyRecord(req.params.id);
    res.status(204).send();
  } catch (e: unknown) {
    const msg = (e as Error).message;
    if (handleDomainError(res, msg)) return;
    console.error('deleteDailyRecord error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}
