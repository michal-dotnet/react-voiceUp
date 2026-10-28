import cors from 'cors';
import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import type { Env } from '../config/env.js';
import { AppError, ErrorCodes } from '../lib/errors.js';

/** Secure HTTP headers (CSP, nosniff, HSTS, no X-Powered-By, ...). */
export function securityHeaders(): RequestHandler {
  return helmet();
}

/**
 * CORS allowlist from CORS_ORIGINS. With no origins configured, no CORS headers are sent,
 * so browsers block cross-origin access. Authentication uses the Authorization header,
 * so credentials (cookies) are intentionally not enabled.
 */
export function corsPolicy(env: Env): RequestHandler {
  return cors({
    origin: env.CORS_ORIGINS.length > 0 ? env.CORS_ORIGINS : false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Guest-Token'],
    maxAge: 600,
  });
}

function limiter(
  windowMs: number,
  limit: number,
  skip?: (path: string) => boolean,
): RequestHandler {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    ...(skip && { skip: (req) => skip(req.path) }),
    handler: (_req, _res, next) => {
      next(
        new AppError(429, ErrorCodes.RATE_LIMITED, 'Too many requests. Please try again later.'),
      );
    },
  });
}

/**
 * Global per-IP rate limit for the API (in-memory store, suitable for a single instance).
 * The health checks are exempt so uptime monitors never get throttled.
 */
export function globalRateLimiter(env: Env): RequestHandler {
  return limiter(env.RATE_LIMIT_WINDOW_MS, env.RATE_LIMIT_MAX, (path) =>
    path.startsWith('/health'),
  );
}

/** Stricter limit for register and login, against credential stuffing and brute force. */
export function authRateLimiter(env: Env): RequestHandler {
  return limiter(env.RATE_LIMIT_WINDOW_MS, env.AUTH_RATE_LIMIT_MAX);
}

/** Hourly per-IP limit for guest confirmations. Applied only to unauthenticated requests. */
export function guestConfirmRateLimiter(env: Env): RequestHandler {
  const limit = limiter(60 * 60 * 1000, env.GUEST_CONFIRM_RATE_LIMIT_MAX);
  return (req, res, next) => {
    if (req.user) {
      next();
      return;
    }
    void limit(req, res, next);
  };
}

/** Hourly limit for expensive writes: creating issues and uploading files. */
export function writeRateLimiter(env: Env): RequestHandler {
  return limiter(60 * 60 * 1000, env.WRITE_RATE_LIMIT_MAX);
}
