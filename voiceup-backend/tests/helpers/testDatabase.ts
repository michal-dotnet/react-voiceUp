import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

export const TEST_DATABASE_URL =
  process.env.DATABASE_URL_TEST ?? 'postgresql://voiceup:voiceup@localhost:5432/voiceup_test';

/** Refuses to touch any database whose name does not end in "_test". */
export function assertTestDatabase(url: string): void {
  const name = new URL(url).pathname.replace(/^\//, '');
  if (!name.endsWith('_test')) {
    throw new Error(`Refusing to reset "${name}": test database names must end with "_test".`);
  }
}

/** Drops everything and applies the Prisma migrations in order, exactly as deployed. */
export async function recreateSchema(url: string): Promise<void> {
  assertTestDatabase(url);
  const migrationsDir = path.resolve(import.meta.dirname, '../../prisma/migrations');
  const folders = (await readdir(migrationsDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
    for (const folder of folders) {
      const sql = await readFile(path.join(migrationsDir, folder, 'migration.sql'), 'utf8');
      await client.query(sql);
    }
  } finally {
    await client.end();
  }
}
