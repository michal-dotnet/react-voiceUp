import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildApp } from './helpers/setup.js';

describe('GET /api/health', () => {
  it('returns 200 with a status payload', async () => {
    const res = await request(buildApp()).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toMatchObject({
      data: { status: 'ok', service: 'voiceup-backend' },
    });
    expect(typeof res.body.data.uptimeSeconds).toBe('number');
    expect(Number.isNaN(Date.parse(res.body.data.timestamp as string))).toBe(false);
  });
});

describe('GET /api/health/ready', () => {
  it('reports the database as reachable', async () => {
    const res = await request(buildApp()).get('/api/health/ready');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { status: 'ready', database: 'ok' } });
  });
});

describe('security headers', () => {
  it('sets protective headers and hides the framework', async () => {
    const res = await request(buildApp()).get('/api/health');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('CORS', () => {
  it('allows origins on the allowlist', async () => {
    const app = buildApp({ CORS_ORIGINS: 'http://localhost:5173' });
    const res = await request(app).get('/api/health').set('Origin', 'http://localhost:5173');

    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('does not allow origins outside the allowlist', async () => {
    const app = buildApp({ CORS_ORIGINS: 'http://localhost:5173' });
    const res = await request(app).get('/api/health').set('Origin', 'https://evil.example');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('sends no CORS headers when no origins are configured', async () => {
    const res = await request(buildApp()).get('/api/health').set('Origin', 'http://localhost:5173');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('error responses', () => {
  it('returns a 404 error body for unknown routes', async () => {
    const res = await request(buildApp()).get('/api/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Route not found.' } });
  });

  it('returns INVALID_JSON for malformed JSON bodies', async () => {
    const res = await request(buildApp())
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{"broken":');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });

  it('returns PAYLOAD_TOO_LARGE for oversized bodies', async () => {
    const res = await request(buildApp())
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ text: 'x'.repeat(200 * 1024) }));

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('rate limiting', () => {
  it('rejects requests over the limit with RATE_LIMITED', async () => {
    const app = buildApp({ RATE_LIMIT_MAX: '2' });

    const first = await request(app).get('/api/does-not-exist');
    const second = await request(app).get('/api/does-not-exist');
    const third = await request(app).get('/api/does-not-exist');

    expect(first.status).toBe(404);
    expect(second.status).toBe(404);
    expect(third.status).toBe(429);
    expect(third.body.error.code).toBe('RATE_LIMITED');
  });

  it('never rate-limits the health check', async () => {
    const app = buildApp({ RATE_LIMIT_MAX: '2' });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
    }
  });
});
