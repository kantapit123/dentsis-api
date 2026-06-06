import { Request, Response } from 'express';
import * as service from '../services/financeSummaryService';

// DOCTOR is locked to their own figures; ADMIN/STAFF see clinic-wide totals by default but may
// scope to one doctor via ?doctorId= (omitted/empty ⇒ clinic-wide). Powers the per-doctor DF report.
function scopedDoctorId(req: Request): string | null {
  if (req.user!.role === 'DOCTOR') return req.user!.doctorId;
  return (req.query.doctorId as string) || null;
}

function handleDomainError(res: Response, msg: string): boolean {
  switch (msg) {
    case 'INVALID_DATE':
      res.status(400).json({ code: 'INVALID_DATE', message: 'date must be a valid YYYY-MM-DD' });
      return true;
    case 'INVALID_MONTH':
      res.status(400).json({ code: 'INVALID_MONTH', message: 'month must be a valid YYYY-MM' });
      return true;
    case 'INVALID_RANGE':
      res.status(400).json({ code: 'INVALID_RANGE', message: 'from/to must be valid dates with to ≥ from and span ≤ 366 days' });
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

export async function periodSummaryHandler(req: Request, res: Response): Promise<void> {
  try {
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    if (!from || !to) {
      res.status(400).json({ error: 'Missing required query params: from, to' });
      return;
    }
    const data = await service.getPeriodSummary(from, to, scopedDoctorId(req));
    res.status(200).json({ data });
  } catch (e: unknown) {
    const msg = (e as Error).message;
    if (handleDomainError(res, msg)) return;
    console.error('periodSummary error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}
