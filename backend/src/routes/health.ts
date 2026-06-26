// GET /health — liveness + DB connectivity probe.
// Public route, no auth required. Used by load balancers and the admin UI.

import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => {
    let db: 'connected' | 'disconnected' = 'disconnected';
    try {
      // $queryRaw is the cheapest possible round-trip — no model parsing.
      await prisma.$queryRaw`SELECT 1`;
      db = 'connected';
    } catch {
      db = 'disconnected';
    }
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      db,
    };
  });
}