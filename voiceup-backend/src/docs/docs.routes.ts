import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { buildOpenApiDocument } from './openapi.js';

/** Swagger UI at /api/docs and the raw document at /api/docs/openapi.json. */
export function createDocsRouter(): Router {
  const router = Router();
  const document = buildOpenApiDocument();

  router.get('/openapi.json', (_req, res) => {
    res.json(document);
  });
  router.use('/', swaggerUi.serve, swaggerUi.setup(document, { customSiteTitle: 'VoiceUp API' }));

  return router;
}
