// Fastify application factory.
//
// Single `buildApp()` function the test suite, dev server, and future
// worker entry points all share. Keeps side-effects (listening) out of the
// factory so it stays unit-testable with `app.inject()`.

import Fastify, { type FastifyInstance, type FastifyError } from 'fastify';
import fastifyHelmet from '@fastify/helmet';
import fastifyCors from '@fastify/cors';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyJwt from '@fastify/jwt';
import fastifyMultipart from '@fastify/multipart';

import { config } from './config/index.js';
import { registerJwt } from './lib/jwt.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerCigarSpecRoutes } from './routes/cigar-specs.js';
import { registerUsersRoutes } from './routes/users.js';
import { registerCustomerRoutes } from './routes/customers.js';
import { registerCustomerImportRoutes } from './routes/customers-import.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      // Redact the Authorization header so tokens don't end up in log files.
      redact: ['req.headers.authorization'],
    },
    // Trust proxy headers when running behind nginx in prod (1 hop).
    trustProxy: config.nodeEnv === 'production' ? 1 : false,
    // Fail fast on unknown routes — better 404s than mysterious 500s.
    disableRequestLogging: false,
    ajv: {
      customOptions: {
        removeAdditional: false,
        useDefaults: true,
        coerceTypes: true,
        allErrors: false,
        strict: true,
      },
    },
  });

  // ─── Security headers ────────────────────────────────────────────────────
  await app.register(fastifyHelmet, {
    // We don't ship any HTML from this API; default CSP is fine.
    contentSecurityPolicy: false,
  });

  // ─── CORS ────────────────────────────────────────────────────────────────
  // Admin SPA runs on http://localhost:5173 in dev.
  await app.register(fastifyCors, {
    origin: (origin, cb) => {
      const allowed = ['http://localhost:5173'];
      if (origin === undefined || allowed.includes(origin)) {
        cb(null, true);
        return;
      }
      cb(new Error(`CORS: origin ${origin} not allowed`), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // ─── Rate limiting ───────────────────────────────────────────────────────
  await app.register(fastifyRateLimit, {
    max: 100,
    timeWindow: '1 minute',
    // Skip for the health probe so load balancers don't get throttled.
    allowList: (req) => req.url === '/health',
  });

  // ─── Multipart (customer .xlsx import) ──────────────────────────────────
  // 10MB cap is more than enough for the customer-import xlsx — even
  // 100k-row imports of 5-column data stay well under a megabyte.
  await app.register(fastifyMultipart, {
    limits: {
      fileSize: 10 * 1024 * 1024,
    },
  });

  // ─── JWT ─────────────────────────────────────────────────────────────────
  await app.register(fastifyJwt, {
    secret: config.jwtSecret,
    sign: {
      expiresIn: config.jwtExpiresIn,
    },
  });
  // Hand the instance to the helper module so route handlers can sign/verify
  // without taking `app` as an argument everywhere.
  registerJwt(app);

  // ─── Decorate app with prisma for convenience ────────────────────────────
  // Routes import `prisma` directly from lib/prisma, but decorating lets
  // plugins (and tests) reach it via `app.prisma` if they want.
  const { prisma, disconnectPrisma } = await import('./lib/prisma.js');
  app.decorate('prisma', prisma);

  app.addHook('onClose', async () => {
    await disconnectPrisma();
  });

  // ─── Routes ──────────────────────────────────────────────────────────────
  await registerHealthRoutes(app);
  await registerAuthRoutes(app);
  await registerCigarSpecRoutes(app);
  await registerUsersRoutes(app);
  await registerCustomerRoutes(app);
  await registerCustomerImportRoutes(app);

  // ─── Centralized error handler ───────────────────────────────────────────
  app.setErrorHandler<FastifyError>((err, _req, reply) => {
    // Validation errors already carry a useful statusCode; bubble them up.
    if (err.statusCode !== undefined && err.statusCode >= 400 && err.statusCode < 500) {
      void reply.code(err.statusCode).send({
        statusCode: err.statusCode,
        error: err.name,
        message: err.message,
      });
      return;
    }
    app.log.error({ err }, 'unhandled error');
    void reply.code(500).send({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Something went wrong',
    });
  });

  return app;
}