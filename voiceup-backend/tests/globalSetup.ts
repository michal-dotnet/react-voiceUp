import { recreateSchema, TEST_DATABASE_URL } from './helpers/testDatabase.js';

/** Runs once before all test files: a fresh schema built from the real migrations. */
export default async function setup(): Promise<void> {
  await recreateSchema(TEST_DATABASE_URL);
}
