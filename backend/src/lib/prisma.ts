// Prisma client singleton.
//
// Why a singleton:
//  - One shared connection pool per Node process.
//  - In dev, `tsx watch` reloads modules on every save; without this guard
//    we'd leak a fresh client (and a fresh pool) on every reload until the
//    process eventually OOMs.
//
// Pattern: stash the instance on `globalThis` in non-prod so HMR doesn't
// create duplicates. In production each process is one-shot, so we just
// `new PrismaClient()`.

import { PrismaClient } from '@prisma/client';
import { config } from '../config/index.js';

const globalForPrisma = globalThis as unknown as {
  __prisma__: PrismaClient | undefined;
};

export const prisma: PrismaClient =
  globalForPrisma.__prisma__ ??
  new PrismaClient({
    log:
      config.nodeEnv === 'production'
        ? ['error']
        : ['warn', 'error'],
  });

if (config.nodeEnv !== 'production') {
  globalForPrisma.__prisma__ = prisma;
}

// Graceful shutdown — close the pool when Fastify is closing.
export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}