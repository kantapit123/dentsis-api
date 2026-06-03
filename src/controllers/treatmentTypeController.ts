import { Request, Response } from 'express';
import * as service from '../services/treatmentTypeService';

function handleDomainError(res: Response, msg: string): boolean {
  switch (msg) {
    case 'INVALID_NAME':
      res.status(400).json({ code: 'INVALID_NAME', message: 'Treatment type name is required' });
      return true;
    case 'INVALID_AMOUNT':
      res.status(400).json({ code: 'INVALID_AMOUNT', message: 'defaultPrice must be a non-negative number' });
      return true;
    case 'TREATMENT_TYPE_NAME_TAKEN':
      res.status(409).json({ code: 'TREATMENT_TYPE_NAME_TAKEN', message: 'Treatment type name already exists' });
      return true;
    case 'TREATMENT_TYPE_NOT_FOUND':
      res.status(404).json({ code: 'TREATMENT_TYPE_NOT_FOUND', message: 'Treatment type not found' });
      return true;
    default:
      return false;
  }
}

export async function listTreatmentTypesHandler(req: Request, res: Response): Promise<void> {
  try {
    const activeOnly = req.query.active === 'true';
    const treatmentTypes = await service.listTreatmentTypes(activeOnly);
    res.status(200).json({ treatmentTypes });
  } catch (e) {
    console.error('listTreatmentTypes error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function createTreatmentTypeHandler(req: Request, res: Response): Promise<void> {
  try {
    const { name, defaultPrice } = req.body;
    const treatmentType = await service.createTreatmentType({ name, defaultPrice });
    res.status(201).json({ treatmentType });
  } catch (e: unknown) {
    const msg = (e as Error).message;
    if (handleDomainError(res, msg)) return;
    console.error('createTreatmentType error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updateTreatmentTypeHandler(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { name, defaultPrice, active } = req.body;
    const treatmentType = await service.updateTreatmentType(id, { name, defaultPrice, active });
    res.status(200).json({ treatmentType });
  } catch (e: unknown) {
    const msg = (e as Error).message;
    if (handleDomainError(res, msg)) return;
    console.error('updateTreatmentType error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function deleteTreatmentTypeHandler(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    await service.softDeleteTreatmentType(id);
    res.status(204).send();
  } catch (e: unknown) {
    const msg = (e as Error).message;
    if (handleDomainError(res, msg)) return;
    console.error('deleteTreatmentType error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}
