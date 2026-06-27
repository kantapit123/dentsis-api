import { Request, Response } from 'express';
import * as service from '../services/workSessionTypeService';

function handleDomainError(res: Response, msg: string): boolean {
  switch (msg) {
    case 'SESSION_TYPE_NOT_FOUND':
      res.status(404).json({ code: 'SESSION_TYPE_NOT_FOUND', message: 'Work session type not found' });
      return true;
    case 'SESSION_TYPE_NAME_TAKEN':
      res.status(409).json({ code: 'SESSION_TYPE_NAME_TAKEN', message: 'A work session type with that name already exists' });
      return true;
    case 'SESSION_TYPE_IN_USE':
      res.status(409).json({ code: 'SESSION_TYPE_IN_USE', message: 'Cannot deactivate: work days are referencing this session type' });
      return true;
    default:
      return false;
  }
}

export async function listWorkSessionTypesHandler(req: Request, res: Response): Promise<void> {
  try {
    const activeOnly = req.query.active === 'true';
    const workSessionTypes = await service.listWorkSessionTypes(activeOnly);
    res.status(200).json({ workSessionTypes });
  } catch (e) {
    console.error('listWorkSessionTypes error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function createWorkSessionTypeHandler(req: Request, res: Response): Promise<void> {
  try {
    const { name, label } = req.body;
    if (!name || !label) {
      res.status(400).json({ error: 'Missing required fields: name, label' });
      return;
    }
    const workSessionType = await service.createWorkSessionType({ name, label });
    res.status(201).json({ workSessionType });
  } catch (e: unknown) {
    const msg = (e as Error).message;
    if (handleDomainError(res, msg)) return;
    console.error('createWorkSessionType error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updateWorkSessionTypeHandler(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { name, label, active } = req.body;
    const workSessionType = await service.updateWorkSessionType(id, { name, label, active });
    res.status(200).json({ workSessionType });
  } catch (e: unknown) {
    const msg = (e as Error).message;
    if (handleDomainError(res, msg)) return;
    console.error('updateWorkSessionType error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function deleteWorkSessionTypeHandler(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    await service.softDeleteWorkSessionType(id);
    res.status(204).send();
  } catch (e: unknown) {
    const msg = (e as Error).message;
    if (handleDomainError(res, msg)) return;
    console.error('deleteWorkSessionType error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}
