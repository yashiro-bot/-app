// Auth API. Real implementations land in T15.
//
// Endpoints (backend reference: backend/src/routes/auth.ts):
//   POST /auth/login    — username/password → { token, user }
//   POST /auth/wx-login — WeChat code → { token, user } (T17+)
//   GET  /auth/me       — current user, requires Bearer token

import { http } from '../utils/request';

export type UserRole = 'ADMIN' | 'MANAGER';

export interface User {
  id: number;
  username: string;
  name: string;
  role: UserRole;
  status?: 'ACTIVE' | 'DISABLED';
  phone?: string | null;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export function login(username: string, password: string): Promise<LoginResponse> {
  // TODO(T15): real call → http.post<LoginResponse>('/auth/login', { username, password })
  throw new Error('login() not implemented (T15)');
}

export function loginWithWx(code: string): Promise<LoginResponse> {
  // TODO(T17): real call → http.post<LoginResponse>('/auth/wx-login', { code })
  throw new Error('loginWithWx() not implemented (T17)');
}

export function me(): Promise<User> {
  // TODO(T15): real call → http.get<User>('/auth/me')
  throw new Error('me() not implemented (T15)');
}
