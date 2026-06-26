// Server bootstrap — loads .env via config/, builds the Fastify app,
// and starts listening on PORT.
//
// This replaces the T1 stub. Tests can call `buildApp()` directly without
// ever booting the listener.

import { buildApp } from './app.js';
import { config } from './config/index.js';

async function main(): Promise<void> {
  const app = await buildApp();

  // Graceful shutdown — let in-flight requests finish before exiting.
  const signals: ReadonlyArray<NodeJS.Signals> = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.once(signal, () => {
      app.log.info({ signal }, 'received shutdown signal');
      void app.close().then(
        () => {
          process.exit(0);
        },
        (err: unknown) => {
          app.log.error({ err }, 'error during shutdown');
          process.exit(1);
        },
      );
    });
  }

  try {
    await app.listen({ port: config.port, host: config.host });
  } catch (err: unknown) {
    app.log.error({ err }, 'failed to start server');
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  // Last-resort logger — pino may not be available if config import failed.
  // eslint-disable-next-line no-console
  console.error('[server] fatal:', err);
  process.exit(1);
});