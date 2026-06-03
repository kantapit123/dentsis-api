import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { prisma } from '../prisma';
import type { Prisma } from '@prisma/client';
import {
  signAccessToken,
  generateRefreshToken,
  hashToken,
  refreshTokenExpiresAt,
} from './tokenService';
import {
  BootstrapRequest,
  LoginRequest,
  CreateUserRequest,
  UpdateUserRequest,
  ChangePasswordRequest,
  UserResponse,
} from '../types/auth.types';
import { UserRole } from '@prisma/client';

const BCRYPT_ROUNDS = 12;
const REFRESH_GRACE_MS = 5_000;

function toUserResponse(u: {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  doctorId: string | null;
  active: boolean;
}): UserResponse {
  return { id: u.id, email: u.email, name: u.name, role: u.role, doctorId: u.doctorId, active: u.active };
}

// Enforces the User<->Doctor invariant:
//  - role=DOCTOR  → doctorId required and must reference an active Doctor
//  - role=ADMIN|STAFF → doctorId must be null
async function assertValidDoctorLink(role: UserRole, doctorId: string | null | undefined): Promise<void> {
  if (role === 'DOCTOR') {
    if (!doctorId) throw new Error('DOCTOR_REQUIRED');
    const doctor = await prisma.doctor.findUnique({ where: { id: doctorId } });
    if (!doctor || !doctor.active) throw new Error('INACTIVE_DOCTOR');
  } else if (doctorId) {
    throw new Error('DOCTOR_NOT_ALLOWED');
  }
}

export async function bootstrap(
  data: BootstrapRequest,
): Promise<{ accessToken: string; refreshToken: string; user: UserResponse }> {
  const expectedSecret = process.env.ADMIN_BOOTSTRAP_SECRET;
  if (!expectedSecret || data.secret !== expectedSecret) {
    throw new Error('INVALID_SECRET');
  }

  const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
  const rawRefresh = generateRefreshToken();
  const tokenHash = hashToken(rawRefresh);
  const family = randomUUID();

  try {
    const user = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Atomic singleton: CREATE fails with PK conflict if bootstrap already ran.
      await tx.bootstrapLock.create({ data: { id: 'done' } });

      const created = await tx.user.create({
        data: { email: data.email, name: data.name, passwordHash, role: 'ADMIN' },
      });

      await tx.refreshToken.create({
        data: {
          userId: created.id,
          tokenHash,
          family,
          expiresAt: refreshTokenExpiresAt(),
        },
      });

      return created;
    });

    const accessToken = signAccessToken(user.id, user.role, user.tokenVersion);
    return { accessToken, refreshToken: rawRefresh, user: toUserResponse(user) };
  } catch (e: unknown) {
    const code = (e as { code?: string }).code;
    if (code === 'P2002') throw new Error('ADMIN_EXISTS');
    throw e;
  }
}

export async function login(
  data: LoginRequest,
): Promise<{ accessToken: string; refreshToken: string; user: UserResponse }> {
  const user = await prisma.user.findUnique({ where: { email: data.email } });
  if (!user) throw new Error('INVALID_CREDENTIALS');

  const match = await bcrypt.compare(data.password, user.passwordHash);
  if (!match) throw new Error('INVALID_CREDENTIALS');

  if (!user.active) throw new Error('ACCOUNT_DISABLED');

  const rawRefresh = generateRefreshToken();
  const family = randomUUID();

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(rawRefresh),
      family,
      expiresAt: refreshTokenExpiresAt(),
    },
  });

  const accessToken = signAccessToken(user.id, user.role, user.tokenVersion);
  return { accessToken, refreshToken: rawRefresh, user: toUserResponse(user) };
}

export async function refresh(
  rawToken: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const hash = hashToken(rawToken);
  const newRaw = generateRefreshToken();
  const newHash = hashToken(newRaw);

  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hash },
    include: { user: true },
  });

  if (!stored) throw new Error('INVALID_TOKEN');

  if (stored.revokedAt) {
    // Grace window: concurrent tab may have just rotated this token.
    const age = Date.now() - stored.revokedAt.getTime();
    if (age < REFRESH_GRACE_MS) {
      const activeSibling = await prisma.refreshToken.findFirst({
        where: { family: stored.family, revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
        include: { user: true },
      });
      if (activeSibling) {
        // Rotate the active sibling so concurrent tab B also gets a fresh cookie.
        await prisma.$transaction([
          prisma.refreshToken.update({ where: { id: activeSibling.id }, data: { revokedAt: new Date() } }),
          prisma.refreshToken.create({
            data: {
              userId: activeSibling.userId,
              tokenHash: newHash,
              family: activeSibling.family,
              expiresAt: refreshTokenExpiresAt(),
            },
          }),
        ]);
        const accessToken = signAccessToken(
          activeSibling.userId,
          activeSibling.user.role,
          activeSibling.user.tokenVersion,
        );
        return { accessToken, refreshToken: newRaw };
      }
    }
    // Outside grace window or no active sibling → reuse attack.
    // Bump tokenVersion so any outstanding access tokens are rejected immediately.
    await prisma.$transaction([
      prisma.refreshToken.updateMany({
        where: { family: stored.family },
        data: { revokedAt: new Date() },
      }),
      prisma.user.update({
        where: { id: stored.userId },
        data: { tokenVersion: { increment: 1 } },
      }),
    ]);
    throw new Error('TOKEN_REVOKED');
  }

  if (stored.expiresAt < new Date()) throw new Error('TOKEN_EXPIRED');

  // Atomic CAS: update only if still not revoked.
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const updated = await tx.refreshToken.updateMany({
      where: { tokenHash: hash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (updated.count === 0) throw new Error('TOKEN_REVOKED');

    await tx.refreshToken.create({
      data: {
        userId: stored.userId,
        tokenHash: newHash,
        family: stored.family,
        expiresAt: refreshTokenExpiresAt(),
      },
    });
  });

  const accessToken = signAccessToken(stored.userId, stored.user.role, stored.user.tokenVersion);
  return { accessToken, refreshToken: newRaw };
}

export async function logout(rawToken: string): Promise<void> {
  const hash = hashToken(rawToken);
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: hash } });
  if (!stored) return;

  // Bump tokenVersion so the outstanding access token stops working at logout,
  // not only when it expires.
  await prisma.$transaction([
    prisma.refreshToken.updateMany({
      where: { family: stored.family },
      data: { revokedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: stored.userId },
      data: { tokenVersion: { increment: 1 } },
    }),
  ]);
}

export async function getMe(userId: string): Promise<UserResponse> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return toUserResponse(user);
}

export async function createUser(data: CreateUserRequest): Promise<UserResponse> {
  const role = data.role ?? 'STAFF';
  await assertValidDoctorLink(role, data.doctorId);

  const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
  try {
    const user = await prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        passwordHash,
        role,
        doctorId: role === 'DOCTOR' ? data.doctorId! : null,
      },
    });
    return toUserResponse(user);
  } catch (e: unknown) {
    const code = (e as { code?: string }).code;
    if (code === 'P2002') {
      const target = (e as { meta?: { target?: string[] } }).meta?.target;
      if (target?.includes('doctorId')) throw new Error('DOCTOR_ALREADY_LINKED');
      throw new Error('EMAIL_TAKEN');
    }
    throw e;
  }
}

export async function listUsers(): Promise<UserResponse[]> {
  const users = await prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
  return users.map(toUserResponse);
}

export async function updateUser(id: string, data: UpdateUserRequest): Promise<UserResponse> {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw new Error('USER_NOT_FOUND');

  const role = data.role ?? existing.role;
  // Resolve target doctorId: explicit value wins, else keep existing; force null when not a DOCTOR.
  let doctorId: string | null = data.doctorId !== undefined ? data.doctorId : existing.doctorId;
  if (role !== 'DOCTOR') doctorId = null;
  await assertValidDoctorLink(role, doctorId);

  const updateData: Prisma.UserUncheckedUpdateInput = { role, doctorId };
  if (data.name !== undefined) updateData.name = data.name;
  if (data.active !== undefined) updateData.active = data.active;
  if (data.password) updateData.passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);

  // Force re-auth when security-relevant fields change: password reset, demotion/role change,
  // or deactivation. The live tokenVersion check in requireAuth then rejects old access tokens.
  const securityChange =
    !!data.password || role !== existing.role || data.active === false;
  if (securityChange) updateData.tokenVersion = { increment: 1 };

  try {
    const user = await prisma.user.update({ where: { id }, data: updateData });
    return toUserResponse(user);
  } catch (e: unknown) {
    const code = (e as { code?: string }).code;
    if (code === 'P2002') {
      const target = (e as { meta?: { target?: string[] } }).meta?.target;
      if (target?.includes('doctorId')) throw new Error('DOCTOR_ALREADY_LINKED');
      throw new Error('EMAIL_TAKEN');
    }
    throw e;
  }
}

export async function softDeleteUser(id: string): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw new Error('USER_NOT_FOUND');
  await prisma.user.update({
    where: { id },
    data: { active: false, tokenVersion: { increment: 1 } },
  });
}

export async function changePassword(userId: string, data: ChangePasswordRequest): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const match = await bcrypt.compare(data.oldPassword, user.passwordHash);
  if (!match) throw new Error('INVALID_PASSWORD');

  const passwordHash = await bcrypt.hash(data.newPassword, BCRYPT_ROUNDS);
  // Bump tokenVersion to invalidate other sessions; the caller refreshes for a new access token.
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, tokenVersion: { increment: 1 } },
  });
}
