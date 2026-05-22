import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../services/tokenService';
import { prisma } from '../prisma';
import { UserRole } from '@prisma/client';

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ code: 'MISSING_TOKEN', message: 'Authorization header required' });
    return;
  }

  const token = authHeader.slice(7);

  let payload: { sub: string; role: UserRole; ver: number };
  try {
    payload = verifyAccessToken(token);
  } catch (e: unknown) {
    const name = (e as Error).name;
    if (name === 'TokenExpiredError') {
      res.status(401).json({ code: 'TOKEN_EXPIRED', message: 'Access token expired' });
    } else {
      res.status(401).json({ code: 'INVALID_TOKEN', message: 'Invalid access token' });
    }
    return;
  }

  // Live DB check: verify tokenVersion so demotion and forced logout take effect immediately.
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, role: true, tokenVersion: true },
  });

  if (!user) {
    res.status(401).json({ code: 'INVALID_TOKEN', message: 'User not found' });
    return;
  }

  if (user.tokenVersion !== payload.ver) {
    res.status(401).json({ code: 'TOKEN_REVOKED', message: 'Token has been revoked' });
    return;
  }

  req.user = { id: user.id, role: user.role };
  next();
}

export function requireRole(...roles: UserRole[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ code: 'MISSING_TOKEN', message: 'Not authenticated' });
      return;
    }
    // Role is already fresh from requireAuth's DB lookup.
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ code: 'FORBIDDEN', message: 'Insufficient permissions' });
      return;
    }
    next();
  };
}
