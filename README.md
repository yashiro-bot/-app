# cigar-collection

雪茄门店客户采集与管理系统 (Cigar shop customer collection & management system).

A monorepo with three independently-built, independently-deployable sub-projects:

| Path           | Stack                                       | Audience          | Deploy target              |
| -------------- | ------------------------------------------- | ----------------- | -------------------------- |
| `backend/`     | Fastify 5 · Prisma 6 · TypeScript · JWT     | (API only)        | Node server (Aliyun ECS)   |
| `admin/`       | Vue 3 · Vite · Element Plus · Pinia · ECharts | Store managers (<20) | Static SPA (Aliyun OSS)    |
| `mobile-app/`  | uni-app (Vue 3) · Pinia · axios · Sass      | Field staff       | H5 static + iOS/Android    |
| `docs/`        | Deployment + API specs                      |                   | Markdown in repo           |

This is a **3-project monorepo**, NOT a workspaces-managed monorepo. Each sub-project has its own `package.json` and lockfile. There is no top-level `npm install` — install inside each sub-project.

## Quick start

```bash
# 1. install dependencies (each sub-project is independent)
cd backend      && npm install
cd ../admin     && npm install
cd ../mobile-app && npm install

# 2. run dev servers (separate terminals)
make dev-backend       # Fastify on http://localhost:3000
make dev-admin         # Vite on http://localhost:5173
make dev-mobile-h5     # uni-app H5 on http://localhost:5173
make dev-mobile-app    # opens HBuilderX for APP build

# 3. type-check + build everything
make build-all
make test-all
```

## Project layout

```
cigar-collection/
├── backend/             # Fastify + Prisma + TypeScript REST API
│   ├── src/
│   │   └── server.ts    # T1: prints "cigar backend starting..." and exits
│   ├── prisma/          # T2: schema.prisma + seed.ts
│   ├── tsconfig.json
│   └── package.json
│
├── admin/               # Vue 3 + Vite SPA for managers
│   ├── src/
│   │   ├── main.ts
│   │   ├── App.vue
│   │   ├── router/
│   │   ├── views/Home.vue
│   │   └── components/
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
│
├── mobile-app/          # uni-app (Vue 3) for H5 + iOS + Android
│   ├── src/
│   │   ├── main.ts
│   │   ├── App.vue
│   │   ├── manifest.json
│   │   ├── pages.json
│   │   └── pages/
│   │       ├── login/
│   │       ├── customers/   (tabBar)
│   │       ├── collect/
│   │       ├── history/     (tabBar)
│   │       └── profile/     (tabBar)
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
│
├── docs/
│   ├── deploy/          # Deployment runbooks
│   └── api/             # API spec
│
├── Makefile
├── .gitignore
└── README.md
```

## Conventions

- **No workspaces.** Each sub-project has its own deps and lockfile.
- **Stack pin**: backend uses Prisma 6 (not 7 — Prisma 7 too new), TypeScript 5 (not 6 — too new). mobile-app uses Vite 5.2.8 (uni-app plugin peer-pinned).
- **No business code in T1.** This commit is pure scaffolding.
- **Conventional commits** for history clarity. First commit: `chore(init): scaffold cigar-collection monorepo`.

## Status

T1 complete (scaffold). See `/home/wewe/.omo/plans/cigar-collection.md` for the full task breakdown.

| Task | Description                                | Status |
| ---- | ------------------------------------------ | ------ |
| T1   | Monorepo scaffold (backend/admin/mobile/docs/Makefile/.gitignore) | done   |
| T2   | Prisma schema + seed                       | TBD    |
| T3   | Backend skeleton (auth, customers, visits) | TBD    |
| T4   | 阿里云 deployment docs                     | TBD    |
| ...  | ...                                        | TBD    |
