import { UserRole } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  role: UserRole;
  ver: number;
  iat?: number;
  exp?: number;
}

export interface AuthUser {
  id: string;
  role: UserRole;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface CreateUserRequest {
  email: string;
  password: string;
  name: string;
  role?: UserRole;
}

export interface BootstrapRequest {
  secret: string;
  name: string;
  email: string;
  password: string;
}

export interface UserResponse {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}
