# backend

Fastify v5 + Prisma + TypeScript REST API for the cigar-collection monorepo.

## What it is
- HTTP API consumed by both the admin SPA and the uni-app mobile clients.
- Stack: Fastify 5, Prisma 6 ORM, TypeScript 5, JWT auth, role-based access.
- Data: PostgreSQL (production) / SQLite (dev), defined in `prisma/schema.prisma` (T2).

## Status
T1 scaffold only — no business routes, no schema. See `/home/wewe/.omo/plans/cigar-collection.md`.

## Scripts
| Command            | What it does                                  |
| ------------------ | --------------------------------------------- |
| `pnpm dev`         | `tsx watch` — hot-reload TS, port from `.env` |
| `pnpm build`       | Compile to `dist/` with `tsc`                 |
| `pnpm start`       | Run compiled `dist/server.js`                 |
| `pnpm test`        | `vitest run` (unit + supertest integration)   |
| `pnpm prisma:migrate` | `prisma migrate dev` (T2+)                |
| `pnpm prisma:seed` | `tsx prisma/seed.ts` (T2+)                    |

## Layout (planned)
```
src/
  server.ts        # Fastify boot
  routes/          # /auth, /customers, /visits, /inventory, ...
  plugins/         # prisma, jwt, rate-limit, cors
  services/        # business logic
  types/           # shared types
prisma/
  schema.prisma    # T2
  seed.ts          # T2
```
