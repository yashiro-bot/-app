// CigarSpec CRUD routes.
//
//   GET    /cigar-specs           — list (auth: any role)
//   GET    /cigar-specs/categories — distinct categories (auth: any role)
//   GET    /cigar-specs/:id       — single spec (auth: any role)
//   POST   /cigar-specs           — create (auth: ADMIN)
//   PATCH  /cigar-specs/:id       — partial update (auth: ADMIN, code immutable)
//   DELETE /cigar-specs/:id       — SOFT delete → status=DISABLED (auth: ADMIN)
//
// Hard delete is intentionally NOT exposed; soft delete preserves the
// audit trail and keeps foreign keys from CollectionDetail valid.
//
// Codes are immutable business keys — once a CIGAR-### code is issued,
// it cannot be renamed. If you need a different label, disable the old
// row and create a new one.

import type { FastifyInstance } from 'fastify';
import {
  Prisma,
  type CigarSpec,
  type CigarSpecStatus,
} from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

// ─── Reusable 409 helper ────────────────────────────────────────────────────
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

// ─── JSON schemas for Fastify validation ────────────────────────────────────
// Fastify consumes these objects directly; `as const` would freeze them and
// the readonly tuple type is rejected by Ajv v8. Plain literals are required.
const STATUS_VALUES: ReadonlyArray<string> = ['ACTIVE', 'DISABLED'];
type StatusLiteral = 'ACTIVE' | 'DISABLED';

// Query schema for GET /cigar-specs
const listQuerySchema = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: [...STATUS_VALUES] },
    category: { type: 'string', minLength: 1, maxLength: 64 },
  },
  additionalProperties: false,
};

// Params schema for :id
const idParamsSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer', minimum: 1 },
  },
  required: ['id'],
};

// POST body schema
const createBodySchema = {
  type: 'object',
  required: ['code', 'name', 'category'],
  additionalProperties: false,
  properties: {
    code: { type: 'string', minLength: 1, maxLength: 64 },
    name: { type: 'string', minLength: 1, maxLength: 128 },
    category: { type: 'string', minLength: 1, maxLength: 64 },
    unitPerBox: { type: 'integer', minimum: 1, maximum: 10000 },
    sortOrder: { type: 'integer', minimum: 0, maximum: 1_000_000 },
  },
};

// PATCH body schema — every field optional, code is intentionally absent
const patchBodySchema = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 128 },
    category: { type: 'string', minLength: 1, maxLength: 64 },
    unitPerBox: { type: 'integer', minimum: 1, maximum: 10000 },
    sortOrder: { type: 'integer', minimum: 0, maximum: 1_000_000 },
    status: { type: 'string', enum: [...STATUS_VALUES] },
  },
};

// Response shape for CigarSpec row (with derived totalInUse).
// Derived count is computed server-side and never persisted.
type CigarSpecWithUsage = CigarSpec & { totalInUse: number };

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Return every CigarSpec that matches the filters, sorted by sortOrder asc
 * with a derived `totalInUse` count. Uses `_count.select` on the relation
 * so the count is computed in the DB (single round-trip per row family).
 * The Prisma internal `_count` envelope is stripped from the output.
 */
async function loadSpecs(opts: {
  status?: CigarSpecStatus;
  category?: string;
}): Promise<ReadonlyArray<CigarSpecWithUsage>> {
  const rows = await prisma.cigarSpec.findMany({
    where: {
      status: opts.status,
      category: opts.category,
    },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    include: {
      _count: {
        select: { details: true },
      },
    },
  });
  return rows.map((r) => {
    const { _count, ...rest } = r;
    void _count;
    return { ...rest, totalInUse: r._count.details };
  });
}

async function loadSpecById(id: number): Promise<CigarSpecWithUsage | null> {
  const row = await prisma.cigarSpec.findUnique({
    where: { id },
    include: {
      _count: { select: { details: true } },
    },
  });
  if (row === null) return null;
  const { _count, ...rest } = row;
  void _count;
  return { ...rest, totalInUse: row._count.details };
}

// ─── Route registration ─────────────────────────────────────────────────────
export async function registerCigarSpecRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /cigar-specs/categories ──────────────────────────────────────────
  // NOTE: must be registered BEFORE /cigar-specs/:id, otherwise ":id" would
  // happily capture the literal "categories" and 400 on the int parse.
  app.get(
    '/cigar-specs/categories',
    { preHandler: requireAuth },
    async (_req, reply) => {
      // Group distinct category values that actually have at least one row.
      // We pull all distinct categories (active + disabled) so admins can
      // still see categories whose specs were soft-deleted; otherwise the
      // category list would silently shrink over time.
      const grouped = await prisma.cigarSpec.groupBy({
        by: ['category'],
        _count: { _all: true },
        orderBy: { category: 'asc' },
      });
      const categories = grouped.map((g) => g.category);
      return reply.send({ categories });
    },
  );

  // ── GET /cigar-specs ─────────────────────────────────────────────────────
  app.get<{ Querystring: { status?: string; category?: string } }>(
    '/cigar-specs',
    {
      preHandler: requireAuth,
      schema: { querystring: listQuerySchema },
    },
    async (req, reply) => {
      const statusRaw = (req.query.status ?? 'ACTIVE') as StatusLiteral;
      const status: CigarSpecStatus =
        statusRaw === 'DISABLED' ? 'DISABLED' : 'ACTIVE';
      const category =
        typeof req.query.category === 'string' && req.query.category !== ''
          ? req.query.category
          : undefined;

      const specs = await loadSpecs({ status, category });
      return reply.send(specs);
    },
  );

  // ── GET /cigar-specs/:id ─────────────────────────────────────────────────
  app.get<{ Params: { id: number } }>(
    '/cigar-specs/:id',
    {
      preHandler: requireAuth,
      schema: { params: idParamsSchema },
    },
    async (req, reply) => {
      const spec = await loadSpecById(req.params.id);
      if (spec === null) {
        return notFound(reply, `CigarSpec ${req.params.id} not found`);
      }
      return reply.send(spec);
    },
  );

  // ── POST /cigar-specs ────────────────────────────────────────────────────
  app.post<{
    Body: {
      code: string;
      name: string;
      category: string;
      unitPerBox?: number;
      sortOrder?: number;
    };
  }>(
    '/cigar-specs',
    {
      preHandler: [requireAuth, requireRole('ADMIN')],
      schema: { body: createBodySchema },
    },
    async (req, reply) => {
      const { code, name, category, unitPerBox, sortOrder } = req.body;

      try {
        const created = await prisma.cigarSpec.create({
          data: {
            code,
            name,
            category,
            // Apply schema defaults when callers omit these.
            unitPerBox: unitPerBox ?? 25,
            sortOrder: sortOrder ?? 0,
          },
        });
        return reply.code(201).send({ ...created, totalInUse: 0 });
      } catch (err: unknown) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          return conflict(reply, `CigarSpec code already exists: ${code}`);
        }
        throw err;
      }
    },
  );

  // ── PATCH /cigar-specs/:id ───────────────────────────────────────────────
  app.patch<{
    Params: { id: number };
    Body: {
      name?: string;
      category?: string;
      unitPerBox?: number;
      sortOrder?: number;
      status?: StatusLiteral;
    };
  }>(
    '/cigar-specs/:id',
    {
      preHandler: [requireAuth, requireRole('ADMIN')],
      schema: { params: idParamsSchema, body: patchBodySchema },
    },
    async (req, reply) => {
      const id = req.params.id;
      const existing = await prisma.cigarSpec.findUnique({ where: { id } });
      if (existing === null) {
        return notFound(reply, `CigarSpec ${id} not found`);
      }

      // Build the update payload from the validated body. The schema
      // forbids `code`, so there's no way for a client to slip one in.
      const data: Prisma.CigarSpecUpdateInput = {};
      if (req.body.name !== undefined) data.name = req.body.name;
      if (req.body.category !== undefined) data.category = req.body.category;
      if (req.body.unitPerBox !== undefined) data.unitPerBox = req.body.unitPerBox;
      if (req.body.sortOrder !== undefined) data.sortOrder = req.body.sortOrder;
      if (req.body.status !== undefined) {
        data.status = req.body.status === 'DISABLED' ? 'DISABLED' : 'ACTIVE';
      }

      const updated = await prisma.cigarSpec.update({
        where: { id },
        data,
        include: { _count: { select: { details: true } } },
      });
      const { _count, ...rest } = updated;
      void _count;
      return reply.send({ ...rest, totalInUse: updated._count.details });
    },
  );

  // ── DELETE /cigar-specs/:id ──────────────────────────────────────────────
  // Soft delete: flip status to DISABLED. Refuse (409) if any
  // CollectionDetail still references this spec — those rows would
  // become orphaned in the UI otherwise.
  app.delete<{ Params: { id: number } }>(
    '/cigar-specs/:id',
    {
      preHandler: [requireAuth, requireRole('ADMIN')],
      schema: { params: idParamsSchema },
    },
    async (req, reply) => {
      const id = req.params.id;
      const existing = await prisma.cigarSpec.findUnique({
        where: { id },
        include: { _count: { select: { details: true } } },
      });
      if (existing === null) {
        return notFound(reply, `CigarSpec ${id} not found`);
      }

      if (existing._count.details > 0) {
        return conflict(
          reply,
          `CigarSpec ${id} is referenced by ${existing._count.details} collection detail(s) and cannot be deleted`,
        );
      }

      if (existing.status === 'DISABLED') {
        // Already soft-deleted — treat as a successful no-op so retries
        // from the admin UI are idempotent.
        const { _count, ...rest } = existing;
        void _count;
        return reply.send({ ...rest, totalInUse: existing._count.details });
      }

      const updated = await prisma.cigarSpec.update({
        where: { id },
        data: { status: 'DISABLED' },
        include: { _count: { select: { details: true } } },
      });
      const { _count, ...rest } = updated;
      void _count;
      return reply.send({ ...rest, totalInUse: updated._count.details });
    },
  );
}
