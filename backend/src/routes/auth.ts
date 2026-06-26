// Authentication routes.
//
// POST /auth/login       — username/password → JWT (bcryptjs verify)
// POST /auth/wx-login    — placeholder for WeChat mini-program flow (T10)
// GET  /auth/me          — current user, requires valid Bearer token

import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { signToken } from '../lib/jwt.js';
import { requireAuth } from '../middleware/auth.js';

// ─── Local helpers ──────────────────────────────────────────────────────────
function unauthorized(reply: import('fastify').FastifyReply, message: string) {
  return reply.code(401).send({
    statusCode: 401,
    error: 'Unauthorized',
    message,
  });
}

// ─── Route registration ─────────────────────────────────────────────────────
export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  // ── POST /auth/login ─────────────────────────────────────────────────────
  app.post('/auth/login', async (req, reply) => {
    const body = req.body as { username?: unknown; password?: unknown } | null;
    const username = typeof body?.username === 'string' ? body.username.trim() : '';
    const password = typeof body?.password === 'string' ? body.password : '';

    if (username === '' || password === '') {
      return reply.code(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'username and password are required',
      });
    }

    const user = await prisma.user.findUnique({ where: { username } });
    if (user === null) {
      // Same response as wrong-password — don't leak account existence.
      return unauthorized(reply, 'Invalid username or password');
    }

    if (user.status === 'DISABLED') {
      return unauthorized(reply, 'Account is disabled');
    }

    const passwordOk = await bcrypt.compare(password, user.passwordHash);
    if (!passwordOk) {
      return unauthorized(reply, 'Invalid username or password');
    }

    const token = await signToken({
      sub: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
    });

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
      },
    };
  });

  // ── POST /auth/wx-login ──────────────────────────────────────────────────
  // Placeholder for the WeChat mini-program flow. T10 will:
  //   1. Accept { code: string } from the client.
  //   2. Exchange code for openid via https://api.weixin.qq.com/sns/jscode2session
  //   3. Look up User by openid, create on first sight, issue JWT.
  app.post('/auth/wx-login', async (_req, reply) => {
    return reply.code(501).send({
      statusCode: 501,
      error: 'Not Implemented',
      message: 'T10 will implement WeChat mini-program login',
    });
  });

  // ── GET /auth/me ─────────────────────────────────────────────────────────
  // Re-loads the user from DB so role/status changes take effect immediately
  // (the JWT itself is not refreshed on every call).
  app.get('/auth/me', { preHandler: requireAuth }, async (req, reply) => {
    if (req.user === undefined) {
      return unauthorized(reply, 'Authentication required');
    }
    const fresh = await prisma.user.findUnique({
      where: { id: req.user.sub },
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        status: true,
        phone: true,
      },
    });
    if (fresh === null) {
      return unauthorized(reply, 'User no longer exists');
    }
    if (fresh.status === 'DISABLED') {
      return reply.code(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Account is disabled',
      });
    }
    return {
      id: fresh.id,
      username: fresh.username,
      name: fresh.name,
      role: fresh.role,
      status: fresh.status,
      phone: fresh.phone,
    };
  });
}