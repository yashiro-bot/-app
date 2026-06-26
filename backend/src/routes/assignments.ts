// Customer ↔ Manager assignment routes.
//
//   GET    /assignments                              — admin only, list assignments
//                                                    (filter: managerId?, customerId?, pagination)
//   GET    /assignments/managers/:managerId/customers — auth (manager: own; admin: any)
//                                                    — list customers of a manager + assignedAt
//   GET    /assignments/customers/:customerId/managers — admin only
//                                                    — list managers of a customer + assignedAt
//   POST   /assignments                              — admin only, BATCH upsert
//                                                    body: {managerId, customerIds: number[]}
//                                                    → {assigned, alreadyAssigned, errors:[]}
//   DELETE /assignments/:id                          — admin only, remove a single row
//   DELETE /assignments/batch                        — admin only
//                                                    body: {managerId, customerIds: number[]}
//                                                    → {removed, notFound: number[], errors:[]}
//
// Composite UNIQUE on (managerId, customerId) prevents duplicates at the DB level.
// Batch POST treats already-assigned pairs as `alreadyAssigned`, NOT as errors,
// so admins can re-submit the same payload safely.

import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

// ─── Local helpers ──────────────────────────────────────────────────────────
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

// GET /assignments query
const listQuerySchema = {
  type: 'object',
  properties: {
    managerId: { type: 'integer', minimum: 1 },
    customerId: { type: 'integer', minimum: 1 },
    page: { type: 'integer', minimum: 1, default: 1 },
    pageSize: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
  },
  additionalProperties: false,
} as const;

// Path params for /managers/:managerId/customers
const managerParamsSchema = {
  type: 'object',
  properties: {
    managerId: { type: 'integer', minimum: 1 },
  },
  required: ['managerId'],
} as const;

// Path params for /customers/:customerId/managers
const customerParamsSchema = {
  type: 'object',
  properties: {
    customerId: { type: 'integer', minimum: 1 },
  },
  required: ['customerId'],
} as const;

// Path params for DELETE /:id
const idParamsSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer', minimum: 1 },
  },
  required: ['id'],
} as const;

// POST body — batch assignment
const createBodySchema = {
  type: 'object',
  required: ['managerId', 'customerIds'],
  additionalProperties: false,
  properties: {
    managerId: { type: 'integer', minimum: 1 },
    customerIds: {
      type: 'array',
      minItems: 1,
      maxItems: 500,
      items: { type: 'integer', minimum: 1 },
      uniqueItems: true,
    },
  },
} as const;

// DELETE /batch body
const batchDeleteBodySchema = {
  type: 'object',
  required: ['managerId', 'customerIds'],
  additionalProperties: false,
  properties: {
    managerId: { type: 'integer', minimum: 1 },
    customerIds: {
      type: 'array',
      minItems: 1,
      maxItems: 500,
      items: { type: 'integer', minimum: 1 },
      uniqueItems: true,
    },
  },
} as const;

// ─── Common select shapes ───────────────────────────────────────────────────

// Public assignment row — used by GET /assignments.
const ASSIGNMENT_LIST_SELECT = {
  id: true,
  managerId: true,
  customerId: true,
  assignedAt: true,
  manager: {
    select: { id: true, username: true, name: true },
  },
  customer: {
    select: { id: true, code: true, name: true, address: true },
  },
} as const;

// User (manager) projection for the customer-side listing.
const USER_PUBLIC_SELECT = {
  id: true,
  username: true,
  name: true,
  role: true,
  status: true,
} as const;

// Customer projection for the manager-side listing. Mirrors the columns
// exposed by /customers (everything except lat/lng which the assignment view
// doesn't need — keeps the payload tight).
const CUSTOMER_ASSIGNMENT_SELECT = {
  id: true,
  code: true,
  name: true,
  address: true,
  contact: true,
  phone: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

// ─── Route registration ─────────────────────────────────────────────────────
export async function registerAssignmentRoutes(
  app: FastifyInstance,
): Promise<void> {
  // ── GET /assignments ─────────────────────────────────────────────────────
  // Admin-only assignment directory with optional manager/customer filters.
  // Returns the full CustomerAssignment rows (with nested manager & customer
  // summaries) so the admin UI can render a "who covers whom" table.
  app.get<{
    Querystring: {
      managerId?: number;
      customerId?: number;
      page?: number;
      pageSize?: number;
    };
  }>(
    '/assignments',
    {
      preHandler: [requireAuth, requireRole('ADMIN')],
      schema: { querystring: listQuerySchema },
    },
    async (req, reply) => {
      const page = req.query.page ?? 1;
      const pageSize = req.query.pageSize ?? 50;

      const where: Prisma.CustomerAssignmentWhereInput = {
        ...(req.query.managerId !== undefined
          ? { managerId: req.query.managerId }
          : {}),
        ...(req.query.customerId !== undefined
          ? { customerId: req.query.customerId }
          : {}),
      };

      const [data, total] = await Promise.all([
        prisma.customerAssignment.findMany({
          where,
          select: ASSIGNMENT_LIST_SELECT,
          orderBy: [
            { managerId: 'asc' },
            { customerId: 'asc' },
          ],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.customerAssignment.count({ where }),
      ]);

      return reply.send({ data, total, page, pageSize });
    },
  );

  // ── GET /assignments/managers/:managerId/customers ────────────────────────
  // Managers see only their own list (managerId in URL must equal self).
  // Admins can list any manager's customers.
  // Returns Customer[] with each row enriched with the assignment `assignedAt`
  // (NOT a CustomerAssignment[] — the spec asked for the customer list).
  app.get<{ Params: { managerId: number } }>(
    '/assignments/managers/:managerId/customers',
    {
      preHandler: [requireAuth],
      schema: { params: managerParamsSchema },
    },
    async (req, reply) => {
      if (req.user === undefined) {
        return reply.code(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Authentication required',
        });
      }
      const { managerId } = req.params;

      const isAdmin = req.user.role === 'ADMIN';
      const isSelf = req.user.sub === managerId;
      if (!isAdmin && !isSelf) {
        return reply.code(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: 'Managers may only view their own assignments',
        });
      }

      // 404 if the manager doesn't exist (or is soft-deleted).
      const manager = await prisma.user.findUnique({
        where: { id: managerId },
        select: { id: true },
      });
      if (manager === null) {
        return notFound(reply, `Manager ${managerId} not found`);
      }

      // Pull every assignment for this manager, then merge the customer data
      // in a single follow-up query. Cheaper than a join for our row counts
      // (each manager has at most a few hundred customers).
      const links = await prisma.customerAssignment.findMany({
        where: { managerId },
        select: { customerId: true, assignedAt: true },
        orderBy: [{ customerId: 'asc' }],
      });

      if (links.length === 0) {
        return reply.send({ data: [], total: 0 });
      }

      const customerIds = links.map((l) => l.customerId);
      const customers = await prisma.customer.findMany({
        where: { id: { in: customerIds } },
        select: CUSTOMER_ASSIGNMENT_SELECT,
      });

      // Index assignedAt by customerId for O(1) merge.
      const assignedAtByCustomer = new Map<number, Date>();
      for (const link of links) {
        assignedAtByCustomer.set(link.customerId, link.assignedAt);
      }

      const data = customers.map((c) => ({
        ...c,
        assignedAt: (
          assignedAtByCustomer.get(c.id) as Date
        ).toISOString(),
      }));

      return reply.send({ data, total: data.length });
    },
  );

  // ── GET /assignments/customers/:customerId/managers ───────────────────────
  // Admin-only: "who is assigned to this customer?"
  app.get<{ Params: { customerId: number } }>(
    '/assignments/customers/:customerId/managers',
    {
      preHandler: [requireAuth, requireRole('ADMIN')],
      schema: { params: customerParamsSchema },
    },
    async (req, reply) => {
      const { customerId } = req.params;

      const customer = await prisma.customer.findUnique({
        where: { id: customerId },
        select: { id: true },
      });
      if (customer === null) {
        return notFound(reply, `Customer ${customerId} not found`);
      }

      const links = await prisma.customerAssignment.findMany({
        where: { customerId },
        select: { managerId: true, assignedAt: true },
        orderBy: [{ managerId: 'asc' }],
      });

      if (links.length === 0) {
        return reply.send({ data: [], total: 0 });
      }

      const managerIds = links.map((l) => l.managerId);
      const managers = await prisma.user.findMany({
        where: { id: { in: managerIds } },
        select: USER_PUBLIC_SELECT,
      });

      const assignedAtByManager = new Map<number, Date>();
      for (const link of links) {
        assignedAtByManager.set(link.managerId, link.assignedAt);
      }

      const data = managers.map((m) => ({
        ...m,
        assignedAt: (
          assignedAtByManager.get(m.id) as Date
        ).toISOString(),
      }));

      return reply.send({ data, total: data.length });
    },
  );

  // ── POST /assignments ────────────────────────────────────────────────────
  // Batch upsert. For each customerId:
  //   - manager exists? → 404 (we 404 upfront before touching any rows)
  //   - customer exists? → 404 (same)
  //   - already assigned? → count as alreadyAssigned (no error)
  //   - not assigned? → create row, count as assigned
  //
  // We do NOT use deep nested transactions; each upsert is independent and
  // P2002 collisions on the composite unique are caught and counted.
  app.post<{
    Body: {
      managerId: number;
      customerIds: number[];
    };
  }>(
    '/assignments',
    {
      preHandler: [requireAuth, requireRole('ADMIN')],
      schema: { body: createBodySchema },
    },
    async (req, reply) => {
      const { managerId, customerIds } = req.body;

      // Validate manager + customers up front — 404 if any is missing,
      // before we touch any DB row.
      const [manager, customers] = await Promise.all([
        prisma.user.findUnique({
          where: { id: managerId },
          select: { id: true, status: true, role: true },
        }),
        prisma.customer.findMany({
          where: { id: { in: customerIds } },
          select: { id: true },
        }),
      ]);

      if (manager === null) {
        return notFound(reply, `Manager ${managerId} not found`);
      }
      if (manager.role !== 'MANAGER' && manager.role !== 'ADMIN') {
        // Defense in depth — the enum prevents other roles, but if a future
        // enum addition slips through, fail fast.
        return badRequest(
          reply,
          `User ${managerId} is not assignable as a manager`,
        );
      }

      const foundIds = new Set<number>(customers.map((c) => c.id));
      const missing = customerIds.filter((id) => !foundIds.has(id));
      if (missing.length > 0) {
        return notFound(
          reply,
          `Customer(s) not found: ${missing.join(', ')}`,
        );
      }

      let assigned = 0;
      let alreadyAssigned = 0;
      const errors: { customerId: number; reason: string }[] = [];

      // Pre-compute which pairs already exist so the response counters are
      // deterministic — no reliance on wall-clock heuristics. The composite
      // UNIQUE still protects against concurrent writes via the create's
      // P2002 catch below.
      const existing = await prisma.customerAssignment.findMany({
        where: { managerId, customerId: { in: customerIds } },
        select: { customerId: true },
      });
      const existingSet = new Set<number>(existing.map((e) => e.customerId));

      for (const customerId of customerIds) {
        if (existingSet.has(customerId)) {
          alreadyAssigned += 1;
          continue;
        }
        try {
          await prisma.customerAssignment.create({
            data: { managerId, customerId },
            select: { id: true },
          });
          assigned += 1;
          existingSet.add(customerId);
        } catch (err: unknown) {
          if (
            err instanceof Prisma.PrismaClientKnownRequestError &&
            err.code === 'P2002'
          ) {
            // Race: another caller inserted the same (managerId, customerId)
            // between our findMany and create. Count as alreadyAssigned.
            alreadyAssigned += 1;
            existingSet.add(customerId);
            continue;
          }
          let reason = 'unknown error';
          if (err instanceof Prisma.PrismaClientKnownRequestError) {
            reason = `database error ${err.code}`;
          } else if (err instanceof Error) {
            reason = err.message;
          }
          errors.push({ customerId, reason });
        }
      }

      return reply.code(200).send({
        assigned,
        alreadyAssigned,
        errors,
      });
    },
  );

  // ── DELETE /assignments/:id ──────────────────────────────────────────────
  // Admin-only single-row removal. 404 if the row doesn't exist.
  app.delete<{ Params: { id: number } }>(
    '/assignments/:id',
    {
      preHandler: [requireAuth, requireRole('ADMIN')],
      schema: { params: idParamsSchema },
    },
    async (req, reply) => {
      const { id } = req.params;
      const existing = await prisma.customerAssignment.findUnique({
        where: { id },
        select: { id: true },
      });
      if (existing === null) {
        return notFound(reply, `Assignment ${id} not found`);
      }
      await prisma.customerAssignment.delete({ where: { id } });
      return reply.code(200).send({ id, deleted: true });
    },
  );

  // ── DELETE /assignments/batch ────────────────────────────────────────────
  // Admin-only batch removal by (managerId, customerId[]). Idempotent —
  // missing pairs go into `notFound` rather than failing the whole call.
  app.delete<{
    Body: {
      managerId: number;
      customerIds: number[];
    };
  }>(
    '/assignments/batch',
    {
      preHandler: [requireAuth, requireRole('ADMIN')],
      schema: { body: batchDeleteBodySchema },
    },
    async (req, reply) => {
      const { managerId, customerIds } = req.body;

      // Validate manager exists (404 up front) — customers are not required,
      // since removing an assignment to a deleted-customer row is a no-op.
      const manager = await prisma.user.findUnique({
        where: { id: managerId },
        select: { id: true },
      });
      if (manager === null) {
        return notFound(reply, `Manager ${managerId} not found`);
      }

      // Find which of the requested (managerId, customerId) pairs actually
      // exist so we can delete them in one shot and report which were absent.
      const existing = await prisma.customerAssignment.findMany({
        where: {
          managerId,
          customerId: { in: customerIds },
        },
        select: { id: true, customerId: true },
      });

      const existingCustomerIds = new Set<number>(
        existing.map((e) => e.customerId),
      );
      const missingCustomerIds = customerIds.filter(
        (cid) => !existingCustomerIds.has(cid),
      );

      let removed = 0;
      const errors: { customerId: number; reason: string }[] = [];

      if (existing.length > 0) {
        try {
          const result = await prisma.customerAssignment.deleteMany({
            where: {
              id: { in: existing.map((e) => e.id) },
            },
          });
          removed = result.count;
        } catch (err: unknown) {
          let reason = 'unknown error';
          if (err instanceof Prisma.PrismaClientKnownRequestError) {
            reason = `database error ${err.code}`;
          } else if (err instanceof Error) {
            reason = err.message;
          }
          // If the deleteMany itself blew up, report one error per row that
          // we tried to remove so the caller can retry individually.
          for (const e of existing) {
            errors.push({ customerId: e.customerId, reason });
          }
        }
      }

      return reply.code(200).send({
        removed,
        notFound: missingCustomerIds,
        errors,
      });
    },
  );
}