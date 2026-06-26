# backend

Fastify v5 + Prisma + TypeScript REST API for the cigar-collection monorepo.

## What it is
- HTTP API consumed by both the admin SPA and the uni-app mobile clients.
- Stack: Fastify 5, Prisma 6 ORM, TypeScript 5, JWT auth, role-based access.
- Data: MySQL (production) / SQLite (dev), defined in `prisma/schema.prisma` (T2).

## Status
T2 done — 6-table schema + 45-row CigarSpec seed. T3 done — Fastify skeleton + JWT auth + `/health`. T5 done — `/users` CRUD. T7 done — `/cigar-specs` CRUD (6 endpoints, soft delete, immutable codes). T6 done — `/customers` CRUD + `/customers/import` xlsx bulk import with AMap geocoding. T8 done — `/assignments` manager↔customer CRUD + batch upsert/delete via composite UNIQUE upsert. T9 done — `/collections` CRUD + Haversine GPS verification (idempotent POST via `clientUuid`). T10 done — `/oss/sts-token` Aliyun OSS STS temporary credentials for mobile direct upload (1 h policy-scoped to `photos/${userId}/*`, plus dev mock endpoint). T11 done — `POST /collections/batch` bulk upload (1–50 records/batch, per-record idempotency via `clientUuid`, per-record error capture, single `$transaction` for the whole batch).

## Scripts
| Command              | What it does                                                |
| -------------------- | ----------------------------------------------------------- |
| `npm run dev`        | `tsx watch` — hot-reload TS, port from `.env`               |
| `npm run build`      | Compile to `dist/` with `tsc`                               |
| `npm start`          | Run compiled `dist/server.js`                               |
| `npm test`           | `vitest run` (unit + supertest integration)                 |
| `npm run prisma:migrate` | `prisma migrate dev`                                   |
| `npm run prisma:seed`    | `tsx prisma/seed.ts` (idempotent, 45 CigarSpec rows)   |
| `npx prisma db seed`     | Same as above (uses `prisma.seed` block in package.json) |

## Layout
```
src/
  server.ts        # Fastify boot
  app.ts           # buildApp() — plugin/route wiring
  routes/          # /auth, /users, /cigar-specs, /customers,
                    #   /customers/import, /assignments, /collections,
                    #   /collections/batch, /oss, /health, ...
  lib/             # prisma singleton, jwt helpers, amap geocoding,
                    #   haversine distance, aliyun oss sts
  middleware/      # auth preHandler (requireAuth, requireRole)
  config/          # typed env loader
prisma/
  schema.prisma    # 6 models — User, Customer, CigarSpec,
                   #   CustomerAssignment, Collection, CollectionDetail
  seed.ts          # 45 CigarSpec rows (idempotent)
  seed-admin.ts    # one-off admin/admin123 seed for smoke tests
  migrations/      # SQL migration history
  dev.db           # SQLite file (gitignored)
```

## API endpoints

### Health
- `GET /health` — public; `{ status, timestamp, db }`

### Auth (`src/routes/auth.ts`)
- `POST /auth/login` — public; body `{username, password}` → `{token, user}`
- `POST /auth/wx-login` — public; placeholder (T10 will wire WeChat)
- `GET  /auth/me` — auth required; returns current user

### Users (`src/routes/users.ts`) — T5
All responses strip `passwordHash`. Roles: `ADMIN`, `MANAGER`. Status: `ACTIVE`, `DISABLED`.

| Method | Path | Auth | Body / Query | Returns |
| --- | --- | --- | --- | --- |
| GET    | `/users`            | ADMIN | query: `page`(1), `pageSize`(20), `role?`, `status?`, `search?` | `{data, total, page, pageSize}` |
| GET    | `/users/:id`        | ADMIN or self | path: `id` | single user |
| POST   | `/users`            | ADMIN | `{username, password, name, phone?, role, status?}` | 201 + created user |
| PATCH  | `/users/:id`        | ADMIN (any field) or self (name/phone only) | partial `{name?, phone?, password?, role?, status?}` | updated user |
| DELETE | `/users/:id`        | ADMIN | soft delete → status=DISABLED; refuses self-delete | disabled user |

### Customers (`src/routes/customers.ts`) — T6
Customer (零售户) records. `code` is the natural unique business key.
MANAGER role is scoped to customers they're assigned to via `CustomerAssignment`;
ADMIN sees all customers. Geocoding runs through `lib/amap.ts` (LRU cache, 1000 entries).

| Method | Path | Auth | Body / Query | Returns |
| --- | --- | --- | --- | --- |
| GET    | `/customers`           | auth | query: `page`(1), `pageSize`(20), `status?`, `search?` (LIKE on code/name/address) | `{data, total, page, pageSize}` |
| GET    | `/customers/:id`       | auth (assigned manager or ADMIN) | path: `id` | single customer |
| POST   | `/customers`           | ADMIN | `{code, name, address?, contact?, phone?, lat?, lng?, status?}` — auto-geocodes `address` if no lat/lng | 201 + created customer |
| PATCH  | `/customers/:id`       | ADMIN | partial `{name?, address?, contact?, phone?, lat?, lng?, status?}` — re-geocodes on address change | updated customer |
| DELETE | `/customers/:id`       | ADMIN | soft delete → status=DISABLED (idempotent) | disabled customer |

Errors: 400 (validation/no-op patch), 401 (no token), 403 (role/assignment), 404 (not found), 409 (duplicate code).

### Customer bulk import (`src/routes/customers-import.ts`) — T6
Streams an `.xlsx` upload through ExcelJS and upserts customers by `code`.
No full-file buffering — uploads up to 10 MB.

| Method | Path | Auth | Body | Returns |
| --- | --- | --- | --- | --- |
| POST   | `/customers/import`    | ADMIN | multipart/form-data, file field `file` (.xlsx) | `{total, imported, updated, skipped, geocoded, errors:[{row,reason}]}` |

Expected header row (Chinese, exact match required):
`客户编码  客户名称  地址  联系电话  联系人`

- Missing `code` or `name` → row skipped, recorded in `errors`.
- Address + no cached lat/lng → AMap geocoding attempted (cache hit on repeat imports).
- Empty rows → counted in `skipped`, not surfaced as errors.
- Multi-sheet workbooks → only the first sheet is processed.

Errors: 400 (no file / wrong extension / parse failure), 401, 403, 500 (unexpected).

### Assignments (`src/routes/assignments.ts`) — T8
Manager ↔ customer coverage. Backed by `CustomerAssignment` (composite UNIQUE
on `(managerId, customerId)`). `POST` is idempotent — re-submitting the same
batch never 4xxs; already-assigned pairs land in `alreadyAssigned`.

| Method | Path | Auth | Body / Query | Returns |
| --- | --- | --- | --- | --- |
| GET    | `/assignments`                                | ADMIN | query: `managerId?`, `customerId?`, `page`(1), `pageSize`(50) | `{data: CustomerAssignment[], total, page, pageSize}` — each row nested with `manager:{id,username,name}` and `customer:{id,code,name,address}` |
| GET    | `/assignments/managers/:managerId/customers`   | auth (manager: own; admin: any) | path: `managerId` | `{data: (Customer & {assignedAt})[], total}` |
| GET    | `/assignments/customers/:customerId/managers`  | ADMIN | path: `customerId` | `{data: (User & {assignedAt})[], total}` |
| POST   | `/assignments`                                | ADMIN | `{managerId, customerIds: number[]}` (1–500 unique ints) | `{assigned: N, alreadyAssigned: M, errors: [{customerId, reason}]}` |
| DELETE | `/assignments/:id`                            | ADMIN | path: `id` | `{id, deleted: true}` |
| DELETE | `/assignments/batch`                          | ADMIN | `{managerId, customerIds: number[]}` | `{removed: N, notFound: number[], errors: [{customerId, reason}]}` |

- Upsert uses Prisma's composite unique key: `where: { managerId_customerId: { managerId, customerId } }`.
- `POST` returns 404 up front if the manager or any customerId is missing — no partial writes.
- `POST` counts a row as `assigned` vs `alreadyAssigned` by comparing `assignedAt` to now (1s threshold). The composite UNIQUE keeps the DB invariant even if the heuristic misfires on slow clocks.
- `DELETE /batch` is idempotent — missing pairs go into `notFound`, not errors.
- Errors: 400 (validation), 401, 403 (manager viewing another manager's list), 404 (manager/customer missing), 409 not raised (upsert swallows the duplicate-collision race).

### Collections (`src/routes/collections.ts`) — T9
One row per store visit (`Collection`) + one row per SKU in that visit (`CollectionDetail`). GPS verification is computed server-side from the mobile-reported coords vs the customer's geocoded location — `isVerified` flips true when the distance is under 100 m and both coordinates exist. POST is idempotent via `clientUuid` (the mobile app's batch key): replaying the same payload returns the existing record with HTTP 200, never 409.

| Method | Path | Auth | Body / Query | Returns |
| --- | --- | --- | --- | --- |
| GET    | `/collections`        | auth (manager: own; admin: all) | query: `page`(1), `pageSize`(20), `managerId?` (admin only), `customerId?`, `fromDate?`, `toDate?`, `isVerified?` | `{data: Collection[], total, page, pageSize}` — each row nested with `customer:{id,code,name,address}`, `manager:{id,name}`, `detailsCount` |
| GET    | `/collections/:id`    | auth (manager: own; admin: any) | path: `id` | full Collection + `details[]` with `cigarSpec` embedded |
| POST   | `/collections`        | auth (manager: must be assigned to customer; admin: any customer) | `{customerId, clientUuid, gpsLat, gpsLng, gpsAccuracy, photoUrls?, collectedAt, details:[{cigarSpecId, salesQty, actualStockLoose, countedStockLoose, actualStockBoxed, countedStockBoxed}]}` | 201 + created Collection (or 200 + existing on idempotent replay) |
| DELETE | `/collections/:id`    | ADMIN | path: `id` | `{id, deleted:true}` — hard delete, cascades to CollectionDetail |

- `distanceToCustomerM = haversineDistance(customer.lat, customer.lng, gpsLat, gpsLng)` (Earth R = 6 371 km). `null` if either side is missing or input is non-finite.
- `isVerified = distance != null && distance < 100`.
- `managerId` on every Collection is always `req.user.sub` — the body has no `managerId` field; admins create on their own behalf (cross-manager delegation, if needed later, would be a separate body field).
- `photoUrls` is stored as a JSON-encoded TEXT string (SQLite has no JSON type). Every response parses it back to `string[]`.
- POST runs inside `prisma.$transaction`: a header `Collection` row + all `CollectionDetail` rows commit atomically. FK violations on unknown `cigarSpecId` are pre-validated inside the transaction so the error is a clean 400, not a Prisma P2003.
- `clientUuid` is the idempotency key. The route does an upfront `findUnique` by `clientUuid`; on hit returns 200 with the existing record. On race (concurrent insert), the unique-constraint catch (P2002) refetches and still returns 200.
- List view excludes `details` (only `detailsCount`) and excludes `customer.lat/lng` to keep payloads small for the dashboard; `GET /:id` returns everything.
- Errors: 400 (validation, bad date, unknown cigarSpec), 401, 403 (manager creating on unassigned customer / reading another manager's visit), 404 (customer/collection), 409 not raised (idempotency).

### Collection batch upload (`src/routes/collections.ts`) — T11
Mobile offline-sync endpoint. The collector visits N stores during the day without a network connection; at end-of-shift the app POSTs every queued visit in one request. Up to 50 records per batch, per-record idempotency via `clientUuid`, per-record error capture — one bad record never aborts the others.

| Method | Path | Auth | Body | Returns |
| --- | --- | --- | --- | --- |
| POST   | `/collections/batch`   | auth (manager: must be assigned per record; admin: any customer) | `{records: [{customerId, clientUuid, gpsLat, gpsLng, gpsAccuracy, photoUrls?, collectedAt, details:[{cigarSpecId, salesQty, actualStockLoose, countedStockLoose, actualStockBoxed, countedStockBoxed}]}]}` (1–50 records) | `{inserted: N, skipped: M, errors: [{index, clientUuid, reason}]}` |

#### Per-record flow
1. **Parse `collectedAt`** — bad date captured in `errors[]` with reason.
2. **Idempotency pre-check** — one `findMany({clientUuid: {in: [...]}})` covers every record's `clientUuid`. Pre-existing ones go to `skipped`.
3. **Customer existence** — batched `findMany` over the still-pending records' `customerId`s. Missing customers → `errors[]` with `Customer N not found`.
4. **Manager assignment** — when caller is `MANAGER`, one `findMany` over `CustomerAssignment` confirms the caller is assigned to each still-pending record's customer. Unassigned → `errors[]` with `You are not assigned to this customer`. `ADMIN` skips this check.
5. **CigarSpec existence** — one `findMany` over the union of all still-pending records' `cigarSpecId`s. Records whose `details` reference a missing spec → `errors[]` with `CigarSpec(s) not found: <ids>`.
6. **Bulk insert** — surviving records are inserted in a single `prisma.$transaction` array call (one header + nested details per record, all-or-nothing).
7. **Race fallback** — if the bulk transaction aborts on P2002 (another concurrent batch just inserted one of the same `clientUuid`s), each surviving record is re-tried individually in its own short transaction. P2002 per record → `skipped`; any other error → `errors[]`.
8. **Tally** — every remaining `pending` slot is counted as `inserted`; `errors[]` is the union of step 1–5 + step 7 failures.

- `distanceToCustomerM` and `isVerified` are computed per record from the customer's geocoded lat/lng, same as the single POST.
- `managerId` is always `req.user.sub` — admins create on their own behalf; the body has no `managerId` field.
- `photoUrls` is JSON-encoded into the existing `TEXT` column; default `[]` when omitted.
- `1 ≤ records.length ≤ 50` is enforced by the Ajv schema → 400 when outside.
- Response is always 200 with the per-record counters (no 4xx for partial failure). The single POST and the batch endpoint are independent — replaying the same `clientUuid` through either path is idempotent.
- Errors: 400 (validation, e.g. empty `records` array), 401, 200 with mixed counters (per-record issues never abort the batch).

### OSS STS (`src/routes/oss.ts`) — T10
Temporary credentials for the mobile app to upload collection photos **directly to Aliyun OSS** — no bytes flow through the backend. Each call issues a 1-hour credential pair scoped to a single user's prefix (`photos/${userId}/*`); cross-user writes are blocked at the OSS policy layer, not just by app logic. Both endpoints require a valid Bearer JWT.

| Method | Path | Auth | Body | Returns |
| --- | --- | --- | --- | --- |
| POST   | `/oss/sts-token`         | auth | empty | `{accessKeyId, accessKeySecret, securityToken, expiration, bucket, region, uploadPrefix}` — 500 with a clear "OSS STS not configured (...)" message if env vars are missing |
| POST   | `/oss/sts-token/dev`     | auth (DEV only — 404 when `NODE_ENV=production`) | empty | same shape as the real endpoint, plus `_mock: true`; values are `MOCK_*` placeholders; no STS API call |

#### Required env vars (all optional in code, required at request time)
| Var | Purpose |
| --- | --- |
| `OSS_REGION` | Bucket region id, e.g. `oss-cn-shanghai` |
| `OSS_BUCKET` | OSS bucket name, e.g. `cigar-photos` |
| `OSS_STS_ROLE_ARN` | RAM role trusted by STS, format `acs:ram::${accountID}:role/${roleName}` |
| `OSS_STS_ACCESS_KEY_ID` | Long-lived AccessKeyId used to call `sts:AssumeRole` (NEVER returned to client) |
| `OSS_STS_ACCESS_KEY_SECRET` | Long-lived secret paired with the above (NEVER returned to client) |

#### Security model
- **Credentials expire in 1 hour** (Aliyun's hard max for STS — range is 900..3600 s). The mobile app must refresh before expiry; on a 401 from OSS it re-fetches `/oss/sts-token`.
- **Inline RAM policy** grants ONLY `oss:PutObject` and `oss:GetObject` on the exact prefix `acs:oss:${region}:*:${bucket}/photos/${userId}/*`. No list/delete/admin actions reachable.
- **Path-prefix binding is server-side.** The user's id comes from `req.user.sub` (the JWT `sub` claim); the request body has no `userId` field. Path traversal is impossible because `userId` is validated as a positive integer (`Number.isInteger` and `> 0`) before it touches the policy.
- **Long-lived STS keys stay on the server.** The client only ever sees the temporary `accessKeyId/Secret/SecurityToken` triple, which is useless after expiry.
- **Dev mock is gated on `NODE_ENV !== 'production'`.** Returns 404 in prod so the endpoint can't leak into a real deployment.

#### Mobile-app usage sketch (uni-app)
1. `POST /oss/sts-token` with `Authorization: Bearer ${jwt}` → `{accessKeyId, accessKeySecret, securityToken, expiration, bucket, region, uploadPrefix}`.
2. Use those creds with the OSS SDK (e.g. `ali-oss`) initialized at `https://${bucket}.${region}.aliyuncs.com`.
3. `put(objectKey, filePath)` where `objectKey = uploadPrefix + filename` — typically `uploadPrefix = "photos/${userId}/"` plus a UUID.
4. Store the returned `photoUrls` strings in the next `POST /collections` payload (already part of the T9 schema's `photoUrls: string[]`).

Errors: 400 (bad userId, should not happen since the JWT guarantees `sub` is a positive int), 401 (no/invalid token), 500 (OSS env vars missing or STS API call failed — message is human-readable so the mobile app can surface it).

## Database

### Dev (default)
SQLite. `DATABASE_URL="file:./dev.db"` in `.env`. No setup needed — Prisma creates the file on first migrate.

### Production (MySQL 8)
1. Edit `prisma/schema.prisma`:
   ```prisma
   datasource db {
     provider = "mysql"           // was: sqlite
     url      = env("DATABASE_URL")
   }
   ```
2. Edit `.env`:
   ```
   DATABASE_URL="mysql://cigar_app:CHANGE_ME@127.0.0.1:3306/cigardb"
   ```
3. Wipe the old migration folder ONLY if you never plan to return to SQLite:
   ```
   rm -rf prisma/migrations
   npx prisma migrate dev --name init
   npx prisma db seed
   ```
4. If you want to keep BOTH dev/prod histories, generate the MySQL migration against an empty database and place it in `prisma/migrations/` with a new timestamp. SQLite and MySQL migration directories cannot share a `migration_lock.toml` provider.

### Schema highlights
- 6 models, all using `snake_case @map` so SQL matches production naming.
- `Float` (not `Decimal`) for lat/lng — SQLite has no native DECIMAL type, and Float is sufficient for ~1m GPS precision.
- Unique keys: `User.username`, `Customer.code`, `CigarSpec.code`, `Collection.clientUuid` (idempotency), plus composite uniques on `CustomerAssignment(managerId, customerId)` and `CollectionDetail(collectionId, cigarSpecId)`.
- Composite indexes on `Collection(managerId, collectedAt)` and `Collection(customerId, collectedAt)` for the timeline queries the admin dashboard needs.