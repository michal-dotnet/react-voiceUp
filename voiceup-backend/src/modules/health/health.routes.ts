import { Router } from 'express';
import type { AppDependencies } from '../../deps.js';

export function createHealthRouter({ prisma, logger }: AppDependencies): Router {
  const router = Router();

  /** Liveness: the process is up. Never touches the database. */
  router.get('/', (_req, res) => {
    res.json({
      data: {
        status: 'ok',
        service: 'voiceup-backend',
        uptimeSeconds: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
      },
    });
  });

  /** Readiness: the database answers. Returns 503 when it does not. */
  router.get('/ready', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ data: { status: 'ready', database: 'ok' } });
    } catch (error) {
      logger.warn('Readiness check failed', {
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      res.status(503).json({ data: { status: 'unavailable', database: 'unreachable' } });
    }
  });

  return router;
}
