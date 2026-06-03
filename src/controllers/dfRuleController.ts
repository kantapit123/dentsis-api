import { Request, Response } from 'express';
import * as service from '../services/dfRuleService';

function handleDomainError(res: Response, msg: string): boolean {
  switch (msg) {
    case 'INVALID_DF_TYPE':
      res.status(400).json({ code: 'INVALID_DF_TYPE', message: 'dfType must be PERCENTAGE or FIXED' });
      return true;
    case 'INVALID_DF_BASE':
      res.status(400).json({ code: 'INVALID_DF_BASE', message: 'dfBase must be TREATMENT_FEE or TOTAL_AMOUNT' });
      return true;
    case 'INVALID_DF_VALUE':
      res.status(400).json({ code: 'INVALID_DF_VALUE', message: 'dfValue invalid (PERCENTAGE: 0-100, FIXED: >= 0)' });
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
    case 'DUPLICATE_ACTIVE_RULE':
      res.status(409).json({ code: 'DUPLICATE_ACTIVE_RULE', message: 'An active rule already exists for this doctor + treatment type' });
      return true;
    case 'DF_RULE_NOT_FOUND':
      res.status(404).json({ code: 'DF_RULE_NOT_FOUND', message: 'DF rule not found' });
      return true;
    default:
      return false;
  }
}

export async function listDfRulesHandler(req: Request, res: Response): Promise<void> {
  try {
    // DOCTOR may only ever see their own rules — ignore any client-supplied doctorId.
    const doctorId =
      req.user!.role === 'DOCTOR'
        ? req.user!.doctorId
        : (req.query.doctorId as string | undefined) ?? null;
    const dfRules = await service.listDfRules(doctorId);
    res.status(200).json({ dfRules });
  } catch (e) {
    console.error('listDfRules error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function createDfRuleHandler(req: Request, res: Response): Promise<void> {
  try {
    const { doctorId, treatmentTypeId, dfType, dfValue, dfBase } = req.body;
    if (!doctorId) {
      res.status(400).json({ error: 'Missing required field: doctorId' });
      return;
    }
    const dfRule = await service.createDfRule({ doctorId, treatmentTypeId, dfType, dfValue, dfBase });
    res.status(201).json({ dfRule });
  } catch (e: unknown) {
    const msg = (e as Error).message;
    if (handleDomainError(res, msg)) return;
    console.error('createDfRule error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updateDfRuleHandler(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { treatmentTypeId, dfType, dfValue, dfBase, active } = req.body;
    const dfRule = await service.updateDfRule(id, { treatmentTypeId, dfType, dfValue, dfBase, active });
    res.status(200).json({ dfRule });
  } catch (e: unknown) {
    const msg = (e as Error).message;
    if (handleDomainError(res, msg)) return;
    console.error('updateDfRule error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function deleteDfRuleHandler(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    await service.softDeleteDfRule(id);
    res.status(204).send();
  } catch (e: unknown) {
    const msg = (e as Error).message;
    if (handleDomainError(res, msg)) return;
    console.error('deleteDfRule error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function previewDfHandler(req: Request, res: Response): Promise<void> {
  try {
    const { doctorId, treatmentTypeId, treatmentFee, medicineFee } = req.body;
    if (!doctorId || treatmentFee === undefined) {
      res.status(400).json({ error: 'Missing required fields: doctorId, treatmentFee' });
      return;
    }
    const result = await service.previewDf({ doctorId, treatmentTypeId, treatmentFee, medicineFee });
    res.status(200).json({ data: result });
  } catch (e: unknown) {
    const msg = (e as Error).message;
    if (handleDomainError(res, msg)) return;
    console.error('previewDf error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}
