import { Router } from 'express';
import type { AppDependencies } from '../../deps.js';
import { authRateLimiter } from '../../middleware/security.js';
import { loginBody, registerBody } from './auth.schemas.js';
import { login, register } from './auth.service.js';

/**
 * Stateless JWT authentication (access token only). There is no server-side logout:
 * the client discards the token, which expires after JWT_EXPIRES_IN_SECONDS.
 */
export function createAuthRouter({ env, prisma }: AppDependencies): Router {
  const router = Router();
  const tokenConfig = { secret: env.JWT_SECRET, expiresInSeconds: env.JWT_EXPIRES_IN_SECONDS };

  router.use(authRateLimiter(env));

  router.post('/register', async (req, res) => {
    const result = await register(prisma, registerBody.parse(req.body), tokenConfig);
    res.status(201).json({ data: result });
  });

  router.post('/login', async (req, res) => {
    const result = await login(prisma, loginBody.parse(req.body), tokenConfig);
    res.json({ data: result });
  });

  return router;
}
