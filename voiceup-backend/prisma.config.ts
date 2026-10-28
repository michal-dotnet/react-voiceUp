import { defineConfig } from 'prisma/config';

// Prisma 7 does not read .env by itself. Load it (if present) so CLI commands such as
// `prisma migrate deploy` see DATABASE_URL. Variables already set in the shell win.
try {
  process.loadEnvFile('.env');
} catch {
  // No .env file: rely on the real environment (CI, production).
}

// Prisma CLI configuration (migrations, seed). The app itself reads DATABASE_URL from env.ts.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx --env-file-if-exists=.env prisma/seed.ts',
  },
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
