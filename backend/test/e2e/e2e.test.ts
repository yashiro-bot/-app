import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../src/app.js';
import type { FastifyInstance } from 'fastify';

interface LoginResponse {
  token: string;
}

interface UserResponse {
  id: number;
  username: string;
  name: string;
  role: string;
}

interface CustomerResponse {
  id: number;
  code: string;
  name: string;
  lat: number | null;
  lng: number | null;
}

interface CigarSpecResponse {
  id: number;
  code: string;
  name: string;
}

interface CollectionListRow {
  id: number;
  customerId: number;
  managerId: number;
  isVerified: boolean;
}

interface PagedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

interface BatchResponse {
  inserted: number;
  skipped: number;
  errors: Array<{ index: number; clientUuid: string; reason: string }>;
}

interface CollectionDetail {
  cigarSpecId: number;
  salesQty: number;
  actualStockLoose: number;
  countedStockLoose: number;
  actualStockBoxed: number;
  countedStockBoxed: number;
}

describe('Cigar Collection E2E', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let managerToken: string;
  let managerId: number;
  const customerIds: number[] = [];
  const customerCoords: Array<{ lat: number; lng: number }> = [];
  const cigarSpecIds: number[] = [];

  // Run-scoped unique identifiers so the test is repeatable against a
  // persistent dev.db without hitting UNIQUE(code) / UNIQUE(username).
  const runId = Date.now();
  const managerUsername = `manager-${runId}`;
  const customerCode = (i: number): string =>
    `C${runId}-${String(i).padStart(2, '0')}`;
  const password = 'admin123'; // meets POST /users minLength:6

  // Bangkok reference point
  const baseLat = 13.7563;
  const baseLng = 100.5018;

  const jsonAuth = (token: string): Record<string, string> => ({
    'content-type': 'application/json',
    authorization: `Bearer ${token}`,
  });

  const buildDetails = (
    salesQty: number,
    loose: number,
    boxed: number,
  ): CollectionDetail[] =>
    cigarSpecIds.map((cigarSpecId) => ({
      cigarSpecId,
      salesQty,
      actualStockLoose: loose,
      countedStockLoose: loose,
      actualStockBoxed: boxed,
      countedStockBoxed: boxed,
    }));

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('Step 1: admin login, create manager, create 10 customers, assign customers', async () => {
    // 1. Admin login (seeded with admin/admin123 by prisma/seed-admin.ts).
    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: { username: 'admin', password: 'admin123' },
    });
    expect(loginRes.statusCode).toBe(200);
    adminToken = (loginRes.json() as LoginResponse).token;

    // 2. Fetch the 45 seeded cigar specs.
    const specsRes = await app.inject({
      method: 'GET',
      url: '/cigar-specs',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(specsRes.statusCode).toBe(200);
    const specs = specsRes.json() as CigarSpecResponse[];
    expect(specs.length).toBe(45);
    cigarSpecIds.push(...specs.map((s) => s.id));

    // 3. Create manager (admin-only). UserRole enum is uppercase 'MANAGER'.
    const createUserRes = await app.inject({
      method: 'POST',
      url: '/users',
      headers: jsonAuth(adminToken),
      payload: {
        username: managerUsername,
        password,
        name: 'Manager One',
        role: 'MANAGER',
      },
    });
    expect(createUserRes.statusCode).toBe(201);
    managerId = (createUserRes.json() as UserResponse).id;

    // 4. Create 10 customers. Each ~11m apart around the Bangkok reference.
    for (let i = 1; i <= 10; i++) {
      const lat = baseLat + i * 0.0001;
      const lng = baseLng + i * 0.0001;
      const customerRes = await app.inject({
        method: 'POST',
        url: '/customers',
        headers: jsonAuth(adminToken),
        payload: {
          code: customerCode(i),
          name: `Customer ${i}`,
          address: `${i} Test Street, Bangkok`,
          lat,
          lng,
        },
      });
      expect(customerRes.statusCode).toBe(201);
      const customer = customerRes.json() as CustomerResponse;
      customerIds.push(customer.id);
      customerCoords.push({ lat, lng });
    }
    expect(customerIds.length).toBe(10);

    // 5. Assign all 10 customers to the manager in a single batch call.
    const assignRes = await app.inject({
      method: 'POST',
      url: '/assignments',
      headers: jsonAuth(adminToken),
      payload: { managerId, customerIds },
    });
    expect(assignRes.statusCode).toBe(200);
  });

  it('Step 2: manager login and verify assigned customers', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: { username: managerUsername, password },
    });
    expect(loginRes.statusCode).toBe(200);
    managerToken = (loginRes.json() as LoginResponse).token;

    // GET /customers returns { data, total, page, pageSize } — NOT a raw array.
    const customersRes = await app.inject({
      method: 'GET',
      url: '/customers',
      headers: { authorization: `Bearer ${managerToken}` },
    });
    expect(customersRes.statusCode).toBe(200);
    const body = customersRes.json() as PagedResponse<CustomerResponse>;
    expect(body.data.length).toBe(10);
  });

  it('Step 3: create 5 collections with GPS data (4 within 100m, 1 beyond)', async () => {
    // 4 collections ~1m from the customer (well inside the 100m verification
    // radius). Each carries the full 45 detail rows.
    for (let i = 0; i < 4; i++) {
      const coord = customerCoords[i];
      const res = await app.inject({
        method: 'POST',
        url: '/collections',
        headers: jsonAuth(managerToken),
        payload: {
          customerId: customerIds[i],
          clientUuid: `uuid-step3-${runId}-${i}`,
          gpsLat: coord.lat + 0.00001,
          gpsLng: coord.lng + 0.00001,
          gpsAccuracy: 5,
          collectedAt: new Date().toISOString(),
          details: buildDetails(5, 10, 20),
        },
      });
      expect(res.statusCode).toBe(201);
    }

    // 1 collection ~220m beyond the customer. The route accepts and stores
    // isVerified=false (the spec defines GPS validation as a soft flag, not
    // a hard rejection), so we expect 201.
    const farCoord = customerCoords[4];
    const farRes = await app.inject({
      method: 'POST',
      url: '/collections',
      headers: jsonAuth(managerToken),
      payload: {
        customerId: customerIds[4],
        clientUuid: `uuid-step3-${runId}-far`,
        gpsLat: farCoord.lat + 0.002,
        gpsLng: farCoord.lng + 0.002,
        gpsAccuracy: 50,
        collectedAt: new Date().toISOString(),
        details: buildDetails(5, 10, 20),
      },
    });
    expect(farRes.statusCode).toBe(201);
  });

  it('Step 4: batch collections with idempotency', async () => {
    // /collections/batch expects { records: [...] }, NOT a bare array.
    // Idempotency is per-record via clientUuid, not via clientBatchId.
    const records = [
      {
        customerId: customerIds[5],
        clientUuid: `uuid-step4-${runId}-0`,
        gpsLat: customerCoords[5].lat,
        gpsLng: customerCoords[5].lng,
        gpsAccuracy: 5,
        collectedAt: new Date().toISOString(),
        details: buildDetails(3, 5, 10),
      },
      {
        customerId: customerIds[6],
        clientUuid: `uuid-step4-${runId}-1`,
        gpsLat: customerCoords[6].lat,
        gpsLng: customerCoords[6].lng,
        gpsAccuracy: 5,
        collectedAt: new Date().toISOString(),
        details: buildDetails(3, 5, 10),
      },
    ];

    // First submission — both records insert.
    const firstRes = await app.inject({
      method: 'POST',
      url: '/collections/batch',
      headers: jsonAuth(managerToken),
      payload: { records },
    });
    expect(firstRes.statusCode).toBe(200);
    const firstBody = firstRes.json() as BatchResponse;
    expect(firstBody.inserted).toBe(2);
    expect(firstBody.skipped).toBe(0);

    // Second submission with the same clientUuids — both are skipped
    // (idempotent). No new rows are written.
    const secondRes = await app.inject({
      method: 'POST',
      url: '/collections/batch',
      headers: jsonAuth(managerToken),
      payload: { records },
    });
    expect(secondRes.statusCode).toBe(200);
    const secondBody = secondRes.json() as BatchResponse;
    expect(secondBody.inserted).toBe(0);
    expect(secondBody.skipped).toBe(2);
  });

  it('Step 5: list collections with filters and export', async () => {
    // GET /collections uses page/pageSize (NOT limit/page) and returns the
    // paged envelope { data, total, page, pageSize }.
    const collectionsRes = await app.inject({
      method: 'GET',
      url: '/collections?page=1&pageSize=20',
      headers: { authorization: `Bearer ${managerToken}` },
    });
    expect(collectionsRes.statusCode).toBe(200);
    const body = collectionsRes.json() as PagedResponse<CollectionListRow>;
    expect(body.data.length).toBeGreaterThan(0);

    // /exports/collections uses requireAuth (Bearer header). The handler
    // streams an .xlsx with
    // Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.
    const exportRes = await app.inject({
      method: 'GET',
      url: '/exports/collections',
      headers: { authorization: `Bearer ${managerToken}` },
    });
    expect(exportRes.statusCode).toBe(200);
    const contentType = (exportRes.headers['content-type'] ?? '').toString();
    expect(contentType).toMatch(/spreadsheetml|excel|vnd\.openxmlformats/i);
  });
});