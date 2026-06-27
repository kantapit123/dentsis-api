import { prisma } from '../prisma';
import { Prisma } from '@prisma/client';

export interface WorkSessionTypeResponse {
  id: string;
  name: string;
  label: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CreateInput {
  name: string;
  label: string;
}

interface UpdateInput {
  name?: string;
  label?: string;
  active?: boolean;
}

type WorkSessionTypeRow = Prisma.WorkSessionTypeGetPayload<Record<string, never>>;

function toResponse(row: WorkSessionTypeRow): WorkSessionTypeResponse {
  return {
    id: row.id,
    name: row.name,
    label: row.label,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapPrismaError(e: unknown): never {
  if ((e as { code?: string }).code === 'P2002') throw new Error('SESSION_TYPE_NAME_TAKEN');
  throw e;
}

export async function listWorkSessionTypes(activeOnly = false): Promise<WorkSessionTypeResponse[]> {
  const rows = await prisma.workSessionType.findMany({
    where: activeOnly ? { active: true } : undefined,
    orderBy: [{ name: 'asc' }],
  });
  return rows.map(toResponse);
}

export async function createWorkSessionType(data: CreateInput): Promise<WorkSessionTypeResponse> {
  const name = data.name?.trim();
  const label = data.label?.trim();
  if (!name) throw new Error('SESSION_TYPE_NAME_TAKEN');

  // Pre-check unique name for a clean error before Prisma P2002
  const existing = await prisma.workSessionType.findUnique({ where: { name } });
  if (existing) throw new Error('SESSION_TYPE_NAME_TAKEN');

  try {
    const row = await prisma.workSessionType.create({
      data: { name, label },
    });
    return toResponse(row);
  } catch (e: unknown) {
    mapPrismaError(e);
  }
}

export async function updateWorkSessionType(
  id: string,
  data: UpdateInput,
): Promise<WorkSessionTypeResponse> {
  const existing = await prisma.workSessionType.findUnique({ where: { id } });
  if (!existing) throw new Error('SESSION_TYPE_NOT_FOUND');

  const name = data.name !== undefined ? data.name.trim() : existing.name;
  const label = data.label !== undefined ? data.label.trim() : existing.label;
  const active = data.active !== undefined ? data.active : existing.active;

  // If deactivating, ensure no work days currently reference it
  if (!active && existing.active) {
    const inUse = await prisma.doctorWorkDay.findFirst({
      where: { workSessionTypeId: id },
    });
    if (inUse) throw new Error('SESSION_TYPE_IN_USE');
  }

  // Pre-check unique name conflict if name is changing
  if (name !== existing.name) {
    const conflict = await prisma.workSessionType.findUnique({ where: { name } });
    if (conflict) throw new Error('SESSION_TYPE_NAME_TAKEN');
  }

  try {
    const row = await prisma.workSessionType.update({
      where: { id },
      data: { name, label, active },
    });
    return toResponse(row);
  } catch (e: unknown) {
    mapPrismaError(e);
  }
}

export async function softDeleteWorkSessionType(id: string): Promise<void> {
  const existing = await prisma.workSessionType.findUnique({ where: { id } });
  if (!existing) throw new Error('SESSION_TYPE_NOT_FOUND');

  // Cannot deactivate if work days reference it
  const inUse = await prisma.doctorWorkDay.findFirst({
    where: { workSessionTypeId: id },
  });
  if (inUse) throw new Error('SESSION_TYPE_IN_USE');

  await prisma.workSessionType.update({ where: { id }, data: { active: false } });
}
