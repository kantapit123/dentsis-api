import { Request, Response } from 'express';
import * as service from '../services/workDayService';

function handleDomainError(res: Response, msg: string): boolean {
  switch (msg) {
    case 'INVALID_DATE':
      res.status(400).json({ code: 'INVALID_DATE', message: 'workDate must be a valid YYYY-MM-DD' });
      return true;
    case 'FUTURE_DATE':
      res.status(400).json({ code: 'FUTURE_DATE', message: 'workDate cannot be in the future' });
      return true;
    case 'INVALID_TIME':
      res.status(400).json({ code: 'INVALID_TIME', message: 'startTime/endTime must be HH:MM (00:00–23:59)' });
      return true;
    case 'INVALID_TIME_RANGE':
      res.status(400).json({ code: 'INVALID_TIME_RANGE', message: 'endTime must be after startTime; provide both times together' });
      return true;
    case 'INVALID_DAY_FRACTION':
      res.status(400).json({ code: 'INVALID_DAY_FRACTION', message: 'dayFraction must be a number in (0, 1]' });
      return true;
    case 'INACTIVE_DOCTOR':
      res.status(400).json({ code: 'INACTIVE_DOCTOR', message: 'Doctor does not exist or is inactive' });
      return true;
    case 'WORK_DAY_NOT_FOUND':
      res.status(404).json({ code: 'WORK_DAY_NOT_FOUND', message: 'Work day not found' });
      return true;
    default:
      return false;
  }
}

export async function listWorkDaysHandler(req: Request, res: Response): Promise<void> {
  try {
    // DOCTOR sees only their own work days — ignore any client-supplied doctorId.
    const doctorId =
      req.user!.role === 'DOCTOR'
        ? req.user!.doctorId
        : (req.query.doctorId as string | undefined) ?? null;

    const workDays = await service.listWorkDays({
      doctorId,
      date: req.query.date as string | undefined,
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
    });
    res.status(200).json({ workDays });
  } catch (e: unknown) {
    const msg = (e as Error).message;
    if (handleDomainError(res, msg)) return;
    console.error('listWorkDays error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Create-or-replace the attendance row for a (doctor, date).
export async function upsertWorkDayHandler(req: Request, res: Response): Promise<void> {
  try {
    const { doctorId, workDate, startTime, endTime, dayFraction, note } = req.body;
    if (!doctorId || !workDate) {
      res.status(400).json({ error: 'Missing required fields: doctorId, workDate' });
      return;
    }
    const workDay = await service.upsertWorkDay({ doctorId, workDate, startTime, endTime, dayFraction, note });
    res.status(200).json({ workDay });
  } catch (e: unknown) {
    const msg = (e as Error).message;
    if (handleDomainError(res, msg)) return;
    console.error('upsertWorkDay error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updateWorkDayHandler(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { startTime, endTime, dayFraction, note, workSessionTypeId, guaranteedAmountOverride } = req.body;
    const workDay = await service.updateWorkDay(id, { startTime, endTime, dayFraction, note, workSessionTypeId, guaranteedAmountOverride });
    res.status(200).json({ workDay });
  } catch (e: unknown) {
    const msg = (e as Error).message;
    if (handleDomainError(res, msg)) return;
    console.error('updateWorkDay error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function deleteWorkDayHandler(req: Request, res: Response): Promise<void> {
  try {
    await service.deleteWorkDay(req.params.id);
    res.status(204).send();
  } catch (e: unknown) {
    const msg = (e as Error).message;
    if (handleDomainError(res, msg)) return;
    console.error('deleteWorkDay error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}
