import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildApp,
  createCategory,
  createIssue,
  createUser,
  resetDb,
  testPrisma,
  type TestUser,
} from './helpers/setup.js';

const app = buildApp();

let admin: TestUser;
let author: TestUser;
let alice: TestUser;
let bob: TestUser;
let categoryId: string;
let issueId: string;

beforeEach(async () => {
  await resetDb();
  admin = await createUser('ADMIN');
  author = await createUser();
  alice = await createUser();
  bob = await createUser();
  categoryId = (await createCategory()).id;
  issueId = await createIssue(app, author, categoryId, admin);
});

describe('confirmations', () => {
  it('counts each user once and labels the count as user reports', async () => {
    const first = await request(app)
      .post(`/api/issues/${issueId}/confirmations`)
      .set(alice.auth)
      .send({ note: 'I pass there every day.' });
    expect(first.status).toBe(201);
    expect(first.body.data).toEqual({
      confirmed: true,
      confirmationCount: 1,
      confirmationLabel: 'Reported by 1 user',
    });

    const again = await request(app).post(`/api/issues/${issueId}/confirmations`).set(alice.auth);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_EXISTS');

    await request(app).post(`/api/issues/${issueId}/confirmations`).set(bob.auth);
    const issue = await request(app).get(`/api/issues/${issueId}`).set(bob.auth);
    expect(issue.body.data.confirmationCount).toBe(2);
    expect(issue.body.data.viewer.hasConfirmed).toBe(true);
  });

  it('survives concurrent duplicate confirmations (unique index)', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app).post(`/api/issues/${issueId}/confirmations`).set(alice.auth),
      ),
    );
    expect(results.filter((res) => res.status === 201)).toHaveLength(1);
    expect(results.every((res) => res.status === 201 || res.status === 409)).toBe(true);
    expect(await testPrisma().issueConfirmation.count()).toBe(1);
  });

  it('does not let authors confirm their own issue', async () => {
    const res = await request(app).post(`/api/issues/${issueId}/confirmations`).set(author.auth);
    expect(res.status).toBe(409);
  });

  it('can be withdrawn', async () => {
    await request(app).post(`/api/issues/${issueId}/confirmations`).set(alice.auth);
    const res = await request(app).delete(`/api/issues/${issueId}/confirmations`).set(alice.auth);
    expect(res.body.data.confirmationCount).toBe(0);
    expect(
      (await request(app).delete(`/api/issues/${issueId}/confirmations`).set(alice.auth)).status,
    ).toBe(404);
  });

  it('is not possible on unpublished issues', async () => {
    const pending = await createIssue(app, author, categoryId);
    const res = await request(app).post(`/api/issues/${pending}/confirmations`).set(alice.auth);
    expect(res.status).toBe(404);
  });
});

describe('follows', () => {
  it('follows and unfollows once', async () => {
    expect(
      (await request(app).post(`/api/issues/${issueId}/followers`).set(alice.auth)).status,
    ).toBe(201);
    expect(
      (await request(app).post(`/api/issues/${issueId}/followers`).set(alice.auth)).status,
    ).toBe(409);
    expect(
      (await request(app).delete(`/api/issues/${issueId}/followers`).set(alice.auth)).status,
    ).toBe(200);
    expect(
      (await request(app).delete(`/api/issues/${issueId}/followers`).set(alice.auth)).status,
    ).toBe(404);
  });
});

describe('comments', () => {
  it('lets users comment, edit their own comments and hide them', async () => {
    const created = await request(app)
      .post(`/api/issues/${issueId}/comments`)
      .set(alice.auth)
      .send({ body: 'Still broken today.' });
    expect(created.status).toBe(201);
    const commentId = created.body.data.id as string;

    const foreign = await request(app)
      .patch(`/api/issues/${issueId}/comments/${commentId}`)
      .set(bob.auth)
      .send({ body: 'Edited by someone else' });
    expect(foreign.status).toBe(403);

    const edited = await request(app)
      .patch(`/api/issues/${issueId}/comments/${commentId}`)
      .set(alice.auth)
      .send({ body: 'Still broken today (edited).' });
    expect(edited.body.data.body).toBe('Still broken today (edited).');

    expect(
      (await request(app).delete(`/api/issues/${issueId}/comments/${commentId}`).set(alice.auth))
        .status,
    ).toBe(204);
    const list = await request(app).get(`/api/issues/${issueId}/comments`);
    expect(list.body.meta.total).toBe(0);
    // Hidden, never deleted: the record is preserved.
    expect(await testPrisma().issueComment.count()).toBe(1);
  });

  it('lets admins see hidden comments and restore them', async () => {
    const created = await request(app)
      .post(`/api/issues/${issueId}/comments`)
      .set(alice.auth)
      .send({ body: 'Offensive comment' });
    const commentId = created.body.data.id as string;
    await request(app)
      .patch(`/api/admin/comments/${commentId}`)
      .set(admin.auth)
      .send({ moderationStatus: 'HIDDEN' });

    const asAdmin = await request(app).get(`/api/issues/${issueId}/comments`).set(admin.auth);
    expect(asAdmin.body.data[0].moderationStatus).toBe('HIDDEN');
    expect((await request(app).get(`/api/issues/${issueId}/comments`)).body.meta.total).toBe(0);

    await request(app)
      .patch(`/api/admin/comments/${commentId}`)
      .set(admin.auth)
      .send({ moderationStatus: 'VISIBLE' });
    expect((await request(app).get(`/api/issues/${issueId}/comments`)).body.meta.total).toBe(1);
    expect(
      await testPrisma().auditLog.count({ where: { action: 'CONTENT_VISIBILITY_CHANGED' } }),
    ).toBe(2);
  });

  it('requires authentication to comment but not to read', async () => {
    expect(
      (await request(app).post(`/api/issues/${issueId}/comments`).send({ body: 'x' })).status,
    ).toBe(401);
    expect((await request(app).get(`/api/issues/${issueId}/comments`)).status).toBe(200);
  });
});

describe('proposed solutions', () => {
  it('labels personal experience and suggestions as unverified', async () => {
    await request(app)
      .post(`/api/issues/${issueId}/solutions`)
      .set(alice.auth)
      .send({ kind: 'PERSONAL_EXPERIENCE', body: 'Calling the hotline fixed it for my street.' });
    await request(app)
      .post(`/api/issues/${issueId}/solutions`)
      .set(bob.auth)
      .send({ kind: 'SUGGESTION', body: 'Maybe install a motion sensor light.' });

    const res = await request(app).get(`/api/issues/${issueId}/solutions`);
    expect(res.body.data.map((s: { label: string }) => s.label)).toEqual([
      'Personal experience shared by a user. Not verified.',
      'Unverified suggestion by a user.',
    ]);
  });

  it('rejects unknown kinds', async () => {
    const res = await request(app)
      .post(`/api/issues/${issueId}/solutions`)
      .set(alice.auth)
      .send({ kind: 'OFFICIAL_ANSWER', body: 'This is official, trust me.' });
    expect(res.status).toBe(400);
  });
});

describe('content reports', () => {
  it('accepts one report per user per item and lets admins hide the content', async () => {
    const comment = await request(app)
      .post(`/api/issues/${issueId}/comments`)
      .set(alice.auth)
      .send({ body: 'Rude content here' });
    const commentId = comment.body.data.id as string;
    const url = `/api/issues/${issueId}/comments/${commentId}/reports`;

    expect((await request(app).post(url).set(bob.auth).send({ reason: 'Insulting' })).status).toBe(
      201,
    );
    expect((await request(app).post(url).set(bob.auth).send({ reason: 'Again' })).status).toBe(409);
    expect((await request(app).post(url).set(author.auth).send({ reason: 'Rude' })).status).toBe(
      201,
    );

    const queue = await request(app).get('/api/admin/reports').set(admin.auth);
    expect(queue.body.meta.total).toBe(2);
    expect(queue.body.data[0].target.body).toBe('Rude content here');

    const handled = await request(app)
      .patch(`/api/admin/reports/${queue.body.data[0].id as string}`)
      .set(admin.auth)
      .send({ status: 'ACTIONED', hideContent: true });
    expect(handled.status).toBe(200);
    expect(handled.body.data.contentHidden).toBe(true);

    // Both open reports about the same comment are closed together.
    expect((await request(app).get('/api/admin/reports').set(admin.auth)).body.meta.total).toBe(0);
    expect((await request(app).get(`/api/issues/${issueId}/comments`)).body.meta.total).toBe(0);
  });

  it('reports issues and refuses hideContent for them', async () => {
    const report = await request(app)
      .post(`/api/issues/${issueId}/reports`)
      .set(alice.auth)
      .send({ reason: 'Contains a private phone number' });
    expect(report.status).toBe(201);
    const res = await request(app)
      .patch(`/api/admin/reports/${report.body.data.id as string}`)
      .set(admin.auth)
      .send({ status: 'ACTIONED', hideContent: true });
    expect(res.status).toBe(400);
  });

  it('returns 404 for content that belongs to another issue', async () => {
    const otherIssue = await createIssue(app, author, categoryId, admin, {
      title: 'Another issue entirely',
    });
    const comment = await request(app)
      .post(`/api/issues/${otherIssue}/comments`)
      .set(alice.auth)
      .send({ body: 'Comment on the other issue' });
    const res = await request(app)
      .post(`/api/issues/${issueId}/comments/${comment.body.data.id as string}/reports`)
      .set(bob.auth)
      .send({ reason: 'Wrong' });
    expect(res.status).toBe(404);
  });
});
