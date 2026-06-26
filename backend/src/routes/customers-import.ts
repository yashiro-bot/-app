// Bulk customer import from .xlsx via @fastify/multipart + ExcelJS streaming.
//
// POST /customers/import — ADMIN only, multipart/form-data, file field "file"
//
// Expected columns (Chinese header row, exact match required):
//   客户编码  客户名称  地址  联系电话  联系人
// (code      name      addr  phone    contact)
//
// Behavior:
//   - Reads each row incrementally (ExcelJS streaming reader — no full-buffer).
//   - Validates `code` and `name` are non-empty (skip the row otherwise).
//   - Geocodes `address` if present and lat/lng missing.
//   - Upserts by `code` (the unique natural key). Updated if exists; created
//     if not. Status defaults to ACTIVE on create; unchanged on update unless
//     explicitly set in the row.
//   - Returns a structured summary:
//       { total, imported, updated, skipped, geocoded, errors: [{row, reason}] }
//
// Errors are accumulated per-row, not fatal — one bad row doesn't abort the
// whole batch. The caller can decide which to retry from `errors`.

import type { FastifyInstance } from 'fastify';
import ExcelJS from 'exceljs';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { geocode } from '../lib/amap.js';

// ─── Header → field mapping (Chinese → Prisma) ─────────────────────────────
// We accept the exact Chinese labels the spec calls out. We map by *position*
// too: if the header row is missing the recognized label, we fall back to a
// best-effort positional lookup (first cell = code, second = name, third =
// address, fourth = phone, fifth = contact). This keeps imports working even
// when an admin exports an .xlsx without a header row.

const HEADER_CODE = '客户编码';
const HEADER_NAME = '客户名称';
const HEADER_ADDR = '地址';
const HEADER_PHONE = '联系电话';
const HEADER_CONTACT = '联系人';

interface RowInput {
  code: string;
  name: string;
  address: string | null;
  phone: string | null;
  contact: string | null;
}

interface RowError {
  row: number;
  reason: string;
}

interface ImportResult {
  total: number;
  imported: number;
  updated: number;
  skipped: number;
  geocoded: number;
  errors: RowError[];
}

/**
 * Map a raw ExcelJS row into a RowInput. Empty cells become null. If the row
 * is completely empty we return null (the caller treats that as "skip").
 *
 * `headerRow` (1-indexed array of strings) tells us which column is which;
 * `row.values` from ExcelJS is also 1-indexed and may have leading nulls
 * (cells that are missing entirely).
 */
function buildRow(
  raw: ReadonlyArray<unknown>,
  headerRow: ReadonlyArray<string>,
  rowNumber: number,
): { row: RowInput | null; error: RowError | null } {
  // Pull each column by header index. We tolerate gaps in the input.
  const getByHeader = (header: string): string | null => {
    const idx = headerRow.indexOf(header);
    if (idx === -1) return null;
    // raw[0] is the row number from ExcelJS; cell values start at raw[1].
    const cell = raw[idx + 1];
    if (cell === undefined || cell === null) return null;
    const text = String(cell).trim();
    return text === '' ? null : text;
  };

  // Fallback positional mapping for headerless imports: code, name, addr, phone, contact
  const getByPos = (idx: number): string | null => {
    const cell = raw[idx];
    if (cell === undefined || cell === null) return null;
    const text = String(cell).trim();
    return text === '' ? null : text;
  };

  const hasHeader =
    headerRow.includes(HEADER_CODE) || headerRow.includes(HEADER_NAME);

  const code =
    (hasHeader ? getByHeader(HEADER_CODE) : null) ?? getByPos(1);
  const name =
    (hasHeader ? getByHeader(HEADER_NAME) : null) ?? getByPos(2);
  const address =
    (hasHeader ? getByHeader(HEADER_ADDR) : null) ?? getByPos(3);
  const phone =
    (hasHeader ? getByHeader(HEADER_PHONE) : null) ?? getByPos(4);
  const contact =
    (hasHeader ? getByHeader(HEADER_CONTACT) : null) ?? getByPos(5);

  if (code === null || name === null) {
    // Detect "completely empty" rows so we don't report them as errors.
    const allEmpty =
      code === null &&
      name === null &&
      address === null &&
      phone === null &&
      contact === null;
    if (allEmpty) return { row: null, error: null };
    return {
      row: null,
      error: { row: rowNumber, reason: 'missing required code or name' },
    };
  }

  return {
    row: { code, name, address, phone, contact },
    error: null,
  };
}

/**
 * Apply a single parsed row: geocode (if needed) and upsert by code.
 * Returns which counter to increment, or throws to surface a hard failure.
 */
async function upsertRow(parsed: RowInput): Promise<{
  outcome: 'imported' | 'updated' | 'skipped';
  geocoded: boolean;
}> {
  const existing = await prisma.customer.findUnique({
    where: { code: parsed.code },
    select: { id: true, lat: true, lng: true, address: true },
  });

  // Geocode when:
  //   - There's an address and
  //   - Either it's a brand-new row OR the address changed OR no lat/lng yet.
  let resolvedLat: number | null =
    existing?.lat !== undefined && existing.lat !== null ? existing.lat : null;
  let resolvedLng: number | null =
    existing?.lng !== undefined && existing.lng !== null ? existing.lng : null;
  let didGeocode = false;

  const needGeocode =
    parsed.address !== null &&
    (existing === null ||
      parsed.address !== existing.address ||
      resolvedLat === null ||
      resolvedLng === null);

  if (needGeocode && parsed.address !== null) {
    const point = await geocode(parsed.address);
    if (point !== null) {
      resolvedLat = point.lat;
      resolvedLng = point.lng;
      didGeocode = true;
    }
  }

  if (existing === null) {
    await prisma.customer.create({
      data: {
        code: parsed.code,
        name: parsed.name,
        address: parsed.address,
        contact: parsed.contact,
        phone: parsed.phone,
        lat: resolvedLat,
        lng: resolvedLng,
        status: 'ACTIVE',
      },
    });
    return { outcome: 'imported', geocoded: didGeocode };
  }

  // Update — only touch fields the row provided. Empty-string lat/lng would
  // wipe the existing coords, which we never want.
  await prisma.customer.update({
    where: { id: existing.id },
    data: {
      name: parsed.name,
      address: parsed.address,
      contact: parsed.contact,
      phone: parsed.phone,
      ...(didGeocode ? { lat: resolvedLat, lng: resolvedLng } : {}),
    },
  });
  return { outcome: 'updated', geocoded: didGeocode };
}

// ─── Route registration ─────────────────────────────────────────────────────
export async function registerCustomerImportRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.post(
    '/customers/import',
    {
      preHandler: [requireAuth, requireRole('ADMIN')],
    },
    async (req, reply) => {
      // 1. Get the uploaded file. `req.file()` returns the single MultipartFile
      //    (because the spec only sends one). The stream we hand to ExcelJS is
      //    `req.file.file` — a Node Readable wrapping the request body chunk.
      const part = await req.file();
      if (part === undefined) {
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'No file uploaded. Use multipart/form-data with field "file".',
        });
      }
      if (part.fieldname !== 'file') {
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: `Unexpected field "${part.fieldname}". Use "file".`,
        });
      }
      const filename = part.filename ?? '';
      if (!filename.toLowerCase().endsWith('.xlsx')) {
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Only .xlsx files are accepted',
        });
      }

      const result: ImportResult = {
        total: 0,
        imported: 0,
        updated: 0,
        skipped: 0,
        geocoded: 0,
        errors: [],
      };

      // 2. Streaming ExcelJS reader. We emit rows only — no styles, no
      //    hyperlinks — to keep memory low on big imports. Shared strings
      //    are cached by default which is correct for our small header set.
      const workbookReader = new ExcelJS.stream.xlsx.WorkbookReader(part.file, {
        entries: 'emit',
        sharedStrings: 'cache',
        worksheets: 'emit',
        styles: 'ignore',
        hyperlinks: 'ignore',
      });

      let rowNumber = 0;
      let headerRow: ReadonlyArray<string> = [];
      // We only ever read the first worksheet — multi-sheet workbooks aren't
      // supported by this endpoint. A multi-sheet import would mean merging
      // customer lists, which is out of scope.
      let firstSheet = true;

      try {
        for await (const worksheetReader of workbookReader) {
          if (!firstSheet) break;
          firstSheet = false;

          for await (const row of worksheetReader) {
            // ExcelJS row.values is a 1-indexed sparse array; rowNumber is the
            // spreadsheet row number (header is row 1, data starts at row 2).
            rowNumber = typeof row.number === 'number' ? row.number : rowNumber + 1;

            if (rowNumber === 1) {
              // Capture the header row for column-name lookup. ExcelJS
              // `row.values` is 1-indexed with the row number at index 0 —
              // skip that, then store labels so position N in the header
              // matches column N (1-indexed) in subsequent rows' values.
              const labels: string[] = [];
              const vals = row.values as ReadonlyArray<unknown>;
              for (let i = 1; i < vals.length; i += 1) {
                const cell = vals[i];
                labels.push(
                  cell === undefined || cell === null
                    ? ''
                    : String(cell).trim(),
                );
              }
              headerRow = labels;
              continue;
            }

            result.total += 1;
            const { row: parsed, error } = buildRow(
              row.values as ReadonlyArray<unknown>,
              headerRow,
              rowNumber,
            );
            if (error !== null) {
              result.errors.push(error);
              result.skipped += 1;
              continue;
            }
            if (parsed === null) {
              // Empty row — count but don't surface as an error.
              result.skipped += 1;
              continue;
            }

            try {
              const { outcome, geocoded } = await upsertRow(parsed);
              if (outcome === 'imported') result.imported += 1;
              else if (outcome === 'updated') result.updated += 1;
              else result.skipped += 1;
              if (geocoded) result.geocoded += 1;
            } catch (err: unknown) {
              let reason = 'unknown error';
              if (err instanceof Prisma.PrismaClientKnownRequestError) {
                reason = `database error ${err.code}`;
              } else if (err instanceof Error) {
                reason = err.message;
              }
              result.errors.push({ row: rowNumber, reason });
              result.skipped += 1;
            }
          }
        }
      } catch (err: unknown) {
        // Streaming parse failure — usually a corrupt .xlsx or a column-type
        // mismatch. Surface as 400 because it's a client-side input issue.
        const message =
          err instanceof Error ? err.message : 'failed to parse xlsx';
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message,
          partial: result,
        });
      }

      return reply.send(result);
    },
  );
}