import { Request, Response } from 'express';
import * as service from '../services/incomeGuaranteeService';

function handleDomainError(res: Response, msg: string): boolean {
  switch (msg) {
    case 'INVALID_AMOUNT':
      res.status(400).json({ code: 'INVALID_AMOUNT', message: 'dailyAmount must be a positive number' });
      return true;
    case 'INACTIVE_DOCTOR':
      res.status(400).json({ code: 'INACTIVE_DOCTOR', message: 'Doctor does not exist or is inactive' });
      return true;
    case 'DUPLICATE_ACTIVE_GUARANTEE':
      res.status(409).json({ code: 'DUPLICATE_ACTIVE_GUARANTEE', message: 'An active income guarantee already exists for this doctor' });
      return true;
    case 'GUARANTEE_NOT_FOUND':
      res.status(404).json({ code: 'GUARANTEE_NOT_FOUND', message: 'Income guarantee not found' });
      return true;
    default:
      return false;
  }
}

export async function listIncomeGuaranteesHandler(req: Request, res: Response): Promise<void> {
  try {
    // DOCTOR may only see their own guarantee — ignore any client-supplied doctorId.
    const doctorId =
      req.user!.role === 'DOCTOR'
        ? req.user!.doctorId
        : (req.query.doctorId as string | undefined) ?? null;
    const incomeGuarantees = await service.listIncomeGuarantees(doctorId);
    res.status(200).json({ incomeGuarantees });
  } catch (e) {
    console.error('listIncomeGuarantees error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function createIncomeGuaranteeHandler(req: Request, res: Response): Promise<void> {
  try {
    const { doctorId, dailyAmount, note } = req.body;
    if (!doctorId || dailyAmount === undefined) {
      res.status(400).json({ error: 'Missing required fields: doctorId, dailyAmount' });
      return;
    }
    const incomeGuarantee = await service.createIncomeGuarantee({ doctorId, dailyAmount, note });
    res.status(201).json({ incomeGuarantee });
  } catch (e: unknown) {
    const msg = (e as Error).message;
    if (handleDomainError(res, msg)) return;
    console.error('createIncomeGuarantee error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updateIncomeGuaranteeHandler(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { dailyAmount, active, note } = req.body;
    const incomeGuarantee = await service.updateIncomeGuarantee(id, { dailyAmount, active, note });
    res.status(200).json({ incomeGuarantee });
  } catch (e: unknown) {
    const msg = (e as Error).message;
    if (handleDomainError(res, msg)) return;
    console.error('updateIncomeGuarantee error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function deleteIncomeGuaranteeHandler(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    await service.softDeleteIncomeGuarantee(id);
    res.status(204).send();
  } catch (e: unknown) {
    const msg = (e as Error).message;
    if (handleDomainError(res, msg)) return;
    console.error('deleteIncomeGuarantee error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}
