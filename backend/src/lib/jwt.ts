// Thin wrappers around @fastify/jwt so route handlers don't reach into
// fastify.jwt.* directly. Centralizes the payload shape and error handling
// so swapping the JWT library later is a one-file change.

import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { UserRole } from '@prisma/client';
import { config } from '../config/index.js';

// ─── Payload shape embedded in every JWT we issue ───────────────────────────
export interface JwtPayload {
  sub: number;        // user.id
  username: string;
  role: UserRole;     // ADMIN | MANAGER
  name: string;
  iat?: number;
  exp?: number;
}

// Module-scoped reference to the Fastify instance, set by `registerJwt()`.
// Routes call signToken/verifyToken without passing `app` around.
let _app: FastifyInstance | null = null;

export function registerJwt(app: FastifyInstance): void {
  _app = app;
}

function requireApp(): FastifyInstance {
  if (_app === null) {
    throw new Error('jwt helpers used before registerJwt(app)');
  }
  return _app;
}

/** Issue a new JWT for the given user payload. */
export async function signToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): Promise<string> {
  const app = requireApp();
  // Cast: @fastify/jwt v10 returns `string` but its types are a bit loose.
  return (await app.jwt.sign(payload, {
    expiresIn: config.jwtExpiresIn,
  })) as string;
}

/**
 * Verify a JWT and return its payload. Throws on invalid/expired token;
 * callers (middleware/auth.ts) translate the error into a 401.
 */
export async function verifyToken(token: string): Promise<JwtPayload> {
  const app = requireApp();
  const decoded = await app.jwt.verify<JwtPayload>(token);
  return decoded;
}

/** Pull the bearer token from the Authorization header. Returns null if missing/malformed. */
export function extractBearer(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  if (header === undefined || header === '') return null;
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || token === undefined || token === '') return null;
  return token;
}