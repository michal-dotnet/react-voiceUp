import type { RequestHandler } from 'express';
import type { Logger } from '../lib/logger.js';

/**
 * Logs one line per finished request: method, path, status and duration.
 * The query string is dropped on purpose, and headers and bodies are never logged.
 */
export function requestLogger(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const startedAt = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      logger.info('Request completed', {
        method: req.method,
        path: req.originalUrl.split('?')[0],
        status: res.statusCode,
        durationMs: Math.round(durationMs),
      });
    });
    next();
  };
}
