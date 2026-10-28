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
const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');

let admin: TestUser;
let authorA: TestUser;
let authorB: TestUser;
let both: TestUser; // confirms both issues
let onlyB: TestUser;
let categoryId: string;
let canonicalId: string;
let sourceId: string;

const merge = (sourceIssueId: string, canonicalIssueId: string, as = admin) =>
  request(app)
    .post('/api/admin/issues/merge')
    .set(as.auth)
    .send({ sourceIssueId, canonicalIssueId, reason: 'Same streetlight.' });

async function snapshot() {
  const prisma = testPrisma();
  return {
    comments: await prisma.issueComment.findMany({ orderBy: { id: 'asc' } }),
    solutions: await prisma.proposedSolution.findMany({ orderBy: { id: 'asc' } }),
    confirmations: await prisma.issueConfirmation.findMany({ orderBy: { id: 'asc' } }),
    follows: await prisma.issueFollow.findMany({ orderBy: { id: 'asc' } }),
    attachments: await prisma.mediaAttachment.findMany({ orderBy: { id: 'asc' } }),
    history: await prisma.issueStatusHistory.findMany({ orderBy: { id: 'asc' } }),
  };
}

beforeEach(async () => {
  await resetDb();
  admin = await createUser('ADMIN');
  authorA = await createUser();
  authorB = await createUser();
  both = await createUser();
  onlyB = await createUser();
  categoryId = (await createCategory()).id;
  canonicalId = await createIssue(app, authorA, categoryId, admin, {
    title: 'Streetlight out on Herzl',
  });
  sourceId = await createIssue(app, authorB, categoryId, admin, {
    title: 'Dark street at Herzl corner',
  });

  for (const user of [both]) {
    await request(app).post(`/api/issues/${canonicalId}/confirmations`).set(user.auth);
  }
  for (const user of [both, onlyB]) {
    await request(app).post(`/api/issues/${sourceId}/confirmations`).set(user.auth);
  }
  await request(app)
    .post(`/api/issues/${sourceId}/comments`)
    .set(onlyB.auth)
    .send({ body: 'Comment on B' });
  await request(app)
    .post(`/api/issues/${sourceId}/solutions`)
    .set(onlyB.auth)
    .send({ kind: 'SUGGESTION', body: 'Replace the bulb with LED.' });
  await request(app)
    .post(`/api/issues/${canonicalId}/comments`)
    .set(both.auth)
    .send({ body: 'Comment on A' });
  const uploaded = await request(app)
    .post(`/api/issues/${sourceId}/attachments`)
    .set(admin.auth)
    .attach('file', PNG, 'b.png');
  expect(uploaded.status).toBe(201);
  await request(app)
    .post(`/api/admin/issues/${sourceId}/updates`)
    .set(admin.auth)
    .send({ note: 'Admin checked issue B.' });
});

describe('merging duplicate issues', () => {
  it('loses no data: every row stays, with its original issue and author', async () => {
    const before = await snapshot();
    const res = await merge(sourceId, canonicalId);
    expect(res.status).toBe(200);
    const after = await snapshot();

    expect(after).toEqual(before);
    const source = await testPrisma().publicIssue.findUniqueOrThrow({ where: { id: sourceId } });
    expect(source.mergedIntoId).toBe(canonicalId);
    expect(await testPrisma().issueMergeHistory.count()).toBe(1);
    expect(await testPrisma().auditLog.count({ where: { action: 'ISSUE_MERGED' } })).toBe(1);
  });

  it('aggregates the group on the canonical issue, counting each user once', async () => {
    const res = await merge(sourceId, canonicalId);
    expect(res.body.data).toMatchObject({
      id: canonicalId,
      mergedIssueIds: [sourceId],
      confirmationCount: 2, // "both" is counted once, plus "onlyB"
      followerCount: 2, // the two authors
    });

    const comments = await request(app).get(`/api/issues/${canonicalId}/comments`);
    expect(
      comments.body.data.map((c: { body: string; fromMergedIssue: boolean }) => [
        c.body,
        c.fromMergedIssue,
      ]),
    ).toEqual(
      expect.arrayContaining([
        ['Comment on A', false],
        ['Comment on B', true],
      ]),
    );
    expect((await request(app).get(`/api/issues/${canonicalId}/solutions`)).body.meta.total).toBe(
      1,
    );
    expect(
      (await request(app).get(`/api/issues/${canonicalId}/attachments`)).body.data,
    ).toHaveLength(1);

    const timeline = await request(app).get(`/api/issues/${canonicalId}/history`);
    expect(timeline.body.data.entries.map((e: { type: string }) => e.type)).toEqual([
      'ADMIN_UPDATE',
      'MERGE',
    ]);
  });

  it('hides the source from lists and points to the canonical issue', async () => {
    await merge(sourceId, canonicalId);
    const list = await request(app).get('/api/issues');
    expect(list.body.data.map((issue: { id: string }) => issue.id)).toEqual([canonicalId]);

    const source = await request(app).get(`/api/issues/${sourceId}`);
    expect(source.status).toBe(200);
    expect(source.body.data.mergedIntoId).toBe(canonicalId);

    const comments = await request(app).get(`/api/issues/${sourceId}/comments`);
    expect(comments.body.meta.total).toBe(2); // reads resolve to the canonical group
  });

  it('makes the source read-only and keeps confirmation rules across the group', async () => {
    await merge(sourceId, canonicalId);
    const write = await request(app)
      .post(`/api/issues/${sourceId}/comments`)
      .set(onlyB.auth)
      .send({ body: 'Late comment' });
    expect(write.status).toBe(409);
    expect(write.body.error).toMatchObject({
      code: 'ISSUE_MERGED',
      details: { canonicalIssueId: canonicalId },
    });

    // onlyB already confirmed the source, so confirming the canonical issue is a duplicate.
    expect(
      (await request(app).post(`/api/issues/${canonicalId}/confirmations`).set(onlyB.auth)).status,
    ).toBe(409);
    // authorB reported part of the group, so cannot confirm it.
    expect(
      (await request(app).post(`/api/issues/${canonicalId}/confirmations`).set(authorB.auth))
        .status,
    ).toBe(409);
  });

  it('notifies followers of both issues once, but not the admin', async () => {
    await merge(sourceId, canonicalId);
    const notifications = await testPrisma().notification.findMany({
      where: { type: 'ISSUE_MERGED' },
    });
    expect(notifications.map((n) => n.userId).sort()).toEqual([authorA.id, authorB.id].sort());
  });

  it('re-points earlier merges so they are never chained', async () => {
    const third = await createIssue(app, authorA, categoryId, admin, {
      title: 'Third duplicate report',
    });
    await merge(third, sourceId);
    await merge(sourceId, canonicalId);

    const thirdIssue = await testPrisma().publicIssue.findUniqueOrThrow({ where: { id: third } });
    expect(thirdIssue.mergedIntoId).toBe(canonicalId);
    const res = await request(app).get(`/api/issues/${canonicalId}`);
    expect(res.body.data.mergedIssueIds.sort()).toEqual([sourceId, third].sort());
  });

  it('validates the request', async () => {
    const pending = await createIssue(app, authorA, categoryId, undefined, {
      title: 'Pending duplicate',
    });
    expect((await merge(sourceId, sourceId)).status).toBe(400);
    expect((await merge(pending, canonicalId)).status).toBe(409);
    expect((await merge(sourceId, canonicalId, authorA)).status).toBe(403);

    await merge(sourceId, canonicalId);
    const again = await merge(sourceId, canonicalId);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ISSUE_MERGED');
    // Merging into an issue that is itself merged is refused too.
    const fourth = await createIssue(app, authorA, categoryId, admin, {
      title: 'Fourth report here',
    });
    expect((await merge(fourth, sourceId)).status).toBe(409);
  });

  it('stays consistent when two opposite merges race', async () => {
    const results = await Promise.all([merge(sourceId, canonicalId), merge(canonicalId, sourceId)]);
    expect(results.map((res) => res.status).sort()).toEqual([200, 409]);
    const issues = await testPrisma().publicIssue.findMany({
      where: { id: { in: [sourceId, canonicalId] } },
    });
    expect(issues.filter((issue) => issue.mergedIntoId !== null)).toHaveLength(1);
  });

  it('is refused for issues that are not published', async () => {
    await request(app)
      .post(`/api/admin/issues/${sourceId}/reject`)
      .set(admin.auth)
      .send({ reason: 'Taken down for testing.' });
    expect((await merge(sourceId, canonicalId)).status).toBe(409);
  });

  it('keeps guest confirmations, counts each guest once and allows withdrawal on the group', async () => {
    const guestConfirm = (id: string, token?: string) => {
      const req = request(app).post(`/api/issues/${id}/confirmations`);
      if (token) void req.set('X-Guest-Token', token);
      return req.send({});
    };
    const token = (await guestConfirm(canonicalId)).body.data.guestToken as string;
    expect((await guestConfirm(sourceId, token)).status).toBe(201); // same guest, other issue
    await guestConfirm(sourceId); // a second guest
    const before = await testPrisma().guestConfirmation.findMany({ orderBy: { id: 'asc' } });

    const res = await merge(sourceId, canonicalId);
    expect(res.body.data).toMatchObject({ guestConfirmationCount: 2, confirmationCount: 2 });
    expect(await testPrisma().guestConfirmation.findMany({ orderBy: { id: 'asc' } })).toEqual(
      before,
    );

    // The guest already confirmed inside the group, so confirming the canonical issue again fails.
    expect((await guestConfirm(canonicalId, token)).status).toBe(409);

    // Withdrawing on the canonical issue removes that guest's rows across the group.
    const withdrawn = await request(app)
      .delete(`/api/issues/${canonicalId}/confirmations`)
      .set('X-Guest-Token', token);
    expect(withdrawn.body.data).toMatchObject({ confirmed: false, guestConfirmationCount: 1 });
    expect(await testPrisma().guestConfirmation.count()).toBe(1);
  });
});
