# backend

Fastify v5 + Prisma + TypeScript REST API for the cigar-collection monorepo.

## What it is
- HTTP API consumed by both the admin SPA and the uni-app mobile clients.
- Stack: Fastify 5, Prisma 6 ORM, TypeScript 5, JWT auth, role-based access.
- Data: MySQL (production) / SQLite (dev), defined in `prisma/schema.prisma` (T2).

## Status
T2 done — 6-table schema + 45-row CigarSpec seed. T3 done — Fastify skeleton + JWT auth + `/health`. T5 done — `/users` CRUD. T7 done — `/cigar-specs` CRUD (6 endpoints, soft delete, immutable codes). T6 done — `/customers` CRUD + `/customers/import` xlsx bulk import with AMap geocoding. T8 done — `/assignments` manager↔customer CRUD + batch upsert/delete via composite UNIQUE upsert.

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
                    #   /customers/import, /assignments, /health, ...
  lib/             # prisma singleton, jwt helpers, amap geocoding
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