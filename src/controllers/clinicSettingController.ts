import { Request, Response } from 'express';
import * as service from '../services/clinicSettingService';

export async function getClinicSettingsHandler(req: Request, res: Response): Promise<void> {
  try {
    const settings = await service.getClinicSettings();
    res.status(200).json(settings);
  } catch (e) {
    console.error('getClinicSettings error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updateClinicSettingsHandler(req: Request, res: Response): Promise<void> {
  try {
    const { clinicOpenTime, clinicCloseTime } = req.body;
    const settings = await service.updateClinicSettings({ clinicOpenTime, clinicCloseTime });
    res.status(200).json(settings);
  } catch (e: unknown) {
    const msg = (e as Error).message;
    if (msg === 'INVALID_TIME') {
      res.status(400).json({ code: 'INVALID_TIME', message: 'Times must be HH:MM (00:00–23:59)' });
      return;
    }
    if (msg === 'INVALID_TIME_RANGE') {
      res.status(400).json({ code: 'INVALID_TIME_RANGE', message: 'clinicCloseTime must be after clinicOpenTime' });
      return;
    }
    console.error('updateClinicSettings error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}
