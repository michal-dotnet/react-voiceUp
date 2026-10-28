import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { documentedEndpoints } from '../src/docs/openapi.js';
import { median } from '../src/modules/admin/dashboard.service.js';
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
let categoryId: string;

beforeEach(async () => {
  await resetDb();
  admin = await createUser('ADMIN');
  author = await createUser();
  categoryId = (await createCategory()).id;
});

describe('notifications', () => {
  it('lists only your own notifications, newest first, with an unread count', async () => {
    const other = await createUser();
    const first = await createIssue(app, author, categoryId, admin, { title: 'First issue here' });
    await createIssue(app, author, categoryId, admin, { title: 'Second issue here' });
    await request(app).post(`/api/issues/${first}/followers`).set(other.auth);

    const res = await request(app).get('/api/notifications').set(author.auth);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].message).toContain('Second issue here');
    expect(res.body.meta.unreadCount).toBe(2);
    expect((await request(app).get('/api/notifications').set(other.auth)).body.data).toHaveLength(
      0,
    );
  });

  it('marks one or all as read, and never touches other users', async () => {
    const other = await createUser();
    await createIssue(app, author, categoryId, admin, { title: 'First issue here' });
    await createIssue(app, author, categoryId, admin, { title: 'Second issue here' });
    const list = await request(app).get('/api/notifications').set(author.auth);
    const id = list.body.data[0].id as string;

    expect((await request(app).patch(`/api/notifications/${id}/read`).set(other.auth)).status).toBe(
      404,
    );
    expect(
      (await request(app).patch(`/api/notifications/${id}/read`).set(author.auth)).status,
    ).toBe(204);
    const unread = await request(app).get('/api/notifications?unreadOnly=true').set(author.auth);
    expect(unread.body.data).toHaveLength(1);

    const all = await request(app).post('/api/notifications/read-all').set(author.auth);
    expect(all.body.data.updated).toBe(1);
  });

  it('requires authentication', async () => {
    expect((await request(app).get('/api/notifications')).status).toBe(401);
  });
});

describe('dashboard', () => {
  it('computes median correctly', () => {
    expect(median([])).toBeNull();
    expect(median([5])).toBe(5);
    expect(median([1, 3, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('reports totals by moderation and resolution state', async () => {
    const resolved = await createIssue(app, author, categoryId, admin, {
      title: 'Resolved issue here',
      area: 'North',
    });
    await createIssue(app, author, categoryId, admin, { title: 'Open issue here', area: 'North' });
    await createIssue(app, author, categoryId, undefined, { title: 'Pending issue here' });
    const publishedAt = new Date(Date.now() - 48 * 60 * 60 * 1000);
    await testPrisma().publicIssue.update({
      where: { id: resolved },
      data: { resolutionStatus: 'RESOLVED', publishedAt, resolvedAt: new Date() },
    });

    const res = await request(app).get('/api/admin/dashboard').set(admin.auth);
    expect(res.status).toBe(200);
    expect(res.body.data.totals).toEqual({
      published: 2,
      open: 1,
      resolved: 1,
      pendingModeration: 1,
      openReports: 0,
    });
    expect(res.body.data.byArea).toEqual([{ area: 'North', count: 2 }]);
    expect(res.body.data.byCategory[0]).toMatchObject({ categoryId, name: 'Roads', count: 2 });
    expect(res.body.data.reportedResolutionTime).toMatchObject({ sampleSize: 1, medianHours: 48 });
    expect(res.body.data.reportedResolutionTime.label).toMatch(/recorded by VoiceUp admins/);
    expect(res.body.data.recentActivity.length).toBeGreaterThan(0);
  });

  it('is admin-only', async () => {
    expect((await request(app).get('/api/admin/dashboard').set(author.auth)).status).toBe(403);
  });
});

describe('audit log', () => {
  it('records admin actions and can be filtered', async () => {
    const issueId = await createIssue(app, author, categoryId, admin);
    const res = await request(app).get(`/api/admin/audit-logs?entityId=${issueId}`).set(admin.auth);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      action: 'ISSUE_APPROVED',
      actor: { id: admin.id, name: admin.name },
    });
    expect((await request(app).get('/api/admin/audit-logs').set(author.auth)).status).toBe(403);
  });
});

describe('OpenAPI documentation', () => {
  it('serves a valid document that covers the endpoints', async () => {
    const res = await request(app).get('/api/docs/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.1.0');
    expect(res.body.info.description).toMatch(/not an emergency service/);

    const documented = Object.entries(
      res.body.paths as Record<string, Record<string, unknown>>,
    ).flatMap(([path, methods]) => Object.keys(methods).map((method) => `${method} ${path}`));
    expect(documented).toHaveLength(documentedEndpoints.length);
    expect(documented).toEqual(
      expect.arrayContaining([
        'post /api/admin/issues/merge',
        'post /api/issues/{id}/confirmations',
      ]),
    );
  });

  it('serves Swagger UI', async () => {
    const res = await request(app).get('/api/docs/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('swagger-ui');
  });

  /** Every documented operation must exist: calling it never returns the generic route 404. */
  it('documents only routes that exist', async () => {
    const sample = '00000000-0000-4000-8000-000000000000';
    for (const { method, path } of documentedEndpoints) {
      const url = path.replace(/\{\w+\}/g, sample);
      const res = await request(app)[method as 'get'](url).set(admin.auth);
      const genericNotFound = res.status === 404 && res.body?.error?.message === 'Route not found.';
      expect(genericNotFound, `${method.toUpperCase()} ${path}`).toBe(false);
    }
  });
});
