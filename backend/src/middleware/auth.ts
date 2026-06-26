// Auth middleware — preHandler hooks.
//
// requireAuth:
//   - Verifies Bearer JWT.
//   - On success, attaches the decoded payload to `req.user`.
//   - On failure, replies 401 with a JSON error.
//
// requireRole(...roles):
//   - Runs AFTER requireAuth. Compares req.user.role against the allowed set.
//   - 403 on mismatch (user is authenticated, just not authorized).

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { UserRole } from '@prisma/client';
import { extractBearer, verifyToken, type JwtPayload } from '../lib/jwt.js';
import { prisma } from '../lib/prisma.js';

// Tell @fastify/jwt what shape `req.user` has. This augments the existing
// FastifyRequest.user declaration (from @fastify/jwt's d.ts) instead of
// shadowing it with a different optional type.
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

/** Reject requests missing or carrying an invalid/expired Bearer token. */
export async function requireAuth(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const token = extractBearer(req);
  if (token === null) {
    await reply.code(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Missing or malformed Authorization header',
    });
    return;
  }

  try {
    const payload = await verifyToken(token);
    req.user = payload;
  } catch {
    await reply.code(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Invalid or expired token',
    });
    return;
  }
}

/**
 * Factory: requireAuth + role gate. ADMIN always passes through.
 * Pair with requireAuth at the route level:
 *
 *   preHandler: [requireAuth, requireRole('ADMIN')]
 */
export function requireRole(...allowed: ReadonlyArray<UserRole>) {
  return async function roleGuard(
    req: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const role = req.user?.role;
    if (role === undefined) {
      // Should never happen if requireAuth ran first, but fail closed.
      await reply.code(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Authentication required',
      });
      return;
    }
    if (role !== 'ADMIN' && !allowed.includes(role)) {
      await reply.code(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: `Role ${role} is not allowed for this resource`,
      });
      return;
    }
  };
}

/**
 * Optional helper for routes that want a fresh DB snapshot of the user
 * rather than relying solely on the JWT payload. Use sparingly — the JWT
 * is already signed and trusted.
 */
export async function loadFreshUser(req: FastifyRequest): Promise<JwtPayload | null> {
  if (req.user === undefined) return null;
  const user = await prisma.user.findUnique({
    where: { id: req.user.sub },
    select: { id: true, username: true, name: true, role: true, status: true },
  });
  if (user === null) return null;
  if (user.status === 'DISABLED') return null;
  return { sub: user.id, username: user.username, name: user.name, role: user.role };
}