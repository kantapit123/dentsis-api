import crypto from 'crypto';
import { prisma } from '../prisma';

export interface DoctorResponse {
  id: string;
  name: string;
  nickname: string | null;
  color: string | null;
  specialty: string | null;
  active: boolean;
  lineUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CreateDoctorInput {
  name: string;
  nickname?: string | null;
  color?: string | null;
  specialty?: string | null;
  lineUserId?: string | null;
}

interface UpdateDoctorInput {
  name?: string;
  nickname?: string | null;
  color?: string | null;
  specialty?: string | null;
  active?: boolean;
  lineUserId?: string | null;
}

function toResponse(d: {
  id: string;
  name: string;
  nickname: string | null;
  color: string | null;
  specialty: string | null;
  active: boolean;
  lineUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): DoctorResponse {
  return {
    id: d.id,
    name: d.name,
    nickname: d.nickname,
    color: d.color,
    specialty: d.specialty,
    active: d.active,
    lineUserId: d.lineUserId,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

export async function listDoctors(activeOnly: boolean): Promise<DoctorResponse[]> {
  const doctors = await prisma.doctor.findMany({
    where: activeOnly ? { active: true } : undefined,
    orderBy: { name: 'asc' },
  });
  return doctors.map(toResponse);
}

export async function createDoctor(data: CreateDoctorInput): Promise<DoctorResponse> {
  const name = data.name?.trim();
  if (!name) throw new Error('INVALID_NAME');
  const doctor = await prisma.doctor.create({
    data: {
      name,
      nickname: data.nickname?.trim() || null,
      color: data.color?.trim() || null,
      specialty: data.specialty?.trim() || null,
      lineUserId: data.lineUserId?.trim() || null,
    },
  });
  return toResponse(doctor);
}

export async function updateDoctor(id: string, data: UpdateDoctorInput): Promise<DoctorResponse> {
  const existing = await prisma.doctor.findUnique({ where: { id } });
  if (!existing) throw new Error('DOCTOR_NOT_FOUND');

  if (data.name !== undefined && !data.name.trim()) throw new Error('INVALID_NAME');

  const doctor = await prisma.doctor.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.nickname !== undefined ? { nickname: data.nickname?.trim() || null } : {}),
      ...(data.color !== undefined ? { color: data.color?.trim() || null } : {}),
      ...(data.specialty !== undefined ? { specialty: data.specialty?.trim() || null } : {}),
      ...(data.active !== undefined ? { active: data.active } : {}),
      ...(data.lineUserId !== undefined ? { lineUserId: data.lineUserId?.trim() || null } : {}),
    },
  });
  return toResponse(doctor);
}

export async function softDeleteDoctor(id: string): Promise<void> {
  const existing = await prisma.doctor.findUnique({ where: { id } });
  if (!existing) throw new Error('DOCTOR_NOT_FOUND');
  await prisma.doctor.update({ where: { id }, data: { active: false } });
}

export interface InviteCodeResponse {
  code: string;
  expiresAt: string;
}

export async function generateInviteCode(doctorId: string): Promise<InviteCodeResponse> {
  const existing = await prisma.doctor.findUnique({ where: { id: doctorId } });
  if (!existing) throw new Error('DOCTOR_NOT_FOUND');

  const expiryHours = parseInt(process.env.LINE_INVITE_EXPIRY_HOURS ?? '24', 10);
  const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

  // Delete any previous unused codes for this doctor
  await prisma.doctorInviteCode.deleteMany({
    where: { doctorId, usedAt: null },
  });

  // Generate unique 6-digit code — retry on collision (extremely rare)
  let code: string;
  for (;;) {
    code = String(crypto.randomInt(100000, 999999));
    const collision = await prisma.doctorInviteCode.findUnique({ where: { code } });
    if (!collision) break;
  }

  await prisma.doctorInviteCode.create({
    data: { doctorId, code, expiresAt },
  });

  return { code, expiresAt: expiresAt.toISOString() };
}
