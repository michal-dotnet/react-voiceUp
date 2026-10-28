import { describe, expect, it } from 'vitest';
import { EnvValidationError, loadEnv } from '../src/config/env.js';

const REQUIRED = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/voiceup',
  JWT_SECRET: 'x'.repeat(32),
};

describe('loadEnv', () => {
  it('applies development defaults', () => {
    const env = loadEnv({ ...REQUIRED });

    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      LOG_LEVEL: 'debug',
      CORS_ORIGINS: [],
      TRUST_PROXY: 0,
      RATE_LIMIT_MAX: 300,
    });
  });

  it('chooses a quiet log level in tests and info in production', () => {
    expect(loadEnv({ ...REQUIRED, NODE_ENV: 'test' }).LOG_LEVEL).toBe('silent');
    expect(loadEnv({ ...REQUIRED, NODE_ENV: 'production' }).LOG_LEVEL).toBe('info');
  });

  it('lets LOG_LEVEL override the default', () => {
    expect(loadEnv({ ...REQUIRED, NODE_ENV: 'production', LOG_LEVEL: 'warn' }).LOG_LEVEL).toBe(
      'warn',
    );
  });

  it('parses a comma-separated CORS_ORIGINS list', () => {
    const env = loadEnv({
      ...REQUIRED,
      CORS_ORIGINS: ' http://localhost:5173 , https://voiceup.example ,',
    });

    expect(env.CORS_ORIGINS).toEqual(['http://localhost:5173', 'https://voiceup.example']);
  });

  it('rejects out-of-range ports', () => {
    expect(() => loadEnv({ ...REQUIRED, PORT: '70000' })).toThrow(EnvValidationError);
  });

  it('rejects unknown environments', () => {
    expect(() => loadEnv({ ...REQUIRED, NODE_ENV: 'staging' })).toThrow(EnvValidationError);
  });

  it('requires DATABASE_URL and a long JWT_SECRET', () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
    expect(() => loadEnv({ ...REQUIRED, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
    expect(() => loadEnv({ ...REQUIRED, DATABASE_URL: 'mysql://x' })).toThrow(/DATABASE_URL/);
  });

  it('applies auth defaults', () => {
    expect(loadEnv({ ...REQUIRED })).toMatchObject({
      JWT_EXPIRES_IN_SECONDS: 7200,
      AUTH_RATE_LIMIT_MAX: 20,
    });
  });

  it('never echoes the JWT secret in errors', () => {
    try {
      loadEnv({ ...REQUIRED, JWT_SECRET: 'tooshortsecret' });
    } catch (error) {
      expect((error as Error).message).not.toContain('tooshortsecret');
    }
  });

  it('names the invalid variable but never echoes its value', () => {
    expect(() => loadEnv({ ...REQUIRED, CORS_ORIGINS: 'not-a-valid-origin' })).toThrow(
      /CORS_ORIGINS/,
    );

    try {
      loadEnv({ ...REQUIRED, CORS_ORIGINS: 'not-a-valid-origin' });
    } catch (error) {
      expect((error as Error).message).not.toContain('not-a-valid-origin');
    }
  });
});
