import { prisma } from '../prisma';
import { Prisma } from '@prisma/client';
import { decimalToNumber, parseAmount } from '../utils/money';

export interface TreatmentTypeResponse {
  id: string;
  name: string;
  defaultPrice: number | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CreateInput {
  name: string;
  defaultPrice?: number | string | null;
}

interface UpdateInput {
  name?: string;
  defaultPrice?: number | string | null;
  active?: boolean;
}

function toResponse(t: {
  id: string;
  name: string;
  defaultPrice: Prisma.Decimal | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}): TreatmentTypeResponse {
  return {
    id: t.id,
    name: t.name,
    defaultPrice: decimalToNumber(t.defaultPrice),
    active: t.active,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

// undefined → leave unchanged; null/'' → clear; otherwise validate as a non-negative amount.
function resolveDefaultPrice(value: CreateInput['defaultPrice']): Prisma.Decimal | null {
  if (value === null || value === undefined || value === '') return null;
  return parseAmount(value); // throws INVALID_AMOUNT if negative / non-finite
}

export async function listTreatmentTypes(activeOnly: boolean): Promise<TreatmentTypeResponse[]> {
  const types = await prisma.treatmentType.findMany({
    where: activeOnly ? { active: true } : undefined,
    orderBy: { name: 'asc' },
  });
  return types.map(toResponse);
}

export async function createTreatmentType(data: CreateInput): Promise<TreatmentTypeResponse> {
  const name = data.name?.trim();
  if (!name) throw new Error('INVALID_NAME');
  const defaultPrice = resolveDefaultPrice(data.defaultPrice);
  try {
    const type = await prisma.treatmentType.create({ data: { name, defaultPrice } });
    return toResponse(type);
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'P2002') throw new Error('TREATMENT_TYPE_NAME_TAKEN');
    throw e;
  }
}

export async function updateTreatmentType(id: string, data: UpdateInput): Promise<TreatmentTypeResponse> {
  const existing = await prisma.treatmentType.findUnique({ where: { id } });
  if (!existing) throw new Error('TREATMENT_TYPE_NOT_FOUND');
  if (data.name !== undefined && !data.name.trim()) throw new Error('INVALID_NAME');

  try {
    const type = await prisma.treatmentType.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.defaultPrice !== undefined ? { defaultPrice: resolveDefaultPrice(data.defaultPrice) } : {}),
        ...(data.active !== undefined ? { active: data.active } : {}),
      },
    });
    return toResponse(type);
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'P2002') throw new Error('TREATMENT_TYPE_NAME_TAKEN');
    throw e;
  }
}

export async function softDeleteTreatmentType(id: string): Promise<void> {
  const existing = await prisma.treatmentType.findUnique({ where: { id } });
  if (!existing) throw new Error('TREATMENT_TYPE_NOT_FOUND');
  await prisma.treatmentType.update({ where: { id }, data: { active: false } });
}
