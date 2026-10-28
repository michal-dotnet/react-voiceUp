import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { issueGuestToken, verifyGuestToken } from '../src/lib/guestToken.js';
import {
  buildApp,
  createCategory,
  createIssue,
  createUser,
  resetDb,
  TEST_JWT_SECRET,
  testPrisma,
  type TestUser,
} from './helpers/setup.js';

const app = buildApp();

let admin: TestUser;
let author: TestUser;
let categoryId: string;
let issueId: string;

beforeEach(async () => {
  await resetDb();
  admin = await createUser('ADMIN');
  author = await createUser();
  categoryId = (await createCategory()).id;
  issueId = await createIssue(app, author, categoryId, admin);
});

const guestConfirm = (id: string, token?: string, body: object = {}, target = app) => {
  const req = request(target).post(`/api/issues/${id}/confirmations`);
  if (token) void req.set('X-Guest-Token', token);
  return req.send(body);
};

describe('guest token (unit)', () => {
  it('verifies its own tokens and rejects forged or malformed ones', () => {
    const { token, guestId } = issueGuestToken(TEST_JWT_SECRET);
    expect(verifyGuestToken(token, TEST_JWT_SECRET)).toBe(guestId);
    expect(verifyGuestToken(token, 'another-secret-that-is-at-least-32-chars')).toBeNull();
    const [prefix, id] = token.split('.');
    expect(verifyGuestToken(`${prefix}.${id}.${'A'.repeat(43)}`, TEST_JWT_SECRET)).toBeNull();
    expect(verifyGuestToken('garbage', TEST_JWT_SECRET)).toBeNull();
  });
});

describe('guest confirmations', () => {
  it('lets a guest confirm without a JWT and counts guests separately as unverified', async () => {
    const res = await guestConfirm(issueId);

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      confirmed: true,
      confirmationCount: 0,
      guestConfirmationCount: 1,
      guestConfirmationLabel: '1 guest confirmation (unverified)',
    });
    expect(res.body.data.guestToken).toMatch(/^g1\./);

    const issue = await request(app).get(`/api/issues/${issueId}`);
    expect(issue.body.data).toMatchObject({
      confirmationCount: 0,
      guestConfirmationCount: 1,
      provenance: { guestConfirmations: expect.stringContaining('Unverified') as unknown },
    });
  });

  it('stores only hashes, never the token or the IP', async () => {
    const res = await guestConfirm(issueId);
    const row = await testPrisma().guestConfirmation.findFirstOrThrow();
    const token = res.body.data.guestToken as string;

    expect(row.guestKeyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain(token.split('.')[1]);
    expect(JSON.stringify(row)).not.toContain('127.0.0.1');
  });

  it('rejects a second confirmation with the same guest token, including concurrent ones', async () => {
    const first = await guestConfirm(issueId);
    const token = first.body.data.guestToken as string;

    const again = await guestConfirm(issueId, token);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_EXISTS');

    const other = await createIssue(app, author, categoryId, admin, { title: 'A different issue' });
    const racing = await Promise.all([1, 2, 3].map(() => guestConfirm(other, token)));
    expect(racing.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await testPrisma().guestConfirmation.count({ where: { issueId: other } })).toBe(1);
  });

  it('does not return a new token when the guest already has one', async () => {
    const other = await createIssue(app, author, categoryId, admin, { title: 'A different issue' });
    const token = (await guestConfirm(issueId)).body.data.guestToken as string;
    const res = await guestConfirm(other, token);
    expect(res.status).toBe(201);
    expect(res.body.data.guestToken).toBeUndefined();
  });

  it('caps guest confirmations per IP on one issue', async () => {
    for (let i = 0; i < 3; i += 1) expect((await guestConfirm(issueId)).status).toBe(201);
    const capped = await guestConfirm(issueId);
    expect(capped.status).toBe(409);
    expect(capped.body.error.code).toBe('LIMIT_REACHED');
    expect(await testPrisma().guestConfirmation.count()).toBe(3);
  });

  it('rate limits guest requests per IP, without affecting registered users', async () => {
    const limited = buildApp({ GUEST_CONFIRM_RATE_LIMIT_MAX: '2' });
    expect((await guestConfirm(issueId, undefined, {}, limited)).status).toBe(201);
    expect((await guestConfirm(issueId, undefined, {}, limited)).status).toBe(201);
    const blocked = await guestConfirm(issueId, undefined, {}, limited);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');

    const user = await createUser();
    const asUser = await request(limited)
      .post(`/api/issues/${issueId}/confirmations`)
      .set(user.auth);
    expect(asUser.status).toBe(201);
  });

  it('rejects any free text or extra fields from guests', async () => {
    for (const body of [{ note: 'free text' }, { comment: 'x' }, { body: 'hello' }]) {
      const res = await guestConfirm(issueId, undefined, body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect(await testPrisma().guestConfirmation.count()).toBe(0);
  });

  it('rejects forged guest tokens', async () => {
    const res = await guestConfirm(issueId, 'g1.forged.token');
    expect(res.status).toBe(400);
    expect(await testPrisma().guestConfirmation.count()).toBe(0);
  });

  it('only works on published, unmerged issues', async () => {
    const pending = await createIssue(app, author, categoryId, undefined, { title: 'Pending one' });
    expect((await guestConfirm(pending)).status).toBe(404);

    const target = await createIssue(app, author, categoryId, admin, { title: 'Canonical one' });
    await request(app)
      .post('/api/admin/issues/merge')
      .set(admin.auth)
      .send({ sourceIssueId: issueId, canonicalIssueId: target });
    const merged = await guestConfirm(issueId);
    expect(merged.status).toBe(409);
    expect(merged.body.error.code).toBe('ISSUE_MERGED');
  });

  it('lets a guest withdraw with their token, and only their own confirmation', async () => {
    const token = (await guestConfirm(issueId)).body.data.guestToken as string;
    const otherToken = (await guestConfirm(issueId)).body.data.guestToken as string;

    expect((await request(app).delete(`/api/issues/${issueId}/confirmations`)).status).toBe(401);

    const res = await request(app)
      .delete(`/api/issues/${issueId}/confirmations`)
      .set('X-Guest-Token', token);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ confirmed: false, guestConfirmationCount: 1 });

    const again = await request(app)
      .delete(`/api/issues/${issueId}/confirmations`)
      .set('X-Guest-Token', token);
    expect(again.status).toBe(404);

    expect(
      (
        await request(app)
          .delete(`/api/issues/${issueId}/confirmations`)
          .set('X-Guest-Token', otherToken)
      ).status,
    ).toBe(200);
  });
});

describe('guests keep their existing restrictions', () => {
  it('cannot create issues, comment, propose solutions or report', async () => {
    const results = await Promise.all([
      request(app).post('/api/issues').send({
        title: 'Guest issue',
        description: 'Guest description here',
        categoryId,
        area: 'X',
      }),
      request(app).post(`/api/issues/${issueId}/comments`).send({ body: 'Guest comment' }),
      request(app)
        .post(`/api/issues/${issueId}/solutions`)
        .send({ kind: 'SUGGESTION', body: 'Guest suggestion' }),
      request(app).post(`/api/issues/${issueId}/reports`).send({ reason: 'Guest report' }),
      request(app).post(`/api/issues/${issueId}/followers`),
    ]);
    expect(results.map((res) => res.status)).toEqual([401, 401, 401, 401, 401]);
  });

  it('cannot use a guest token to act as a user', async () => {
    const token = (await guestConfirm(issueId)).body.data.guestToken as string;
    const res = await request(app)
      .post(`/api/issues/${issueId}/comments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'Sneaky comment' });
    expect(res.status).toBe(401);
  });
});

describe('registered users are unchanged', () => {
  it('keeps the same response, note support and own-issue rule', async () => {
    const user = await createUser();
    await guestConfirm(issueId);
    const res = await request(app)
      .post(`/api/issues/${issueId}/confirmations`)
      .set(user.auth)
      .send({ note: 'I pass there daily.' });

    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({
      confirmed: true,
      confirmationCount: 1,
      confirmationLabel: 'Reported by 1 user',
    });
    const own = await request(app).post(`/api/issues/${issueId}/confirmations`).set(author.auth);
    expect(own.status).toBe(409);
  });

  it('still rejects an invalid JWT instead of treating the caller as a guest', async () => {
    const res = await request(app)
      .post(`/api/issues/${issueId}/confirmations`)
      .set('Authorization', 'Bearer not-a-valid-token')
      .send({});
    expect(res.status).toBe(401);
    expect(await testPrisma().guestConfirmation.count()).toBe(0);
  });
});
