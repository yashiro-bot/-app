// User management routes.
//
//   GET    /users      — paginated list, admin only (filters: role/status/search)
//   GET    /users/:id  — single user, admin OR self (excludes passwordHash)
//   POST   /users      — create user, admin only (bcrypt hash on the way in)
//   PATCH  /users/:id  — partial update, admin (any field) or self (name/phone only)
//   DELETE /users/:id  — SOFT delete (status=DISABLED), admin only, never self
//
// All responses strip `passwordHash`. Search matches username/name/phone via
// `contains` (SQLite is case-insensitive for ASCII by default; MySQL collation
// depends on the column charset, but `contains` is the safe portable choice).

import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import {
  Prisma,
  type UserRole,
  type UserStatus,
} from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const BCRYPT_ROUNDS = 10;

const ROLE_VALUES = ['ADMIN', 'MANAGER'] as const;
type RoleLiteral = (typeof ROLE_VALUES)[number];

const STATUS_VALUES = ['ACTIVE', 'DISABLED'] as const;
type StatusLiteral = (typeof STATUS_VALUES)[number];

// Public projection — what every endpoint returns. Never includes passwordHash.
const PUBLIC_USER_SELECT = {
  id: true,
  username: true,
  name: true,
  phone: true,
  openid: true,
  role: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

// ─── Reusable error helpers ──────────────────────────────────────────────────
function conflict(reply: import('fastify').FastifyReply, message: string) {
  return reply.code(409).send({
    statusCode: 409,
    error: 'Conflict',
    message,
  });
}

function notFound(reply: import('fastify').FastifyReply, message: string) {
  return reply.code(404).send({
    statusCode: 404,
    error: 'Not Found',
    message,
  });
}

function badRequest(reply: import('fastify').FastifyReply, message: string) {
  return reply.code(400).send({
    statusCode: 400,
    error: 'Bad Request',
    message,
  });
}

// ─── JSON schemas for Fastify validation ────────────────────────────────────

// GET /users query schema
const listQuerySchema = {
  type: 'object',
  properties: {
    page: { type: 'integer', minimum: 1, default: 1 },
    pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    role: { type: 'string', enum: [...ROLE_VALUES] },
    status: { type: 'string', enum: [...STATUS_VALUES] },
    search: { type: 'string', minLength: 1, maxLength: 64 },
  },
  additionalProperties: false,
} as const;

// GET /users/:id and DELETE /users/:id params
const idParamsSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer', minimum: 1 },
  },
  required: ['id'],
} as const;

// POST /users body
const createBodySchema = {
  type: 'object',
  required: ['username', 'password', 'name', 'role'],
  additionalProperties: false,
  properties: {
    username: { type: 'string', minLength: 3, maxLength: 64 },
    password: { type: 'string', minLength: 6, maxLength: 128 },
    name: { type: 'string', minLength: 1, maxLength: 128 },
    phone: { type: 'string', minLength: 4, maxLength: 32 },
    role: { type: 'string', enum: [...ROLE_VALUES] },
    status: { type: 'string', enum: [...STATUS_VALUES] },
  },
} as const;

// PATCH /users/:id body — every field optional.
// `role` is a permission-sensitive field; the handler enforces who can set it.
const patchBodySchema = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 128 },
    phone: { type: 'string', minLength: 4, maxLength: 32 },
    password: { type: 'string', minLength: 6, maxLength: 128 },
    role: { type: 'string', enum: [...ROLE_VALUES] },
    status: { type: 'string', enum: [...STATUS_VALUES] },
  },
} as const;

// ─── Route registration ─────────────────────────────────────────────────────
export async function registerUsersRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /users ────────────────────────────────────────────────────────────
  app.get<{
    Querystring: {
      page?: number;
      pageSize?: number;
      role?: string;
      status?: string;
      search?: string;
    };
  }>(
    '/users',
    {
      preHandler: [requireAuth, requireRole('ADMIN')],
      schema: { querystring: listQuerySchema },
    },
    async (req, reply) => {
      const page = req.query.page ?? 1;
      const pageSize = req.query.pageSize ?? 20;
      const role: UserRole | undefined =
        req.query.role === 'ADMIN' || req.query.role === 'MANAGER'
          ? req.query.role
          : undefined;
      const status: UserStatus | undefined =
        req.query.status === 'ACTIVE' || req.query.status === 'DISABLED'
          ? req.query.status
          : undefined;
      const search =
        typeof req.query.search === 'string' && req.query.search !== ''
          ? req.query.search
          : undefined;

      // Build the where clause. `OR` with three contains-filters is portable
      // across SQLite and MySQL and lets a single search box hit username/name/phone.
      const where = {
        ...(role !== undefined ? { role } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(search !== undefined
          ? {
              OR: [
                { username: { contains: search } },
                { name: { contains: search } },
                { phone: { contains: search } },
              ],
            }
          : {}),
      };

      const [data, total] = await Promise.all([
        prisma.user.findMany({
          where,
          select: PUBLIC_USER_SELECT,
          orderBy: [{ id: 'asc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.user.count({ where }),
      ]);

      return reply.send({ data, total, page, pageSize });
    },
  );

  // ── GET /users/:id ───────────────────────────────────────────────────────
  app.get<{ Params: { id: number } }>(
    '/users/:id',
    {
      preHandler: [requireAuth],
      schema: { params: idParamsSchema },
    },
    async (req, reply) => {
      // Admin or self only — we read req.user (set by requireAuth) here.
      if (req.user === undefined) {
        return reply.code(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Authentication required',
        });
      }
      if (req.user.role !== 'ADMIN' && req.user.sub !== req.params.id) {
        return reply.code(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: 'You may only access your own user record',
        });
      }

      const user = await prisma.user.findUnique({
        where: { id: req.params.id },
        select: PUBLIC_USER_SELECT,
      });
      if (user === null) {
        return notFound(reply, `User ${req.params.id} not found`);
      }
      return reply.send(user);
    },
  );

  // ── POST /users ──────────────────────────────────────────────────────────
  app.post<{
    Body: {
      username: string;
      password: string;
      name: string;
      phone?: string;
      role: RoleLiteral;
      status?: StatusLiteral;
    };
  }>(
    '/users',
    {
      preHandler: [requireAuth, requireRole('ADMIN')],
      schema: { body: createBodySchema },
    },
    async (req, reply) => {
      const { username, password, name, phone, role, status } = req.body;

      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

      try {
        const created = await prisma.user.create({
          data: {
            username,
            passwordHash,
            name,
            phone: phone ?? null,
            role: role === 'ADMIN' ? 'ADMIN' : 'MANAGER',
            status: status === 'DISABLED' ? 'DISABLED' : 'ACTIVE',
          },
          select: PUBLIC_USER_SELECT,
        });
        return reply.code(201).send(created);
      } catch (err: unknown) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          return conflict(reply, `Username already exists: ${username}`);
        }
        throw err;
      }
    },
  );

  // ── PATCH /users/:id ─────────────────────────────────────────────────────
  app.patch<{
    Params: { id: number };
    Body: {
      name?: string;
      phone?: string;
      password?: string;
      role?: RoleLiteral;
      status?: StatusLiteral;
    };
  }>(
    '/users/:id',
    {
      preHandler: [requireAuth],
      schema: { params: idParamsSchema, body: patchBodySchema },
    },
    async (req, reply) => {
      if (req.user === undefined) {
        return reply.code(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Authentication required',
        });
      }

      const targetId = req.params.id;
      const isSelf = req.user.sub === targetId;
      const isAdmin = req.user.role === 'ADMIN';

      if (!isSelf && !isAdmin) {
        return reply.code(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: 'You may only update your own user record',
        });
      }

      const existing = await prisma.user.findUnique({
        where: { id: targetId },
        select: { id: true },
      });
      if (existing === null) {
        return notFound(reply, `User ${targetId} not found`);
      }

      // Build the update payload + check field-level permissions.
      const data: Prisma.UserUpdateInput = {};

      if (req.body.name !== undefined) {
        // Self + admin both allowed.
        data.name = req.body.name;
      }

      if (req.body.phone !== undefined) {
        // Self + admin both allowed. Allow empty string to clear the phone.
        data.phone = req.body.phone === '' ? null : req.body.phone;
      }

      if (req.body.password !== undefined) {
        if (!isAdmin) {
          return reply.code(403).send({
            statusCode: 403,
            error: 'Forbidden',
            message: 'Only admins may change another user password',
          });
        }
        // (Self changing own password is fine; spec doesn't restrict it.)
        data.passwordHash = await bcrypt.hash(req.body.password, BCRYPT_ROUNDS);
      }

      if (req.body.role !== undefined) {
        if (!isAdmin) {
          return reply.code(403).send({
            statusCode: 403,
            error: 'Forbidden',
            message: 'Only admins may change role',
          });
        }
        data.role = req.body.role === 'ADMIN' ? 'ADMIN' : 'MANAGER';
      }

      if (req.body.status !== undefined) {
        if (!isAdmin) {
          return reply.code(403).send({
            statusCode: 403,
            error: 'Forbidden',
            message: 'Only admins may change status',
          });
        }
        data.status = req.body.status === 'DISABLED' ? 'DISABLED' : 'ACTIVE';
      }

      // Re-check that the schema actually gave us something to update.
      // (The schema enforces minProperties:1, but a self-update with only
      //  an admin-only field gets silently stripped — surface that as 400.)
      if (Object.keys(data).length === 0) {
        return badRequest(
          reply,
          'No permitted fields to update for this user',
        );
      }

      const updated = await prisma.user.update({
        where: { id: targetId },
        data,
        select: PUBLIC_USER_SELECT,
      });
      return reply.send(updated);
    },
  );

  // ── DELETE /users/:id ────────────────────────────────────────────────────
  // Soft delete: flip status to DISABLED. Refuse if the caller is deleting
  // themselves — admins shouldn't be able to lock themselves out.
  app.delete<{ Params: { id: number } }>(
    '/users/:id',
    {
      preHandler: [requireAuth, requireRole('ADMIN')],
      schema: { params: idParamsSchema },
    },
    async (req, reply) => {
      if (req.user === undefined) {
        return reply.code(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Authentication required',
        });
      }

      const targetId = req.params.id;

      if (req.user.sub === targetId) {
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'You cannot delete your own account',
        });
      }

      const existing = await prisma.user.findUnique({
        where: { id: targetId },
        select: { id: true, status: true },
      });
      if (existing === null) {
        return notFound(reply, `User ${targetId} not found`);
      }

      if (existing.status === 'DISABLED') {
        // Already disabled — return current row, idempotent.
        const row = await prisma.user.findUnique({
          where: { id: targetId },
          select: PUBLIC_USER_SELECT,
        });
        return reply.send(row);
      }

      const updated = await prisma.user.update({
        where: { id: targetId },
        data: { status: 'DISABLED' },
        select: PUBLIC_USER_SELECT,
      });
      return reply.send(updated);
    },
  );
}