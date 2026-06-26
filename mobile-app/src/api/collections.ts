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

export function createCollection(payload: CollectionInput): Promise<unknown> {
  // TODO(T18): real call → http.post('/collections', payload)
  throw new Error('createCollection() not implemented (T18)');
}

export function batchUploadCollections(
  payload: CollectionBatchInput,
): Promise<CollectionBatchResponse> {
  // TODO(T18): real call → http.post<CollectionBatchResponse>('/collections/batch', payload)
  throw new Error('batchUploadCollections() not implemented (T18)');
}

export function listCollections(params: {
  page?: number;
  pageSize?: number;
  customerId?: number;
  fromDate?: string;
  toDate?: string;
  isVerified?: boolean;
} = {}): Promise<unknown> {
  // TODO(T21): real call → http.get('/collections', { params })
  throw new Error('listCollections() not implemented (T21)');
}
