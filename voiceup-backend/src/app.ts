import express, { type Express } from 'express';
import type { AppDependencies } from './deps.js';
import { authenticate } from './middleware/auth.js';
import { createErrorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
import { corsPolicy, globalRateLimiter, securityHeaders } from './middleware/security.js';
import { createDocsRouter } from './docs/docs.routes.js';
import { createApiRouter } from './routes.js';

export type { AppDependencies } from './deps.js';

/**
 * Builds the Express application without starting a server, so tests can use it directly.
 * Order matters: logging, security headers, CORS, rate limiting, body parsing,
 * authentication, routes, 404, and finally the error handler.
 */
export function createApp(deps: AppDependencies): Express {
  const { env, logger, prisma } = deps;
  const app = express();

  app.set('trust proxy', env.TRUST_PROXY);
  app.set('query parser', 'simple');

  app.use(requestLogger(logger));
  app.use(securityHeaders());
  app.use(corsPolicy(env));
  app.use('/api', globalRateLimiter(env));
  app.use(express.json({ limit: '100kb' }));

  app.use('/api/docs', createDocsRouter());
  app.use('/api', authenticate(prisma, env.JWT_SECRET));
  app.use('/api', createApiRouter(deps));

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));

  return app;
}
