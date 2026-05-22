import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { UserRole } from '@prisma/client';
import { JwtPayload } from '../types/auth.types';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET!;
const ACCESS_EXPIRES = (process.env.JWT_ACCESS_EXPIRES ?? '15m') as jwt.SignOptions['expiresIn'];
export const REFRESH_EXPIRES_DAYS = parseInt(process.env.REFRESH_TOKEN_EXPIRES_DAYS ?? '7', 10);

export function signAccessToken(sub: string, role: UserRole, ver: number): string {
  return jwt.sign({ sub, role, ver }, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRES });
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, ACCESS_SECRET) as JwtPayload;
}

export function generateRefreshToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function refreshTokenExpiresAt(): Date {
  const d = new Date();
  d.setDate(d.getDate() + REFRESH_EXPIRES_DAYS);
  return d;
}
