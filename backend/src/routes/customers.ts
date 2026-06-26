// Customer (零售户) CRUD routes.
//
//   GET    /customers      — list (MANAGER: only assigned; ADMIN: all)
//   GET    /customers/:id  — single customer (must be assigned manager or ADMIN)
//   POST   /customers      — create, ADMIN only. Auto-geocode if address + no lat/lng
//   PATCH  /customers/:id  — partial update, ADMIN only. Re-geocode on address change
//   DELETE /customers/:id  — SOFT delete (status=DISABLED), ADMIN only
//
// Soft delete is intentional: historical Collection rows reference Customer and
// must remain readable for the admin reports.
//
// Search box runs `contains` against code/name/address (SQLite is
// case-insensitive for ASCII; MySQL collation follows the column charset).
//
// Manager scoping: `MANAGER` users can only see customers they're explicitly
// assigned to via the CustomerAssignment join table. Admins see everything
// regardless of assignments.

import type { FastifyInstance } from 'fastify';
import { Prisma, type CustomerStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { geocode } from '../lib/amap.js';

// ─── Local helpers ──────────────────────────────────────────────────────────
function notFound(reply: import('fastify').FastifyReply, message: string) {
  return reply.code(404).send({
    statusCode: 404,
    error: 'Not Found',
    message,
  });
}

function conflict(reply: import('fastify').FastifyReply, message: string) {
  return reply.code(409).send({
    statusCode: 409,
    error: 'Conflict',
    message,
  });
}

function forbidden(reply: import('fastify').FastifyReply, message: string) {
  return reply.code(403).send({
    statusCode: 403,
    error: 'Forbidden',
    message,
  });
}

const STATUS_VALUES = ['ACTIVE', 'DISABLED'] as const;
type StatusLiteral = (typeof STATUS_VALUES)[number];

// ─── JSON schemas ───────────────────────────────────────────────────────────

const listQuerySchema = {
  type: 'object',
  properties: {
    page: { type: 'integer', minimum: 1, default: 1 },
    pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    status: { type: 'string', enum: [...STATUS_VALUES] },
    search: { type: 'string', minLength: 1, maxLength: 128 },
  },
  additionalProperties: false,
} as const;

const idParamsSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer', minimum: 1 },
  },
  required: ['id'],
} as const;

const createBodySchema = {
  type: 'object',
  required: ['code', 'name'],
  additionalProperties: false,
  properties: {
    code: { type: 'string', minLength: 1, maxLength: 64 },
    name: { type: 'string', minLength: 1, maxLength: 128 },
    address: { type: 'string', maxLength: 256 },
    contact: { type: 'string', maxLength: 64 },
    phone: { type: 'string', maxLength: 32 },
    lat: { type: 'number', minimum: -90, maximum: 90 },
    lng: { type: 'number', minimum: -180, maximum: 180 },
    status: { type: 'string', enum: [...STATUS_VALUES] },
  },
} as const;

const patchBodySchema = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 128 },
    address: { type: 'string', maxLength: 256 },
    contact: { type: 'string', maxLength: 64 },
    phone: { type: 'string', maxLength: 32 },
    lat: { type: 'number', minimum: -90, maximum: 90 },
    lng: { type: 'number', minimum: -180, maximum: 180 },
    status: { type: 'string', enum: [...STATUS_VALUES] },
  },
} as const;

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Build the Prisma `where` filter shared by GET /customers and the row count.
 * `managerId` is set for MANAGER-role callers; ADMIN callers pass undefined
 * and the assignment filter is skipped (admins see all customers).
 */
function buildListWhere(
  role: 'ADMIN' | 'MANAGER',
  managerId: number | undefined,
  status: CustomerStatus | undefined,
  search: string | undefined,
): Prisma.CustomerWhereInput {
  const where: Prisma.CustomerWhereInput = {
    ...(status !== undefined ? { status } : {}),
    ...(search !== undefined
      ? {
          OR: [
            { code: { contains: search } },
            { name: { contains: search } },
            { address: { contains: search } },
          ],
        }
      : {}),
  };

  if (role === 'MANAGER' && managerId !== undefined) {
    // Restrict to assigned customers. We can't combine a top-level `assignees`
    // relation filter with `OR` cleanly because Prisma lifts relation filters
    // out of the OR scope; use AND on the outer object.
    where.assignments = {
      some: { managerId },
    };
  }

  return where;
}

/**
 * Throw 403 unless the caller is ADMIN or the given managerId is assigned
 * to the customer. Returns true on allowed, sends the error reply and returns
 * false on denied. ADMIN always passes.
 */
async function assertCanAccessCustomer(
  reply: import('fastify').FastifyReply,
  customerId: number,
  role: 'ADMIN' | 'MANAGER',
  managerId: number | undefined,
): Promise<boolean> {
  if (role === 'ADMIN') return true;
  if (managerId === undefined) return false;

  const link = await prisma.customerAssignment.findUnique({
    where: {
      managerId_customerId: { managerId, customerId },
    },
    select: { managerId: true },
  });
  if (link === null) {
    forbidden(reply, 'You are not assigned to this customer');
    return false;
  }
  return true;
}

// ─── Route registration ─────────────────────────────────────────────────────
export async function registerCustomerRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /customers ────────────────────────────────────────────────────────
  app.get<{
    Querystring: {
      page?: number;
      pageSize?: number;
      status?: string;
      search?: string;
    };
  }>(
    '/customers',
    {
      preHandler: [requireAuth],
      schema: { querystring: listQuerySchema },
    },
    async (req, reply) => {
      if (req.user === undefined) {
        return reply.code(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Authentication required',
        });
      }

      const page = req.query.page ?? 1;
      const pageSize = req.query.pageSize ?? 20;

      const status: CustomerStatus | undefined =
        req.query.status === 'ACTIVE' || req.query.status === 'DISABLED'
          ? req.query.status
          : undefined;

      const search =
        typeof req.query.search === 'string' && req.query.search !== ''
          ? req.query.search
          : undefined;

      const where = buildListWhere(
        req.user.role,
        req.user.sub,
        status,
        search,
      );

      const [data, total] = await Promise.all([
        prisma.customer.findMany({
          where,
          orderBy: [{ id: 'asc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.customer.count({ where }),
      ]);

      return reply.send({ data, total, page, pageSize });
    },
  );

  // ── GET /customers/:id ───────────────────────────────────────────────────
  app.get<{ Params: { id: number } }>(
    '/customers/:id',
    {
      preHandler: [requireAuth],
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

      const customer = await prisma.customer.findUnique({
        where: { id: req.params.id },
      });
      if (customer === null) {
        return notFound(reply, `Customer ${req.params.id} not found`);
      }

      const allowed = await assertCanAccessCustomer(
        reply,
        customer.id,
        req.user.role,
        req.user.sub,
      );
      if (!allowed) return reply;

      return reply.send(customer);
    },
  );

  // ── POST /customers ──────────────────────────────────────────────────────
  app.post<{
    Body: {
      code: string;
      name: string;
      address?: string;
      contact?: string;
      phone?: string;
      lat?: number;
      lng?: number;
      status?: StatusLiteral;
    };
  }>(
    '/customers',
    {
      preHandler: [requireAuth, requireRole('ADMIN')],
      schema: { body: createBodySchema },
    },
    async (req, reply) => {
      const { code, name, address, contact, phone, lat, lng, status } = req.body;

      // Auto-geocode when an address is given but explicit lat/lng are absent.
      let resolvedLat: number | null = typeof lat === 'number' ? lat : null;
      let resolvedLng: number | null = typeof lng === 'number' ? lng : null;
      if (
        resolvedLat === null &&
        resolvedLng === null &&
        typeof address === 'string' &&
        address.trim() !== ''
      ) {
        const point = await geocode(address);
        if (point !== null) {
          resolvedLat = point.lat;
          resolvedLng = point.lng;
        }
      }

      try {
        const created = await prisma.customer.create({
          data: {
            code,
            name,
            address: address ?? null,
            contact: contact ?? null,
            phone: phone ?? null,
            lat: resolvedLat,
            lng: resolvedLng,
            status: status === 'DISABLED' ? 'DISABLED' : 'ACTIVE',
          },
        });
        return reply.code(201).send(created);
      } catch (err: unknown) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          return conflict(reply, `Customer code already exists: ${code}`);
        }
        throw err;
      }
    },
  );

  // ── PATCH /customers/:id ─────────────────────────────────────────────────
  app.patch<{
    Params: { id: number };
    Body: {
      name?: string;
      address?: string;
      contact?: string;
      phone?: string;
      lat?: number;
      lng?: number;
      status?: StatusLiteral;
    };
  }>(
    '/customers/:id',
    {
      preHandler: [requireAuth, requireRole('ADMIN')],
      schema: { params: idParamsSchema, body: patchBodySchema },
    },
    async (req, reply) => {
      const id = req.params.id;
      const existing = await prisma.customer.findUnique({ where: { id } });
      if (existing === null) {
        return notFound(reply, `Customer ${id} not found`);
      }

      const data: Prisma.CustomerUpdateInput = {};

      if (req.body.name !== undefined) data.name = req.body.name;
      if (req.body.contact !== undefined) data.contact = req.body.contact;
      if (req.body.phone !== undefined) data.phone = req.body.phone;
      if (req.body.status !== undefined) {
        data.status = req.body.status === 'DISABLED' ? 'DISABLED' : 'ACTIVE';
      }

      // Address + lat/lng handling:
      //   - Address updated → re-geocode (overwrites lat/lng unless caller also
      //     provided explicit lat/lng in the same PATCH).
      //   - Address unchanged → accept explicit lat/lng as a manual override.
      let addressChanged = false;
      if (req.body.address !== undefined) {
        data.address = req.body.address;
        if (req.body.address !== existing.address) addressChanged = true;
      }
      if (req.body.lat !== undefined) data.lat = req.body.lat;
      if (req.body.lng !== undefined) data.lng = req.body.lng;

      const latProvided = req.body.lat !== undefined;
      const lngProvided = req.body.lng !== undefined;
      const bothLatLngProvided = latProvided && lngProvided;

      if (addressChanged && !bothLatLngProvided) {
        const newAddress =
          req.body.address !== undefined ? req.body.address : existing.address;
        if (newAddress !== null && newAddress.trim() !== '') {
          const point = await geocode(newAddress);
          if (point !== null) {
            data.lat = point.lat;
            data.lng = point.lng;
          }
        }
      }

      if (Object.keys(data).length === 0) {
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'No permitted fields to update',
        });
      }

      const updated = await prisma.customer.update({ where: { id }, data });
      return reply.send(updated);
    },
  );

  // ── DELETE /customers/:id ────────────────────────────────────────────────
  app.delete<{ Params: { id: number } }>(
    '/customers/:id',
    {
      preHandler: [requireAuth, requireRole('ADMIN')],
      schema: { params: idParamsSchema },
    },
    async (req, reply) => {
      const id = req.params.id;
      const existing = await prisma.customer.findUnique({
        where: { id },
        select: { id: true, status: true },
      });
      if (existing === null) {
        return notFound(reply, `Customer ${id} not found`);
      }

      if (existing.status === 'DISABLED') {
        // Idempotent — already soft-deleted, return current row.
        const row = await prisma.customer.findUnique({ where: { id } });
        return reply.send(row);
      }

      const updated = await prisma.customer.update({
        where: { id },
        data: { status: 'DISABLED' },
      });
      return reply.send(updated);
    },
  );
}