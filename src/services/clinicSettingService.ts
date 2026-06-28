import { prisma } from '../prisma';
import { parseHHMM } from './guaranteeCalculatorService';

export interface ClinicSettings {
  clinicOpenTime: string;
  clinicCloseTime: string;
}

const DEFAULTS: ClinicSettings = { clinicOpenTime: '11:00', clinicCloseTime: '20:00' };

export async function getClinicSettings(): Promise<ClinicSettings> {
  const row = await prisma.clinicSetting.findUnique({ where: { id: 1 } });
  if (!row) return DEFAULTS;
  return { clinicOpenTime: row.clinicOpenTime, clinicCloseTime: row.clinicCloseTime };
}

export async function updateClinicSettings(input: Partial<ClinicSettings>): Promise<ClinicSettings> {
  if (input.clinicOpenTime !== undefined) parseHHMM(input.clinicOpenTime);
  if (input.clinicCloseTime !== undefined) parseHHMM(input.clinicCloseTime);

  const current = await getClinicSettings();
  const openTime = input.clinicOpenTime ?? current.clinicOpenTime;
  const closeTime = input.clinicCloseTime ?? current.clinicCloseTime;
  if (parseHHMM(closeTime) <= parseHHMM(openTime)) throw new Error('INVALID_TIME_RANGE');

  const data = {
    ...(input.clinicOpenTime !== undefined && { clinicOpenTime: input.clinicOpenTime }),
    ...(input.clinicCloseTime !== undefined && { clinicCloseTime: input.clinicCloseTime }),
  };

  const row = await prisma.clinicSetting.upsert({
    where: { id: 1 },
    create: { id: 1, ...DEFAULTS, ...data },
    update: data,
  });
  return { clinicOpenTime: row.clinicOpenTime, clinicCloseTime: row.clinicCloseTime };
}
