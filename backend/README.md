# backend

Fastify v5 + Prisma + TypeScript REST API for the cigar-collection monorepo.

## What it is
- HTTP API consumed by both the admin SPA and the uni-app mobile clients.
- Stack: Fastify 5, Prisma 6 ORM, TypeScript 5, JWT auth, role-based access.
- Data: MySQL (production) / SQLite (dev), defined in `prisma/schema.prisma` (T2).

## Status
T2 done — 6-table schema + 45-row CigarSpec seed. T3 wires up Fastify routes next. T7 done — `/cigar-specs` CRUD (6 endpoints, soft delete, immutable codes).

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
  server.ts        # Fastify boot (T1 stub)
  routes/          # /auth, /customers, /visits, /inventory, ...   (T3+)
  plugins/         # prisma, jwt, rate-limit, cors                  (T3+)
  services/        # business logic                                 (T5+)
  types/           # shared types                                   (T3+)
prisma/
  schema.prisma    # 6 models — User, Customer, CigarSpec,
                   #   CustomerAssignment, Collection, CollectionDetail
  seed.ts          # 45 CigarSpec rows (idempotent)
  migrations/      # SQL migration history
  dev.db           # SQLite file (gitignored)
```

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