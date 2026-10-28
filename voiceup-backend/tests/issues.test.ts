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
let other: TestUser;
let categoryId: string;

beforeEach(async () => {
  await resetDb();
  admin = await createUser('ADMIN');
  author = await createUser();
  other = await createUser();
  categoryId = (await createCategory()).id;
});

const validIssue = () => ({
  title: 'Pothole on Ben Yehuda street',
  description: 'A deep pothole in the right lane, next to number 12.',
  categoryId,
  area: 'Center',
  location: 'Near the pharmacy',
});

describe('creating issues', () => {
  it('starts every issue as PENDING_REVIEW / OPEN and makes the author a follower', async () => {
    const res = await request(app).post('/api/issues').set(author.auth).send(validIssue());

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      moderationStatus: 'PENDING_REVIEW',
      resolutionStatus: 'OPEN',
      author: { id: author.id, name: author.name },
      followerCount: 1,
      confirmationCount: 0,
      viewer: { isAuthor: true, isFollowing: true, hasConfirmed: false },
    });
    expect(res.body.data.author.email).toBeUndefined();
  });

  it('requires authentication', async () => {
    expect((await request(app).post('/api/issues').send(validIssue())).status).toBe(401);
  });

  it('rejects attempts to set server-controlled fields', async () => {
    const res = await request(app)
      .post('/api/issues')
      .set(author.auth)
      .send({ ...validIssue(), moderationStatus: 'APPROVED', authorId: other.id });
    expect(res.status).toBe(400);
  });

  it('rejects unknown or inactive categories', async () => {
    await testPrisma().category.update({ where: { id: categoryId }, data: { isActive: false } });
    const res = await request(app).post('/api/issues').set(author.auth).send(validIssue());
    expect(res.status).toBe(400);
  });

  it('accepts Hebrew content', async () => {
    const res = await request(app)
      .post('/api/issues')
      .set(author.auth)
      .send({
        ...validIssue(),
        title: 'בור גדול בכביש',
        description: 'יש בור עמוק בנתיב הימני ליד הבית מספר 12',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe('בור גדול בכביש');
  });
});

describe('visibility', () => {
  it('shows a pending issue only to its author and to admins', async () => {
    const id = await createIssue(app, author, categoryId);

    expect((await request(app).get(`/api/issues/${id}`)).status).toBe(404);
    expect((await request(app).get(`/api/issues/${id}`).set(other.auth)).status).toBe(404);
    expect((await request(app).get(`/api/issues/${id}`).set(author.auth)).status).toBe(200);
    expect((await request(app).get(`/api/issues/${id}`).set(admin.auth)).status).toBe(200);
  });

  it('lists only published issues publicly, and all own issues under /mine', async () => {
    await createIssue(app, author, categoryId);
    await createIssue(app, author, categoryId, admin, { title: 'Published issue title' });

    const list = await request(app).get('/api/issues');
    expect(list.body.meta.total).toBe(1);
    expect(list.body.data[0].title).toBe('Published issue title');

    const mine = await request(app).get('/api/issues/mine').set(author.auth);
    expect(mine.body.meta.total).toBe(2);
  });

  it('labels statuses and confirmations with their provenance', async () => {
    const id = await createIssue(app, author, categoryId, admin);
    const res = await request(app).get(`/api/issues/${id}`);
    expect(res.body.data.provenance.resolutionStatus).toMatch(/Recorded by VoiceUp admins/);
    expect(res.body.data.provenance.confirmations).toMatch(/Not independently verified/);
    expect(res.body.data.confirmationLabel).toBe('Reported by 0 users');
  });
});

describe('moderation', () => {
  it('approves with redaction and keeps the original text in the admin-only audit log', async () => {
    const id = await createIssue(app, author, categoryId, undefined, {
      description: 'Call me at 050-1234567, the light is broken near my house.',
    });
    const res = await request(app)
      .post(`/api/admin/issues/${id}/approve`)
      .set(admin.auth)
      .send({ description: 'The light is broken near a residential building.' });

    expect(res.status).toBe(200);
    expect(res.body.data.moderationStatus).toBe('APPROVED');
    expect(res.body.data.publishedAt).not.toBeNull();
    expect((await request(app).get(`/api/issues/${id}`)).body.data.description).not.toContain(
      '050',
    );

    const audit = await testPrisma().auditLog.findFirstOrThrow({
      where: { action: 'ISSUE_APPROVED' },
    });
    expect(audit.metadata).toMatchObject({
      redactedFields: ['description'],
      original: { description: expect.stringContaining('050-1234567') as unknown },
    });

    const notification = await testPrisma().notification.findFirst({
      where: { userId: author.id },
    });
    expect(notification?.type).toBe('ISSUE_APPROVED');
  });

  it('rejects with a reason that only the author and admins can see', async () => {
    const id = await createIssue(app, author, categoryId);
    const res = await request(app)
      .post(`/api/admin/issues/${id}/reject`)
      .set(admin.auth)
      .send({ reason: 'This is a private dispute, not a public issue.' });
    expect(res.status).toBe(200);

    const asAuthor = await request(app).get(`/api/issues/${id}`).set(author.auth);
    expect(asAuthor.body.data).toMatchObject({
      moderationStatus: 'REJECTED',
      rejectionReason: 'This is a private dispute, not a public issue.',
    });
    expect((await request(app).get(`/api/issues/${id}`)).status).toBe(404);
  });

  it('can take down a published issue', async () => {
    const id = await createIssue(app, author, categoryId, admin);
    await request(app)
      .post(`/api/admin/issues/${id}/reject`)
      .set(admin.auth)
      .send({ reason: 'Contains personal accusations.' });
    expect((await request(app).get(`/api/issues/${id}`)).status).toBe(404);
  });

  it('refuses to approve twice', async () => {
    const id = await createIssue(app, author, categoryId, admin);
    const res = await request(app).post(`/api/admin/issues/${id}/approve`).set(admin.auth).send({});
    expect(res.status).toBe(409);
  });

  it('lists the pending queue for admins only', async () => {
    await createIssue(app, author, categoryId);
    expect((await request(app).get('/api/admin/issues').set(author.auth)).status).toBe(403);
    const res = await request(app).get('/api/admin/issues').set(admin.auth);
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0].moderationStatus).toBe('PENDING_REVIEW');
  });

  it('lets admins redact a published issue later', async () => {
    const id = await createIssue(app, author, categoryId, admin);
    const res = await request(app)
      .patch(`/api/admin/issues/${id}`)
      .set(admin.auth)
      .send({ location: 'Near a residential building' });
    expect(res.status).toBe(200);
    expect(res.body.data.location).toBe('Near a residential building');
    expect(await testPrisma().auditLog.count({ where: { action: 'ISSUE_REDACTED' } })).toBe(1);
  });
});

describe('editing and deleting own issues', () => {
  it('allows the author to edit while pending, and not after approval', async () => {
    const id = await createIssue(app, author, categoryId);
    const edit = await request(app)
      .patch(`/api/issues/${id}`)
      .set(author.auth)
      .send({ title: 'Updated title for my issue' });
    expect(edit.status).toBe(200);
    expect(edit.body.data.title).toBe('Updated title for my issue');

    await request(app).post(`/api/admin/issues/${id}/approve`).set(admin.auth).send({});
    const late = await request(app)
      .patch(`/api/issues/${id}`)
      .set(author.auth)
      .send({ title: 'Too late now' });
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('INVALID_STATE');
  });

  it('never lets other users edit or delete', async () => {
    const id = await createIssue(app, author, categoryId, admin);
    expect(
      (
        await request(app)
          .patch(`/api/issues/${id}`)
          .set(other.auth)
          .send({ title: 'Hijacked title' })
      ).status,
    ).toBe(403);
    expect((await request(app).delete(`/api/issues/${id}`).set(other.auth)).status).toBe(403);
  });

  it('lets the author delete a pending issue', async () => {
    const id = await createIssue(app, author, categoryId);
    expect((await request(app).delete(`/api/issues/${id}`).set(author.auth)).status).toBe(204);
    expect(await testPrisma().publicIssue.count()).toBe(0);
  });
});

describe('search, filters and pagination', () => {
  beforeEach(async () => {
    const parks = (await createCategory('Parks', 'parks')).id;
    await createIssue(app, author, categoryId, admin, {
      title: 'Broken streetlight downtown',
      area: 'Center',
    });
    await createIssue(app, author, categoryId, admin, {
      title: 'Pothole near school',
      area: 'North',
    });
    await createIssue(app, author, parks, admin, {
      title: 'Broken bench in the park',
      area: 'North',
    });
  });

  it('searches every term in title or description, case-insensitively', async () => {
    const res = await request(app).get('/api/issues?q=BROKEN');
    expect(res.body.meta.total).toBe(2);
    const both = await request(app).get('/api/issues?q=broken%20bench');
    expect(both.body.meta.total).toBe(1);
  });

  it('filters by category, area and status', async () => {
    expect((await request(app).get(`/api/issues?categoryId=${categoryId}`)).body.meta.total).toBe(
      2,
    );
    expect((await request(app).get('/api/issues?area=north')).body.meta.total).toBe(2);
    expect((await request(app).get('/api/issues?status=RESOLVED')).body.meta.total).toBe(0);
  });

  it('paginates with meta and caps the page size', async () => {
    const res = await request(app).get('/api/issues?page=2&pageSize=2&sort=oldest');
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta).toEqual({ page: 2, pageSize: 2, total: 3, totalPages: 2 });
    expect((await request(app).get('/api/issues?pageSize=500')).status).toBe(400);
  });
});

describe('categories and organizations', () => {
  it('lets admins manage categories and hides inactive ones publicly', async () => {
    const created = await request(app)
      .post('/api/admin/categories')
      .set(admin.auth)
      .send({ name: 'Noise', slug: 'noise' });
    expect(created.status).toBe(201);

    const dup = await request(app)
      .post('/api/admin/categories')
      .set(admin.auth)
      .send({ name: 'Noise', slug: 'noise-2' });
    expect(dup.status).toBe(409);

    await request(app)
      .patch(`/api/admin/categories/${created.body.data.id as string}`)
      .set(admin.auth)
      .send({ isActive: false });
    const list = await request(app).get('/api/categories');
    expect(list.body.data.map((c: { slug: string }) => c.slug)).not.toContain('noise');

    expect(
      (
        await request(app)
          .post('/api/admin/categories')
          .set(author.auth)
          .send({ name: 'X', slug: 'x' })
      ).status,
    ).toBe(403);
  });

  it('lets admins manage organizations', async () => {
    const res = await request(app)
      .post('/api/admin/organizations')
      .set(admin.auth)
      .send({ name: 'Water Corporation', type: 'Utility' });
    expect(res.status).toBe(201);
    const list = await request(app).get('/api/organizations');
    expect(list.body.data).toHaveLength(1);
  });
});
