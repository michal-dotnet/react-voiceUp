import { createApp } from './app.js';
import { loadEnv, type Env } from './config/env.js';
import { createLogger } from './lib/logger.js';
import { createPrisma } from './lib/prisma.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

function loadEnvOrExit(): Env {
  try {
    return loadEnv();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

const env = loadEnvOrExit();
const logger = createLogger(env.LOG_LEVEL);
const prisma = createPrisma(env.DATABASE_URL);
const app = createApp({ env, logger, prisma });

const server = app.listen(env.PORT, () => {
  logger.info('Server listening', { port: env.PORT, environment: env.NODE_ENV });
});

server.on('error', (error) => {
  logger.error('Server failed to start', { errorMessage: error.message });
  process.exit(1);
});

function shutdown(signal: string): void {
  logger.info('Shutting down', { signal });
  // Force exit if open connections do not drain in time.
  setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS).unref();
  server.close((error) => {
    prisma
      .$disconnect()
      .catch(() => undefined)
      .finally(() => process.exit(error ? 1 : 0));
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', {
    errorMessage: reason instanceof Error ? reason.message : String(reason),
  });
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { errorMessage: error.message, stack: error.stack });
  process.exit(1);
});
