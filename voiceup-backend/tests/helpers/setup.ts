import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { loadEnv, type Env } from '../../src/config/env.js';
import type { UserRole } from '../../src/generated/prisma/enums.js';
import { signAccessToken } from '../../src/lib/jwt.js';
import { createLogger } from '../../src/lib/logger.js';
import { hashPassword } from '../../src/lib/password.js';
import { createPrisma, type Db } from '../../src/lib/prisma.js';
import { assertTestDatabase, TEST_DATABASE_URL } from './testDatabase.js';

export const TEST_JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long';
export const TEST_PASSWORD = 'Password123!';

export function testEnv(overrides: Record<string, string> = {}): Env {
  return loadEnv({
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DATABASE_URL,
    JWT_SECRET: TEST_JWT_SECRET,
    RATE_LIMIT_MAX: '100000',
    AUTH_RATE_LIMIT_MAX: '100000',
    WRITE_RATE_LIMIT_MAX: '100000',
    GUEST_CONFIRM_RATE_LIMIT_MAX: '100000',
    ...overrides,
  });
}

let prismaSingleton: Db | undefined;

export function testPrisma(): Db {
  assertTestDatabase(TEST_DATABASE_URL);
  prismaSingleton ??= createPrisma(TEST_DATABASE_URL);
  return prismaSingleton;
}

export function buildApp(overrides: Record<string, string> = {}): Express {
  return createApp({
    env: testEnv(overrides),
    logger: createLogger('silent'),
    prisma: testPrisma(),
  });
}

const TABLES = [
  'AuditLog',
  'Notification',
  'ContentReport',
  'IssueMergeHistory',
  'IssueStatusHistory',
  'ExternalResponse',
  'IssueAssignment',
  'MediaAttachment',
  'ProposedSolution',
  'IssueComment',
  'IssueFollow',
  'GuestConfirmation',
  'IssueConfirmation',
  'PublicIssue',
  'Organization',
  'Category',
  'User',
];

export async function resetDb(): Promise<void> {
  const list = TABLES.map((table) => `"${table}"`).join(', ');
  await testPrisma().$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

let passwordHash: Promise<string> | undefined;

export interface TestUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  token: string;
  auth: { Authorization: string };
}

let counter = 0;

export async function createUser(role: UserRole = 'USER', name?: string): Promise<TestUser> {
  counter += 1;
  passwordHash ??= hashPassword(TEST_PASSWORD);
  const user = await testPrisma().user.create({
    data: {
      name: name ?? `${role === 'ADMIN' ? 'Admin' : 'User'} ${counter}`,
      email: `user${counter}-${Date.now()}@example.com`,
      passwordHash: await passwordHash,
      role,
    },
  });
  const token = signAccessToken(user.id, { secret: TEST_JWT_SECRET, expiresInSeconds: 3600 });
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    token,
    auth: { Authorization: `Bearer ${token}` },
  };
}

export async function createCategory(name = 'Roads', slug = 'roads') {
  return testPrisma().category.create({ data: { name, slug } });
}

export async function createOrganization(name = 'Municipal Works Department') {
  return testPrisma().organization.create({ data: { name, type: 'Municipality' } });
}

export interface IssueOptions {
  title?: string;
  description?: string;
  area?: string;
  approved?: boolean;
}

/** Creates an issue through the API (as the author), optionally approving it as an admin. */
export async function createIssue(
  app: Express,
  author: TestUser,
  categoryId: string,
  admin?: TestUser,
  options: IssueOptions = {},
): Promise<string> {
  const res = await request(app)
    .post('/api/issues')
    .set(author.auth)
    .send({
      title: options.title ?? 'Broken streetlight on Herzl street',
      description:
        options.description ?? 'The streetlight near the bus stop has been off for a week.',
      categoryId,
      area: options.area ?? 'Center',
    });
  if (res.status !== 201)
    throw new Error(`createIssue failed: ${res.status} ${JSON.stringify(res.body)}`);
  const id = res.body.data.id as string;
  if (admin && options.approved !== false) {
    const approved = await request(app)
      .post(`/api/admin/issues/${id}/approve`)
      .set(admin.auth)
      .send({});
    if (approved.status !== 200) throw new Error(`approve failed: ${approved.status}`);
  }
  return id;
}
