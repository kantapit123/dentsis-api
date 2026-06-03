import { Request, Response } from 'express';
import * as service from '../services/financeSummaryService';

// DOCTOR is restricted to their own figures; everyone else sees clinic-wide totals.
function scopedDoctorId(req: Request): string | null {
  return req.user!.role === 'DOCTOR' ? req.user!.doctorId : null;
}

function handleDomainError(res: Response, msg: string): boolean {
  switch (msg) {
    case 'INVALID_DATE':
      res.status(400).json({ code: 'INVALID_DATE', message: 'date must be a valid YYYY-MM-DD' });
      return true;
    case 'INVALID_MONTH':
      res.status(400).json({ code: 'INVALID_MONTH', message: 'month must be a valid YYYY-MM' });
      return true;
    default:
      return false;
  }
}

export async function dailySummaryHandler(req: Request, res: Response): Promise<void> {
  try {
    const date = req.query.date as string | undefined;
    if (!date) {
      res.status(400).json({ error: 'Missing required query param: date' });
      return;
    }
    const data = await service.getDailySummary(date, scopedDoctorId(req));
    res.status(200).json({ data });
  } catch (e: unknown) {
    const msg = (e as Error).message;
    if (handleDomainError(res, msg)) return;
    console.error('dailySummary error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function monthlySummaryHandler(req: Request, res: Response): Promise<void> {
  try {
    const month = req.query.month as string | undefined;
    if (!month) {
      res.status(400).json({ error: 'Missing required query param: month' });
      return;
    }
    const data = await service.getMonthlySummary(month, scopedDoctorId(req));
    res.status(200).json({ data });
  } catch (e: unknown) {
    const msg = (e as Error).message;
    if (handleDomainError(res, msg)) return;
    console.error('monthlySummary error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}
