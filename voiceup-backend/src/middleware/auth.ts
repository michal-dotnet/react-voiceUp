import type { Request, RequestHandler } from 'express';
import type { UserRole } from '../generated/prisma/enums.js';
import { errors } from '../lib/errors.js';
import { verifyAccessToken } from '../lib/jwt.js';
import type { Db } from '../lib/prisma.js';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

/**
 * Resolves the current user from the Bearer token. The user is always loaded from the
 * database, so role changes and deleted accounts take effect immediately.
 * A missing token leaves `req.user` unset; an invalid token is always a 401.
 */
export function authenticate(prisma: Db, jwtSecret: string): RequestHandler {
  return async (req, _res, next) => {
    const token = bearerToken(req);
    if (!token) {
      next();
      return;
    }
    const userId = verifyAccessToken(token, jwtSecret);
    if (!userId) {
      next(errors.unauthorized('Invalid or expired access token.'));
      return;
    }
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true },
    });
    if (!user) {
      next(errors.unauthorized('Invalid or expired access token.'));
      return;
    }
    req.user = user;
    next();
  };
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  next(req.user ? undefined : errors.unauthorized());
};

export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (!req.user) next(errors.unauthorized());
  else if (req.user.role !== 'ADMIN') next(errors.forbidden());
  else next();
};

/** For handlers mounted behind requireAuth: returns the user or throws 401. */
export function currentUser(req: Request): AuthUser {
  if (!req.user) throw errors.unauthorized();
  return req.user;
}
