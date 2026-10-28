import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppError, ErrorCodes } from '../src/lib/errors.js';
import { createLogger } from '../src/lib/logger.js';
import { createErrorHandler } from '../src/middleware/errorHandler.js';

function appFailingWith(error: unknown, logLines: string[] = []) {
  const app = express();
  app.get('/fail', (_req, _res, next) => {
    next(error);
  });
  app.use(createErrorHandler(createLogger('error', (line) => logLines.push(line))));
  return app;
}

describe('createErrorHandler', () => {
  it('serializes AppError with its status, code and details', async () => {
    const error = new AppError(409, ErrorCodes.BAD_REQUEST, 'Conflict happened.', { field: 'x' });
    const res = await request(appFailingWith(error)).get('/fail');

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: { code: 'BAD_REQUEST', message: 'Conflict happened.', details: { field: 'x' } },
    });
  });

  it('turns ZodError into a 400 VALIDATION_ERROR with field details', async () => {
    const parsed = z.object({ name: z.string() }).safeParse({});
    const res = await request(appFailingWith(parsed.error)).get('/fail');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual([
      { path: 'name', message: expect.any(String) as unknown },
    ]);
  });

  it('hides internals of unexpected errors but logs them', async () => {
    const logLines: string[] = [];
    const res = await request(
      appFailingWith(new Error('database password is hunter2'), logLines),
    ).get('/fail');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
    });
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
    expect(logLines).toHaveLength(1);
  });
});
