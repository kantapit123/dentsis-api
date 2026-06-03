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

// Maps User<->Doctor link / uniqueness domain errors to HTTP responses. Returns true if handled.
function handleUserDomainError(res: Response, msg: string): boolean {
  switch (msg) {
    case 'EMAIL_TAKEN':
      res.status(409).json({ code: 'EMAIL_TAKEN', message: 'Email already in use' });
      return true;
    case 'DOCTOR_ALREADY_LINKED':
      res.status(409).json({ code: 'DOCTOR_ALREADY_LINKED', message: 'Doctor already linked to a user' });
      return true;
    case 'DOCTOR_REQUIRED':
      res.status(400).json({ code: 'DOCTOR_REQUIRED', message: 'doctorId is required for DOCTOR role' });
      return true;
    case 'DOCTOR_NOT_ALLOWED':
      res.status(400).json({ code: 'DOCTOR_NOT_ALLOWED', message: 'doctorId is only allowed for DOCTOR role' });
      return true;
    case 'INACTIVE_DOCTOR':
      res.status(400).json({ code: 'INACTIVE_DOCTOR', message: 'Linked doctor does not exist or is inactive' });
      return true;
    case 'USER_NOT_FOUND':
      res.status(404).json({ code: 'USER_NOT_FOUND', message: 'User not found' });
      return true;
    default:
      return false;
  }
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
    if (msg === 'ACCOUNT_DISABLED') { res.status(403).json({ code: 'ACCOUNT_DISABLED', message: 'Account is disabled' }); return; }
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

export async function changePasswordHandler(req: Request, res: Response): Promise<void> {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      res.status(400).json({ error: 'Missing required fields: oldPassword, newPassword' });
      return;
    }
    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      res.status(400).json({ code: 'WEAK_PASSWORD', message: 'New password must be at least 8 characters' });
      return;
    }
    await authService.changePassword(req.user!.id, { oldPassword, newPassword });
    res.status(204).send();
  } catch (e: unknown) {
    const msg = (e as Error).message;
    if (msg === 'INVALID_PASSWORD') { res.status(400).json({ code: 'INVALID_PASSWORD', message: 'Current password is incorrect' }); return; }
    console.error('changePassword error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function listUsersHandler(_req: Request, res: Response): Promise<void> {
  try {
    const users = await authService.listUsers();
    res.status(200).json({ users });
  } catch (e) {
    console.error('listUsers error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function createUserHandler(req: Request, res: Response): Promise<void> {
  try {
    const { email, password, name, role, doctorId } = req.body;
    if (!email || !password || !name) {
      res.status(400).json({ error: 'Missing required fields: email, password, name' });
      return;
    }
    const user = await authService.createUser({ email, password, name, role, doctorId });
    res.status(201).json({ user });
  } catch (e: unknown) {
    const msg = (e as Error).message;
    if (handleUserDomainError(res, msg)) return;
    console.error('createUser error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updateUserHandler(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { name, role, doctorId, active, password } = req.body;
    const user = await authService.updateUser(id, { name, role, doctorId, active, password });
    res.status(200).json({ user });
  } catch (e: unknown) {
    const msg = (e as Error).message;
    if (handleUserDomainError(res, msg)) return;
    console.error('updateUser error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function deleteUserHandler(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    if (id === req.user!.id) {
      res.status(400).json({ code: 'CANNOT_DELETE_SELF', message: 'You cannot deactivate your own account' });
      return;
    }
    await authService.softDeleteUser(id);
    res.status(204).send();
  } catch (e: unknown) {
    const msg = (e as Error).message;
    if (handleUserDomainError(res, msg)) return;
    console.error('deleteUser error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}
