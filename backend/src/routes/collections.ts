// Collection (visit) record routes.
//
//   GET    /collections     — paginated list with filters
//                             (managerId?, customerId?, fromDate?, toDate?, isVerified?)
//   GET    /collections/:id — single visit with nested customer/manager/details
//                             (manager must own OR be ADMIN)
//   POST   /collections     — create visit + line items in a single transaction.
//                             `clientUuid` is the mobile app's idempotency key
//                             — replaying the same payload returns the existing
//                             record with HTTP 200, never 409. This is what the
//                             offline-first mobile client relies on when it
//                             retries after a network failure.
//   DELETE /collections/:id — ADMIN-only hard delete (cascade to CollectionDetail)
//
// Authorization:
//   - MANAGER: sees only their own collections. POST is rejected with 403 if
//     the target customer is not assigned to them.
//   - ADMIN: sees all collections, can create on behalf of any manager
//     (managerId always defaults to the caller's JWT sub — there is no
//     `managerId` field in the POST body), and can hard-delete any record.
//
// GPS verification:
//   distanceToCustomerM = haversineDistance(customer.lat, customer.lng,
//                                           gpsLat,     gpsLng)
//   isVerified = distance != null && !isNaN(distance) && distance < 100
//   If the customer has no geocoded coords yet (lat/lng null), distance is
//   stored as null and isVerified stays false. This matches the spec's
//   "现场盘点确认" gate: the admin dashboard flags unverified visits.
//
// `photoUrls` is stored as a JSON-encoded TEXT string (SQLite has no JSON
// type). Every response path parses it back to string[] for the API contract.

import type { FastifyInstance, FastifyReply } from 'fastify';
import { Prisma, type Prisma as PrismaTypes } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { haversineDistance } from '../lib/geo.js';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Under this radius (meters) a visit counts as "现场盘点确认" verified. */
const VERIFICATION_RADIUS_M = 100;

// ─── Error helpers ──────────────────────────────────────────────────────────

function notFound(reply: FastifyReply, message: string) {
  return reply.code(404).send({ statusCode: 404, error: 'Not Found', message });
}

function badRequest(reply: FastifyReply, message: string) {
  return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message });
}

function forbidden(reply: FastifyReply, message: string) {
  return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message });
}

// ─── Photo URL parsing ──────────────────────────────────────────────────────

/** Parse the DB-stored JSON-encoded photoUrls back into string[]. */
function parsePhotoUrls(stored: string): string[] {
  if (stored === '') return [];
  try {
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    return [];
  }
}

// ─── JSON schemas for Fastify validation ────────────────────────────────────

// GET /collections query
const listQuerySchema = {
  type: 'object',
  properties: {
    page: { type: 'integer', minimum: 1, default: 1 },
    pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    managerId: { type: 'integer', minimum: 1 },
    customerId: { type: 'integer', minimum: 1 },
    fromDate: { type: 'string', minLength: 1, maxLength: 64 },
    toDate: { type: 'string', minLength: 1, maxLength: 64 },
    isVerified: { type: 'boolean' },
  },
  additionalProperties: false,
} as const;

// GET /collections/:id, DELETE /collections/:id
const idParamsSchema = {
  type: 'object',
  properties: { id: { type: 'integer', minimum: 1 } },
  required: ['id'],
  additionalProperties: false,
} as const;

// POST /collections body
const createBodySchema = {
  type: 'object',
  required: [
    'customerId',
    'clientUuid',
    'gpsLat',
    'gpsLng',
    'gpsAccuracy',
    'collectedAt',
    'details',
  ],
  additionalProperties: false,
  properties: {
    customerId: { type: 'integer', minimum: 1 },
    clientUuid: { type: 'string', minLength: 1, maxLength: 128 },
    gpsLat: { type: 'number', minimum: -90, maximum: 90 },
    gpsLng: { type: 'number', minimum: -180, maximum: 180 },
    gpsAccuracy: { type: 'number', minimum: 0, maximum: 100000 },
    photoUrls: {
      type: 'array',
      items: { type: 'string', minLength: 1, maxLength: 1024 },
      maxItems: 20,
    },
    collectedAt: { type: 'string', minLength: 1, maxLength: 64 },
    details: {
      type: 'array',
      minItems: 1,
      maxItems: 200,
      items: {
        type: 'object',
        required: [
          'cigarSpecId',
          'salesQty',
          'actualStockLoose',
          'countedStockLoose',
          'actualStockBoxed',
          'countedStockBoxed',
        ],
        additionalProperties: false,
        properties: {
          cigarSpecId: { type: 'integer', minimum: 1 },
          salesQty: { type: 'integer', minimum: 0, maximum: 1_000_000 },
          actualStockLoose: { type: 'integer', minimum: 0, maximum: 1_000_000 },
          countedStockLoose: { type: 'integer', minimum: 0, maximum: 1_000_000 },
          actualStockBoxed: { type: 'integer', minimum: 0, maximum: 1_000_000 },
          countedStockBoxed: { type: 'integer', minimum: 0, maximum: 1_000_000 },
        },
      },
    },
  },
} as const;

// ─── Select shapes ──────────────────────────────────────────────────────────

// Compact shape for the list view — every Collection row gets:
//   - all scalar columns (except no expansion of photoUrls)
//   - nested customer {id, code, name, address} (NO lat/lng — list is large)
//   - nested manager {id, name}
//   - _count {details}
const COLLECTION_LIST_INCLUDE = {
  customer: { select: { id: true, code: true, name: true, address: true } },
  manager: { select: { id: true, name: true } },
  _count: { select: { details: true } },
} as const;

// Full shape for the detail view — adds lat/lng to customer, username to
// manager, and the full details[] with cigarSpec embedded on each row.
const COLLECTION_DETAIL_INCLUDE = {
  customer: {
    select: { id: true, code: true, name: true, address: true, lat: true, lng: true },
  },
  manager: { select: { id: true, username: true, name: true } },
  details: {
    orderBy: { cigarSpecId: 'asc' },
    include: {
      cigarSpec: {
        select: {
          id: true,
          code: true,
          name: true,
          category: true,
          unitPerBox: true,
        },
      },
    },
  },
} as const;

// ─── Helpers ────────────────────────────────────────────────────────────────

interface DetailInput {
  cigarSpecId: number;
  salesQty: number;
  actualStockLoose: number;
  countedStockLoose: number;
  actualStockBoxed: number;
  countedStockBoxed: number;
}

/**
 * Resolve the distance to customer (meters) and the verified flag.
 *
 * - If either side has no coords (customer not yet geocoded), distance=null.
 * - If haversineDistance returns NaN (bad input), distance=null.
 * - Verified = distance exists AND distance < VERIFICATION_RADIUS_M.
 */
function resolveVerification(
  customerLat: number | null,
  customerLng: number | null,
  gpsLat: number,
  gpsLng: number,
): { distance: number | null; isVerified: boolean } {
  if (customerLat === null || customerLng === null) {
    return { distance: null, isVerified: false };
  }
  const d = haversineDistance(customerLat, customerLng, gpsLat, gpsLng);
  if (Number.isNaN(d)) return { distance: null, isVerified: false };
  return { distance: d, isVerified: d < VERIFICATION_RADIUS_M };
}

/**
 * Sentinel error thrown inside the transaction when one or more cigarSpecIds
 * are unknown. The outer catch translates it into a 400.
 */
class CigarSpecNotFoundError extends Error {
  readonly missing: number[];
  constructor(missing: number[]) {
    super(`CigarSpec(s) not found: ${missing.join(', ')}`);
    this.name = 'CigarSpecNotFoundError';
    this.missing = missing;
  }
}

/**
 * Build the Prisma `where` filter shared by GET /collections and its row count.
 * MANAGER callers are pinned to their own collections — even if they pass
 * `managerId` in the query, it gets overridden to their own sub.
 */
function buildListWhere(
  role: 'ADMIN' | 'MANAGER',
  callerSub: number,
  query: {
    managerId?: number;
    customerId?: number;
    fromDate?: Date;
    toDate?: Date;
    isVerified?: boolean;
  },
): PrismaTypes.CollectionWhereInput {
  const where: PrismaTypes.CollectionWhereInput = {
    ...(role === 'MANAGER' ? { managerId: callerSub } : {}),
    ...(role === 'ADMIN' && query.managerId !== undefined
      ? { managerId: query.managerId }
      : {}),
    ...(query.customerId !== undefined ? { customerId: query.customerId } : {}),
    ...(query.isVerified !== undefined ? { isVerified: query.isVerified } : {}),
  };

  if (query.fromDate !== undefined || query.toDate !== undefined) {
    where.collectedAt = {};
    if (query.fromDate !== undefined) {
      (where.collectedAt as PrismaTypes.DateTimeFilter).gte = query.fromDate;
    }
    if (query.toDate !== undefined) {
      (where.collectedAt as PrismaTypes.DateTimeFilter).lte = query.toDate;
    }
  }

  return where;
}

/**
 * Shape a list-view Collection row for the API response. Strips `_count`
 * (Prisma's relation-count envelope) and parses `photoUrls` JSON back to an
 * array.
 */
function shapeListRow(
  row: PrismaTypes.CollectionGetPayload<{
    include: typeof COLLECTION_LIST_INCLUDE;
  }>,
): Record<string, unknown> {
  const { _count, ...rest } = row;
  void _count;
  return {
    ...rest,
    photoUrls: parsePhotoUrls(row.photoUrls),
    detailsCount: row._count.details,
  };
}

/** Shape a detail-view Collection row. Parses photoUrls + maps details. */
function shapeDetailRow(
  row: PrismaTypes.CollectionGetPayload<{
    include: typeof COLLECTION_DETAIL_INCLUDE;
  }>,
): Record<string, unknown> {
  return {
    id: row.id,
    managerId: row.managerId,
    customerId: row.customerId,
    clientUuid: row.clientUuid,
    gpsLat: row.gpsLat,
    gpsLng: row.gpsLng,
    gpsAccuracy: row.gpsAccuracy,
    distanceToCustomerM: row.distanceToCustomerM,
    isVerified: row.isVerified,
    photoUrls: parsePhotoUrls(row.photoUrls),
    collectedAt: row.collectedAt,
    syncedAt: row.syncedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    customer: row.customer,
    manager: row.manager,
    details: row.details.map((d) => ({
      id: d.id,
      cigarSpecId: d.cigarSpecId,
      salesQty: d.salesQty,
      actualStockLoose: d.actualStockLoose,
      countedStockLoose: d.countedStockLoose,
      actualStockBoxed: d.actualStockBoxed,
      countedStockBoxed: d.countedStockBoxed,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      cigarSpec: d.cigarSpec,
    })),
  };
}

// ─── Route registration ─────────────────────────────────────────────────────
export async function registerCollectionRoutes(
  app: FastifyInstance,
): Promise<void> {
  // ── GET /collections ─────────────────────────────────────────────────────
  app.get<{
    Querystring: {
      page?: number;
      pageSize?: number;
      managerId?: number;
      customerId?: number;
      fromDate?: string;
      toDate?: string;
      isVerified?: boolean;
    };
  }>(
    '/collections',
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

      // Parse date filters up front — surface 400 on bad input rather than
      // letting Prisma's "Invalid Date" silently match nothing.
      let fromDate: Date | undefined;
      if (req.query.fromDate !== undefined) {
        const d = new Date(req.query.fromDate);
        if (Number.isNaN(d.getTime())) {
          return badRequest(reply, `fromDate is not a valid ISO date: ${req.query.fromDate}`);
        }
        fromDate = d;
      }
      let toDate: Date | undefined;
      if (req.query.toDate !== undefined) {
        const d = new Date(req.query.toDate);
        if (Number.isNaN(d.getTime())) {
          return badRequest(reply, `toDate is not a valid ISO date: ${req.query.toDate}`);
        }
        toDate = d;
      }

      const where = buildListWhere(req.user.role, req.user.sub, {
        managerId: req.query.managerId,
        customerId: req.query.customerId,
        fromDate,
        toDate,
        isVerified: req.query.isVerified,
      });

      const [rows, total] = await Promise.all([
        prisma.collection.findMany({
          where,
          orderBy: [{ collectedAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: COLLECTION_LIST_INCLUDE,
        }),
        prisma.collection.count({ where }),
      ]);

      return reply.send({
        data: rows.map(shapeListRow),
        total,
        page,
        pageSize,
      });
    },
  );

  // ── GET /collections/:id ─────────────────────────────────────────────────
  app.get<{ Params: { id: number } }>(
    '/collections/:id',
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

      const row = await prisma.collection.findUnique({
        where: { id: req.params.id },
        include: COLLECTION_DETAIL_INCLUDE,
      });
      if (row === null) {
        return notFound(reply, `Collection ${req.params.id} not found`);
      }

      if (req.user.role !== 'ADMIN' && row.managerId !== req.user.sub) {
        return forbidden(reply, 'You may only access your own collections');
      }

      return reply.send(shapeDetailRow(row));
    },
  );

  // ── POST /collections ────────────────────────────────────────────────────
  app.post<{
    Body: {
      customerId: number;
      clientUuid: string;
      gpsLat: number;
      gpsLng: number;
      gpsAccuracy: number;
      photoUrls?: string[];
      collectedAt: string;
      details: DetailInput[];
    };
  }>(
    '/collections',
    {
      preHandler: [requireAuth],
      schema: { body: createBodySchema },
    },
    async (req, reply) => {
      if (req.user === undefined) {
        return reply.code(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Authentication required',
        });
      }

      const {
        customerId,
        clientUuid,
        gpsLat,
        gpsLng,
        gpsAccuracy,
        photoUrls,
        collectedAt,
        details,
      } = req.body;

      // 1. Parse collectedAt up front — reject 400 on invalid string.
      const collectedAtDate = new Date(collectedAt);
      if (Number.isNaN(collectedAtDate.getTime())) {
        return badRequest(reply, `collectedAt is not a valid ISO date: ${collectedAt}`);
      }

      // 2. Idempotency pre-check — saves the transaction on the common
      //    mobile-retry case. The findUnique by clientUuid is indexed.
      const existing = await prisma.collection.findUnique({
        where: { clientUuid },
      });
      if (existing !== null) {
        // Re-load with full relations for the response shape. The previous
        // lookup only confirmed existence.
        const full = await prisma.collection.findUnique({
          where: { id: existing.id },
          include: COLLECTION_DETAIL_INCLUDE,
        });
        if (full !== null) {
          return reply.code(200).send(shapeDetailRow(full));
        }
      }

      // 3. Customer existence + role-scoped access check.
      const customer = await prisma.customer.findUnique({
        where: { id: customerId },
        select: { id: true, lat: true, lng: true },
      });
      if (customer === null) {
        return notFound(reply, `Customer ${customerId} not found`);
      }

      if (req.user.role === 'MANAGER') {
        const link = await prisma.customerAssignment.findUnique({
          where: {
            managerId_customerId: {
              managerId: req.user.sub,
              customerId,
            },
          },
          select: { managerId: true },
        });
        if (link === null) {
          return forbidden(
            reply,
            'You are not assigned to this customer',
          );
        }
      } else if (req.user.role !== 'ADMIN') {
        // Defense in depth — the enum currently has only ADMIN/MANAGER but
        // if a future role slips through, fail closed.
        return forbidden(reply, `Role ${req.user.role} cannot create collections`);
      }

      // 4. Compute distance + verified flag from coords.
      const { distance, isVerified } = resolveVerification(
        customer.lat,
        customer.lng,
        gpsLat,
        gpsLng,
      );

      // 5. Transaction: create Collection header + all CollectionDetail rows.
      //    Either both succeed or neither does — no orphan headers.
      try {
        const createdId = await prisma.$transaction(async (tx) => {
          // Pre-validate all cigarSpecIds exist inside the transaction
          // (race-safe against concurrent CigarSpec deletion).
          const specIds = Array.from(new Set(details.map((d) => d.cigarSpecId)));
          const existingSpecs = await tx.cigarSpec.findMany({
            where: { id: { in: specIds } },
            select: { id: true },
          });
          const foundSet = new Set<number>(existingSpecs.map((s) => s.id));
          const missing = specIds.filter((id) => !foundSet.has(id));
          if (missing.length > 0) {
            throw new CigarSpecNotFoundError(missing);
          }

          const created = await tx.collection.create({
            data: {
              managerId: req.user!.sub,
              customerId,
              clientUuid,
              gpsLat,
              gpsLng,
              gpsAccuracy,
              distanceToCustomerM: distance,
              isVerified,
              photoUrls: JSON.stringify(photoUrls ?? []),
              collectedAt: collectedAtDate,
              details: {
                create: details.map((d) => ({
                  cigarSpecId: d.cigarSpecId,
                  salesQty: d.salesQty,
                  actualStockLoose: d.actualStockLoose,
                  countedStockLoose: d.countedStockLoose,
                  actualStockBoxed: d.actualStockBoxed,
                  countedStockBoxed: d.countedStockBoxed,
                })),
              },
            },
            select: { id: true },
          });

          return created.id;
        });

        const full = await prisma.collection.findUnique({
          where: { id: createdId },
          include: COLLECTION_DETAIL_INCLUDE,
        });
        if (full === null) {
          // Extremely unlikely — the transaction committed but the row is gone.
          return badRequest(reply, 'Collection created but could not be re-read');
        }
        return reply.code(201).send(shapeDetailRow(full));
      } catch (err: unknown) {
        if (err instanceof CigarSpecNotFoundError) {
          return badRequest(reply, err.message);
        }
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          // clientUuid race — another concurrent request inserted between our
          // pre-check and the transaction commit. Fetch and return existing.
          const raced = await prisma.collection.findUnique({
            where: { clientUuid },
            include: COLLECTION_DETAIL_INCLUDE,
          });
          if (raced !== null) {
            return reply.code(200).send(shapeDetailRow(raced));
          }
        }
        throw err;
      }
    },
  );

  // ── DELETE /collections/:id ──────────────────────────────────────────────
  // Admin-only hard delete. CollectionDetail.collectionId has
  // onDelete: Cascade in schema, so all line items go with it.
  app.delete<{ Params: { id: number } }>(
    '/collections/:id',
    {
      preHandler: [requireAuth, requireRole('ADMIN')],
      schema: { params: idParamsSchema },
    },
    async (req, reply) => {
      const existing = await prisma.collection.findUnique({
        where: { id: req.params.id },
        select: { id: true },
      });
      if (existing === null) {
        return notFound(reply, `Collection ${req.params.id} not found`);
      }

      await prisma.collection.delete({ where: { id: req.params.id } });
      return reply.code(200).send({ id: req.params.id, deleted: true });
    },
  );
}
