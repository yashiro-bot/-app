// Collections API. Real implementation lands in T18/T21.
//
// Endpoints (backend reference: backend/src/routes/collections.ts):
//   GET    /collections         — paginated list with filters
//   GET    /collections/:id     — single visit with details
//   POST   /collections         — create visit + details (idempotent on clientUuid)
//   POST   /collections/batch   — bulk upload (1–50 records, per-record idempotency)
//   DELETE /collections/:id     — ADMIN-only hard delete

import { http } from '../utils/request';

export interface CollectionDetailInput {
  cigarSpecId: number;
  quantity: number;
  remark?: string;
}

export interface CollectionInput {
  clientUuid: string;
  customerId: number;
  collectedAt: string; // ISO date-time
  gpsLat: number;
  gpsLng: number;
  photoUrls: string[];
  details: CollectionDetailInput[];
}

export interface CollectionBatchInput {
  records: CollectionInput[];
}

export interface CollectionBatchResponse {
  inserted: number;
  skipped: number;
  errors: Array<{ index: number; clientUuid: string; reason: string }>;
}

// ─── List / Detail response types (T21) ─────────────────────────────────────

/** Compact customer shape embedded in both list + detail rows. */
export interface CollectionCustomerSummary {
  id: number;
  code: string;
  name: string;
  address: string | null;
}

/** Manager shape embedded in list rows. Detail rows add `username`. */
export interface CollectionManagerSummary {
  id: number;
  name: string;
}

/** A single row in the paginated GET /collections response. */
export interface CollectionListItem {
  id: number;
  clientUuid: string;
  customerId: number;
  gpsLat: number;
  gpsLng: number;
  gpsAccuracy: number | null;
  distanceToCustomerM: number | null;
  isVerified: boolean;
  photoUrls: string[];
  collectedAt: string; // ISO date-time
  customer: CollectionCustomerSummary;
  manager: CollectionManagerSummary;
  /** Number of detail rows attached to this collection (Prisma _count). */
  detailsCount: number;
}

/** Wrapper returned by GET /collections. */
export interface PaginatedCollections {
  data: CollectionListItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** Detail-row extension used by GET /collections/:id. */
export interface CollectionSpecDetail {
  id: number;
  cigarSpecId: number;
  salesQty: number;
  actualStockLoose: number;
  countedStockLoose: number;
  actualStockBoxed: number;
  countedStockBoxed: number;
  cigarSpec: {
    id: number;
    code: string;
    name: string;
    category: string;
    unitPerBox: number;
  };
}

/** Detail-view customer (extends the summary with lat/lng). */
export interface CollectionCustomerDetail extends CollectionCustomerSummary {
  lat: number | null;
  lng: number | null;
}

/** Detail-view manager (extends the summary with username). */
export interface CollectionManagerDetail extends CollectionManagerSummary {
  username: string;
}

/** Full GET /collections/:id response. */
export interface CollectionDetail {
  id: number;
  managerId: number;
  customerId: number;
  clientUuid: string;
  gpsLat: number;
  gpsLng: number;
  gpsAccuracy: number | null;
  distanceToCustomerM: number | null;
  isVerified: boolean;
  photoUrls: string[];
  collectedAt: string; // ISO date-time
  syncedAt: string | null;
  customer: CollectionCustomerDetail;
  manager: CollectionManagerDetail;
  details: CollectionSpecDetail[];
}

export interface ListCollectionsParams {
  page?: number;
  pageSize?: number;
  customerId?: number;
  fromDate?: string;
  toDate?: string;
  isVerified?: boolean;
}

export function createCollection(
  payload: CollectionInput,
): Promise<{ id: number; clientUuid: string }> {
  // T18: submit a single collection visit with details. The backend
  // is idempotent on `clientUuid`, so a retry on network failure will
  // not double-insert. The form layer falls back to OfflineQueue on
  // any non-2xx response.
  return http
    .post<{ id: number; clientUuid: string }>('/collections', payload)
    .then((res) => res.data);
}

export function batchUploadCollections(
  payload: CollectionBatchInput,
): Promise<CollectionBatchResponse> {
  // TODO(T18): real call → http.post<CollectionBatchResponse>('/collections/batch', payload)
  throw new Error('batchUploadCollections() not implemented (T18)');
}

export function listCollections(
  params: ListCollectionsParams = {},
): Promise<PaginatedCollections> {
  // T21: paginated visit history. Undefined params are stripped so axios
  // omits them from the query string (axios treats undefined as "do not send").
  const cleaned: Record<string, string | number | boolean> = {};
  if (params.page !== undefined) cleaned['page'] = params.page;
  if (params.pageSize !== undefined) cleaned['pageSize'] = params.pageSize;
  if (params.customerId !== undefined) cleaned['customerId'] = params.customerId;
  if (params.fromDate !== undefined) cleaned['fromDate'] = params.fromDate;
  if (params.toDate !== undefined) cleaned['toDate'] = params.toDate;
  if (params.isVerified !== undefined) cleaned['isVerified'] = params.isVerified;
  return http
    .get<PaginatedCollections>('/collections', { params: cleaned })
    .then((res) => res.data);
}

export function getCollection(id: number): Promise<CollectionDetail> {
  // T21: single visit + nested details. Used by /pages/history/detail.
  return http
    .get<CollectionDetail>(`/collections/${id}`)
    .then((res) => res.data);
}