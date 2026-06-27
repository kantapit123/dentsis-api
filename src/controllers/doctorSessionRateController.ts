import { Request, Response } from 'express';
import * as service from '../services/doctorSessionRateService';

function handleDomainError(res: Response, msg: string): boolean {
  switch (msg) {
    case 'RATE_NOT_FOUND':
      res.status(404).json({ code: 'RATE_NOT_FOUND', message: 'Doctor session rate not found' });
      return true;
    case 'RATE_OVERLAP':
      res.status(409).json({ code: 'RATE_OVERLAP', message: 'Date range overlaps with an existing rate for this doctor and session type' });
      return true;
    case 'INVALID_DATE_RANGE':
      res.status(400).json({ code: 'INVALID_DATE_RANGE', message: 'effectiveTo must be on or after effectiveFrom' });
      return true;
    case 'INVALID_AMOUNT':
      res.status(400).json({ code: 'INVALID_AMOUNT', message: 'amount must be a positive number' });
      return true;
    case 'DOCTOR_NOT_FOUND':
      res.status(400).json({ code: 'DOCTOR_NOT_FOUND', message: 'Doctor does not exist or is inactive' });
      return true;
    case 'SESSION_TYPE_NOT_FOUND':
      res.status(400).json({ code: 'SESSION_TYPE_NOT_FOUND', message: 'Work session type not found or inactive' });
      return true;
    default:
      return false;
  }
}

export async function listRatesHandler(req: Request, res: Response): Promise<void> {
  try {
    const { doctorId } = req.params;
    const rates = await service.listRates(doctorId);
    res.status(200).json({ rates });
  } catch (e) {
    console.error('listRates error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function createRateHandler(req: Request, res: Response): Promise<void> {
  try {
    const { doctorId } = req.params;
    const { workSessionTypeId, amount, effectiveFrom, effectiveTo, note } = req.body;
    if (!workSessionTypeId || amount === undefined || !effectiveFrom) {
      res.status(400).json({ error: 'Missing required fields: workSessionTypeId, amount, effectiveFrom' });
      return;
    }
    const rate = await service.createRate({ doctorId, workSessionTypeId, amount, effectiveFrom, effectiveTo, note });
    res.status(201).json({ rate });
  } catch (e: unknown) {
    const msg = (e as Error).message;
    if (handleDomainError(res, msg)) return;
    console.error('createRate error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updateRateHandler(req: Request, res: Response): Promise<void> {
  try {
    const { rateId } = req.params;
    const { amount, effectiveFrom, effectiveTo, note } = req.body;
    const rate = await service.updateRate(rateId, { amount, effectiveFrom, effectiveTo, note });
    res.status(200).json({ rate });
  } catch (e: unknown) {
    const msg = (e as Error).message;
    if (handleDomainError(res, msg)) return;
    console.error('updateRate error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function deleteRateHandler(req: Request, res: Response): Promise<void> {
  try {
    const { rateId } = req.params;
    await service.deleteRate(rateId);
    res.status(204).send();
  } catch (e: unknown) {
    const msg = (e as Error).message;
    if (handleDomainError(res, msg)) return;
    console.error('deleteRate error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}
