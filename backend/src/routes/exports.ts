// Excel export routes.
//
//   GET /exports/collections — streaming .xlsx of every collection in a date range.
//
// CRITICAL for memory:
//   Uses ExcelJS.stream.xlsx.WorkbookWriter, NOT the buffered Workbook. Each
//   row is written directly to the HTTP response socket instead of being held
//   in memory until workbook.xlsx.writeBuffer(). Even with thousands of visits
//   the peak memory stays at ~one-row-of-233-cells, not the full workbook.
//
// Layout:
//   - One worksheet, 采集数据.
//   - Columns are dynamic: 8 fixed + (45 × 5 spec) = 233 total when the
//     CigarSpec table is fully seeded. If the seed is partial, the column
//     count shrinks but stays self-consistent (8 + N × 5).
//   - Collections are streamed via cursor pagination (take: 500) so we
//     never load the full result set into memory at once.
//
// Authorization:
//   - MANAGER: only their own collections; the managerId query param is
//     ignored (silently overridden to req.user.sub).
//   - ADMIN:   all collections; managerId and customerId both honored.

import type { FastifyInstance, FastifyReply } from 'fastify';
import { type Prisma as PrismaTypes } from '@prisma/client';
import ExcelJS from 'exceljs';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Default lower bound for the date range. */
const DEFAULT_FROM = '1970-01-01';

/** Cursor page size — tuned so we never buffer more than ~233 cells in memory. */
const CURSOR_PAGE_SIZE = 500;

// ─── Response helpers ───────────────────────────────────────────────────────

function badRequest(reply: FastifyReply, message: string) {
  return reply.code(400).send({
    statusCode: 400,
    error: 'Bad Request',
    message,
  });
}

// ─── Formatting helpers ─────────────────────────────────────────────────────

/** YYYY-MM-DD using local time (filename only — filesystems don't carry TZ). */
function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** YYYY-MM-DD HH:MM:SS in local time — the cell format for 采集时间. */
function fmtDateTime(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${y}-${mo}-${da} ${h}:${mi}:${s}`;
}

/** Parse the DB-stored JSON-encoded photoUrls back into a string[]. */
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

const listQuerySchema = {
  type: 'object',
  properties: {
    from: { type: 'string', minLength: 1, maxLength: 32 },
    to: { type: 'string', minLength: 1, maxLength: 32 },
    managerId: { type: 'integer', minimum: 1 },
    customerId: { type: 'integer', minimum: 1 },
  },
  additionalProperties: false,
};

// ─── Route registration ─────────────────────────────────────────────────────

export async function registerExportRoutes(
  app: FastifyInstance,
): Promise<void> {
  // ── GET /exports/collections ──────────────────────────────────────────────
  app.get<{
    Querystring: {
      from?: string;
      to?: string;
      managerId?: number;
      customerId?: number;
    };
  }>(
    '/exports/collections',
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

      // ─── Parse date range (defaults: from=1970-01-01, to=today) ─────────
      const now = new Date();
      const fromInput = req.query.from ?? DEFAULT_FROM;
      // `to` is treated as inclusive end-of-day so `to=2026-12-31` covers
      // visits through 23:59:59.999 local time.
      const toDateInput = req.query.to ?? fmtDate(now);

      const fromDate = new Date(fromInput);
      if (Number.isNaN(fromDate.getTime())) {
        return badRequest(reply, `from is not a valid date: ${fromInput}`);
      }
      const toDate = new Date(`${toDateInput}T23:59:59.999`);
      if (Number.isNaN(toDate.getTime())) {
        return badRequest(reply, `to is not a valid date: ${toDateInput}`);
      }
      if (fromDate.getTime() > toDate.getTime()) {
        return badRequest(
          reply,
          `from (${fromInput}) must be <= to (${toDateInput})`,
        );
      }

      // ─── Build role-scoped Prisma where clause ──────────────────────────
      const where: PrismaTypes.CollectionWhereInput = {
        collectedAt: { gte: fromDate, lte: toDate },
      };
      if (req.user.role === 'MANAGER') {
        // Manager always sees only their own — silently override managerId.
        where.managerId = req.user.sub;
      } else if (req.user.role === 'ADMIN') {
        if (req.query.managerId !== undefined) {
          where.managerId = req.query.managerId;
        }
      } else {
        // Future-proof: anything else (e.g. a new role) fails closed.
        return reply.code(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: `Role ${req.user.role} cannot export collections`,
        });
      }
      if (req.query.customerId !== undefined) {
        where.customerId = req.query.customerId;
      }

      // ─── Fetch the 45 CigarSpec rows ONCE, ordered for stable columns ─
      const specs = await prisma.cigarSpec.findMany({
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        select: { id: true, code: true, sortOrder: true },
      });
      if (specs.length === 0) {
        return reply.code(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'No CigarSpec rows in DB — seed missing?',
        });
      }

      // ─── Set Content-Type + Content-Disposition BEFORE creating workbook ─
      // reply.raw.setHeader (NOT reply.header): ExcelJS writes straight to
      // the socket and never calls reply.send()/writeHead, so the queued
      // reply.header() values would never flush. setHeader writes them
      // to reply.raw immediately.
      reply.raw.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      reply.raw.setHeader(
        'Content-Disposition',
        `attachment; filename="collections-${fmtDate(now)}.xlsx"`,
      );
      reply.raw.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

      // ─── Streaming workbook writes directly to the HTTP socket ──────────
      const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
        stream: reply.raw,
        useStyles: false,
      });

      const sheet = workbook.addWorksheet('采集数据', {
        views: [{ state: 'frozen', ySplit: 1 }],
      });

      // 8 fixed columns (width in characters).
      const fixedCols: Array<{ header: string; width: number }> = [
        { header: '采集ID', width: 8 },
        { header: '客户编码', width: 15 },
        { header: '客户名称', width: 20 },
        { header: '采集时间', width: 20 },
        { header: '客户经理', width: 15 },
        { header: 'GPS距离米', width: 12 },
        { header: '是否核实', width: 10 },
        { header: '照片数', width: 8 },
      ];
      // 5 columns per spec in stable sortOrder.
      const specCols: Array<{ header: string; width: number }> = specs.flatMap(
        (spec) => [
          { header: `${spec.code}_销售`, width: 10 },
          { header: `${spec.code}_裸养实际`, width: 12 },
          { header: `${spec.code}_裸养盘点`, width: 12 },
          { header: `${spec.code}_盒养实际`, width: 12 },
          { header: `${spec.code}_盒养盘点`, width: 12 },
        ],
      );
      // sheet.columns setter writes the header row immediately.
      sheet.columns = [...fixedCols, ...specCols];

      // ─── Stream collections via cursor pagination ───────────────────────
      let cursorId: number | undefined;

      // We track whether anything threw inside the streaming loop so we can
      // still call commit() in finally. Once the workbook exists, the
      // response is already on the wire and we can't recover with a 4xx.
      try {
        for (;;) {
          const rows = await prisma.collection.findMany({
            where,
            take: CURSOR_PAGE_SIZE,
            ...(cursorId !== undefined
              ? { cursor: { id: cursorId }, skip: 1 }
              : {}),
            orderBy: { id: 'asc' },
            include: {
              customer: { select: { code: true, name: true } },
              manager: { select: { name: true } },
              details: {
                select: {
                  cigarSpecId: true,
                  salesQty: true,
                  actualStockLoose: true,
                  countedStockLoose: true,
                  actualStockBoxed: true,
                  countedStockBoxed: true,
                },
              },
            },
          });

          if (rows.length === 0) break;

          for (const row of rows) {
            // Build cigarSpecId → detail map for O(1) lookup per spec column.
            type DetailRow = (typeof row.details)[number];
            const detailMap = new Map<number, DetailRow>();
            for (const d of row.details) {
              detailMap.set(d.cigarSpecId, d);
            }

            const photoCount = parsePhotoUrls(row.photoUrls).length;
            const fixedPart: Array<string | number> = [
              row.id,
              row.customer.code,
              row.customer.name,
              fmtDateTime(row.collectedAt),
              row.manager.name,
              row.distanceToCustomerM === null
                ? ''
                : row.distanceToCustomerM,
              row.isVerified ? '是' : '否',
              photoCount,
            ];

            // 5 columns per spec — empty string when this visit skipped the SKU.
            const specPart: Array<string | number> = [];
            for (const spec of specs) {
              const d = detailMap.get(spec.id);
              if (d === undefined) {
                specPart.push('', '', '', '', '');
              } else {
                specPart.push(
                  d.salesQty,
                  d.actualStockLoose,
                  d.countedStockLoose,
                  d.actualStockBoxed,
                  d.countedStockBoxed,
                );
              }
            }

            sheet.addRow([...fixedPart, ...specPart]);
          }

          if (rows.length < CURSOR_PAGE_SIZE) break;
          // Safe: rows.length > 0 means the page is non-empty.
          cursorId = rows[rows.length - 1]!.id;
        }
      } finally {
        // Always commit — without it the .xlsx is malformed even if all
        // rows were written. If commit itself throws, the connection just
        // drops; the client will see an empty/corrupt download.
        await workbook.commit();
      }

      // Signal to Fastify that we've already written the response — don't
      // let the framework try to send an empty body on top of our stream.
      return reply;
    },
  );
}