import { z } from 'zod';

const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'silent'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const NODE_ENVS = ['development', 'test', 'production'] as const;
type NodeEnv = (typeof NODE_ENVS)[number];

const DEFAULT_LOG_LEVEL: Record<NodeEnv, LogLevel> = {
  development: 'debug',
  test: 'silent',
  production: 'info',
};

const positiveInt = (fallback: number) => z.coerce.number().int().positive().default(fallback);

const envSchema = z
  .object({
    NODE_ENV: z.enum(NODE_ENVS).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z.enum(LOG_LEVELS).optional(),
    CORS_ORIGINS: z
      .string()
      .default('')
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter((origin) => origin.length > 0),
      )
      .pipe(z.array(z.url())),
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),
    RATE_LIMIT_WINDOW_MS: positiveInt(15 * 60 * 1000),
    RATE_LIMIT_MAX: positiveInt(300),

    DATABASE_URL: z
      .string()
      .regex(/^postgres(ql)?:\/\//, 'must be a postgresql:// connection string'),

    JWT_SECRET: z.string().min(32, 'must be at least 32 characters'),
    /** Access token lifetime in seconds. Default: 2 hours. */
    JWT_EXPIRES_IN_SECONDS: positiveInt(2 * 60 * 60),

    /** Stricter per-IP limit for register/login, within RATE_LIMIT_WINDOW_MS. */
    AUTH_RATE_LIMIT_MAX: positiveInt(20),
    /** Per-IP limit for creating issues and uploading files, per hour. */
    WRITE_RATE_LIMIT_MAX: positiveInt(30),
    /** Guest (unauthenticated) confirmation requests per IP per hour. */
    GUEST_CONFIRM_RATE_LIMIT_MAX: positiveInt(20),
    /** Max guest confirmations per IP on one issue group (allows a few people behind one IP). */
    GUEST_CONFIRMATIONS_PER_IP: positiveInt(3),
  })
  .transform((env) => ({
    ...env,
    LOG_LEVEL: env.LOG_LEVEL ?? DEFAULT_LOG_LEVEL[env.NODE_ENV],
  }));

export type Env = z.output<typeof envSchema>;

export class EnvValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvValidationError';
  }
}

/**
 * Parses and validates environment variables. Error messages list the offending variable
 * names and reasons only, never their values, so secrets cannot leak into logs.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map(
      (issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`,
    );
    throw new EnvValidationError(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  return result.data;
}
