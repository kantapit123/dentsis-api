import { Request, Response } from 'express';
import * as authService from '../services/authService';

const COOKIE_NAME = 'refresh_token';
const COOKIE_PATH = '/api/auth';
const IS_PROD = process.env.NODE_ENV === 'production';
const REFRESH_DAYS = parseInt(process.env.REFRESH_TOKEN_EXPIRES_DAYS ?? '7', 10);

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'strict',
    path: COOKIE_PATH,
    maxAge: REFRESH_DAYS * 24 * 60 * 60 * 1000,
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, { path: COOKIE_PATH });
}

export async function bootstrapHandler(req: Request, res: Response): Promise<void> {
  try {
    const { secret, name, email, password } = req.body;
    if (!secret || !name || !email || !password) {
      res.status(400).json({ error: 'Missing required fields: secret, name, email, password' });
      return;
    }
    const result = await authService.bootstrap({ secret, name, email, password });
    setRefreshCookie(res, result.refreshToken);
    res.status(201).json({ accessToken: result.accessToken, user: result.user });
  } catch (e: unknown) {
    const msg = (e as Error).message;
    if (msg === 'INVALID_SECRET') { res.status(403).json({ code: 'INVALID_SECRET', message: 'Invalid bootstrap secret' }); return; }
    if (msg === 'ADMIN_EXISTS') { res.status(409).json({ code: 'ADMIN_EXISTS', message: 'Admin already exists' }); return; }
    console.error('bootstrap error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function loginHandler(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: 'Missing required fields: email, password' });
      return;
    }
    const result = await authService.login({ email, password });
    setRefreshCookie(res, result.refreshToken);
    res.status(200).json({ accessToken: result.accessToken, user: result.user });
  } catch (e: unknown) {
    const msg = (e as Error).message;
    if (msg === 'INVALID_CREDENTIALS') { res.status(401).json({ code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' }); return; }
    console.error('login error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function refreshHandler(req: Request, res: Response): Promise<void> {
  try {
    const rawToken = req.cookies?.[COOKIE_NAME];
    if (!rawToken) {
      res.status(401).json({ code: 'MISSING_TOKEN', message: 'Refresh token cookie missing' });
      return;
    }
    const result = await authService.refresh(rawToken);
    setRefreshCookie(res, result.refreshToken);
    res.status(200).json({ accessToken: result.accessToken });
  } catch (e: unknown) {
    const msg = (e as Error).message;
    clearRefreshCookie(res);
    if (['INVALID_TOKEN', 'TOKEN_REVOKED', 'TOKEN_EXPIRED'].includes(msg)) {
      res.status(401).json({ code: msg, message: 'Refresh token invalid or expired' });
      return;
    }
    console.error('refresh error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function logoutHandler(req: Request, res: Response): Promise<void> {
  try {
    const rawToken = req.cookies?.[COOKIE_NAME];
    if (rawToken) await authService.logout(rawToken);
    clearRefreshCookie(res);
    res.status(204).send();
  } catch (e) {
    console.error('logout error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function meHandler(req: Request, res: Response): Promise<void> {
  try {
    const user = await authService.getMe(req.user!.id);
    res.status(200).json({ user });
  } catch (e) {
    console.error('me error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function createUserHandler(req: Request, res: Response): Promise<void> {
  try {
    const { email, password, name, role } = req.body;
    if (!email || !password || !name) {
      res.status(400).json({ error: 'Missing required fields: email, password, name' });
      return;
    }
    const user = await authService.createUser({ email, password, name, role });
    res.status(201).json({ user });
  } catch (e: unknown) {
    const msg = (e as Error).message;
    if (msg === 'EMAIL_TAKEN') { res.status(409).json({ code: 'EMAIL_TAKEN', message: 'Email already in use' }); return; }
    console.error('createUser error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}
