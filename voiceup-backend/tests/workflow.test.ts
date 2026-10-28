import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildApp,
  createCategory,
  createIssue,
  createOrganization,
  createUser,
  resetDb,
  testPrisma,
  type TestUser,
} from './helpers/setup.js';

const app = buildApp();

let admin: TestUser;
let author: TestUser;
let follower: TestUser;
let issueId: string;
let organizationId: string;

const status = (toStatus: string, extra: Record<string, string> = {}) =>
  request(app)
    .post(`/api/admin/issues/${issueId}/status`)
    .set(admin.auth)
    .send({ toStatus, note: `Moving to ${toStatus}.`, ...extra });

async function sentAssignment(): Promise<string> {
  const created = await request(app)
    .post(`/api/admin/issues/${issueId}/assignments`)
    .set(admin.auth)
    .send({ organizationId });
  const assignmentId = created.body.data.id as string;
  const sent = await request(app)
    .patch(`/api/admin/assignments/${assignmentId}`)
    .set(admin.auth)
    .send({
      referralStatus: 'SENT',
      sentAt: new Date(Date.now() - 60_000).toISOString(),
      sentMethod: 'Email to the department',
      sentEvidence: 'Email sent to works@city.example, reference 4471',
    });
  if (sent.status !== 200) throw new Error(JSON.stringify(sent.body));
  return assignmentId;
}

beforeEach(async () => {
  await resetDb();
  admin = await createUser('ADMIN');
  author = await createUser();
  follower = await createUser();
  const categoryId = (await createCategory()).id;
  organizationId = (await createOrganization()).id;
  issueId = await createIssue(app, author, categoryId, admin);
  await request(app).post(`/api/issues/${issueId}/followers`).set(follower.auth);
});

describe('status workflow', () => {
  it('only allows the defined transitions', async () => {
    const skip = await status('RESOLVED', { source: 'Phone call' });
    expect(skip.status).toBe(409);
    expect(skip.body.error).toMatchObject({
      code: 'INVALID_TRANSITION',
      details: { from: 'OPEN', to: 'RESOLVED', allowed: ['UNDER_REVIEW'] },
    });
    expect((await status('UNDER_REVIEW')).status).toBe(201);
  });

  it('lets an admin skip the referral step and go straight to IN_PROGRESS', async () => {
    expect((await status('UNDER_REVIEW')).status).toBe(201);
    expect((await status('IN_PROGRESS')).status).toBe(400); // a source is still required
    expect((await status('IN_PROGRESS', { source: 'Site visit' })).status).toBe(201);
    expect((await status('RESOLVED', { source: 'Phone call' })).status).toBe(201);
    const issue = await testPrisma().publicIssue.findUniqueOrThrow({ where: { id: issueId } });
    expect(issue.resolutionStatus).toBe('RESOLVED');
    expect(await testPrisma().issueAssignment.count()).toBe(0);
  });

  it('requires a sent referral before REFERRED', async () => {
    await status('UNDER_REVIEW');
    const early = await status('REFERRED');
    expect(early.status).toBe(409);

    await request(app)
      .post(`/api/admin/issues/${issueId}/assignments`)
      .set(admin.auth)
      .send({ organizationId });
    expect((await status('REFERRED')).status).toBe(409); // prepared is not enough

    await testPrisma().issueAssignment.deleteMany();
    await sentAssignment();
    expect((await status('REFERRED')).status).toBe(201);
  });

  it('requires a source for IN_PROGRESS and RESOLVED, and supports reopening', async () => {
    await status('UNDER_REVIEW');
    await sentAssignment();
    await status('REFERRED');
    expect((await status('IN_PROGRESS')).status).toBe(400);
    expect((await status('IN_PROGRESS', { source: 'Reply from the department' })).status).toBe(201);
    expect((await status('RESOLVED', { source: 'Site visit by an admin' })).status).toBe(201);

    let issue = await testPrisma().publicIssue.findUniqueOrThrow({ where: { id: issueId } });
    expect(issue.resolvedAt).not.toBeNull();

    expect((await status('OPEN')).status).toBe(201);
    issue = await testPrisma().publicIssue.findUniqueOrThrow({ where: { id: issueId } });
    expect(issue.resolutionStatus).toBe('OPEN');
    expect(issue.resolvedAt).toBeNull();
  });

  it('writes the timeline and audit log, and notifies followers but not the actor', async () => {
    await status('UNDER_REVIEW');
    const timeline = await request(app).get(`/api/issues/${issueId}/history`);
    expect(timeline.body.data.entries).toHaveLength(1);
    expect(timeline.body.data.entries[0]).toMatchObject({
      type: 'STATUS_CHANGE',
      fromStatus: 'OPEN',
      toStatus: 'UNDER_REVIEW',
      label: 'Recorded by a VoiceUp admin.',
      recordedBy: { id: admin.id, name: admin.name },
    });
    expect(await testPrisma().auditLog.count({ where: { action: 'ISSUE_STATUS_CHANGED' } })).toBe(
      1,
    );

    const forFollower = await testPrisma().notification.findMany({
      where: { userId: follower.id, type: 'STATUS_CHANGED' },
    });
    const forAuthor = await testPrisma().notification.findMany({
      where: { userId: author.id, type: 'STATUS_CHANGED' },
    });
    expect(forFollower).toHaveLength(1);
    expect(forAuthor).toHaveLength(1); // authors follow their own issue
    expect(await testPrisma().notification.count({ where: { userId: admin.id } })).toBe(0);
  });

  it('is admin-only', async () => {
    const res = await request(app)
      .post(`/api/admin/issues/${issueId}/status`)
      .set(author.auth)
      .send({ toStatus: 'UNDER_REVIEW', note: 'I decide myself.' });
    expect(res.status).toBe(403);
  });

  it('handles concurrent status changes without skipping states', async () => {
    const results = await Promise.all([status('UNDER_REVIEW'), status('UNDER_REVIEW')]);
    expect(results.map((res) => res.status).sort()).toEqual([201, 409]);
    expect(await testPrisma().issueStatusHistory.count()).toBe(1);
  });
});

describe('verified admin updates', () => {
  it('adds a timeline entry without changing the status', async () => {
    const res = await request(app)
      .post(`/api/admin/issues/${issueId}/updates`)
      .set(admin.auth)
      .send({ note: 'An admin visited the site and confirmed the problem.', source: 'Site visit' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      type: 'ADMIN_UPDATE',
      fromStatus: 'OPEN',
      toStatus: 'OPEN',
    });
    expect(await testPrisma().notification.count({ where: { type: 'ISSUE_UPDATE' } })).toBe(2);
  });
});

describe('referrals and external responses', () => {
  it('requires date, method and evidence to mark a referral as sent', async () => {
    const created = await request(app)
      .post(`/api/admin/issues/${issueId}/assignments`)
      .set(admin.auth)
      .send({ organizationId });
    expect(created.status).toBe(201);
    expect(created.body.data.referralStatus).toBe('PREPARED');
    const assignmentId = created.body.data.id as string;

    const missing = await request(app)
      .patch(`/api/admin/assignments/${assignmentId}`)
      .set(admin.auth)
      .send({ referralStatus: 'SENT', sentAt: new Date().toISOString() });
    expect(missing.status).toBe(400);

    const future = await request(app)
      .patch(`/api/admin/assignments/${assignmentId}`)
      .set(admin.auth)
      .send({
        referralStatus: 'SENT',
        sentAt: new Date(Date.now() + 86_400_000).toISOString(),
        sentMethod: 'Email',
        sentEvidence: 'Reference 123',
      });
    expect(future.status).toBe(400);

    const skip = await request(app)
      .patch(`/api/admin/assignments/${assignmentId}`)
      .set(admin.auth)
      .send({
        referralStatus: 'ACKNOWLEDGED',
        ackAt: new Date().toISOString(),
        ackEvidence: 'Reply 42',
      });
    expect(skip.status).toBe(409);
  });

  it('prevents assigning the same organization twice', async () => {
    await request(app)
      .post(`/api/admin/issues/${issueId}/assignments`)
      .set(admin.auth)
      .send({ organizationId });
    const res = await request(app)
      .post(`/api/admin/issues/${issueId}/assignments`)
      .set(admin.auth)
      .send({ organizationId });
    expect(res.status).toBe(409);
  });

  it('records responses only for sent referrals and labels them as admin records', async () => {
    const created = await request(app)
      .post(`/api/admin/issues/${issueId}/assignments`)
      .set(admin.auth)
      .send({ organizationId });
    const response = {
      receivedAt: new Date().toISOString(),
      summary: 'The department scheduled a repair for next week.',
      evidenceNote: 'Email reply from the department, ticket 4471',
      evidenceUrl: 'https://example.com/ticket/4471',
    };
    const early = await request(app)
      .post(`/api/admin/assignments/${created.body.data.id as string}/responses`)
      .set(admin.auth)
      .send(response);
    expect(early.status).toBe(409);

    await testPrisma().issueAssignment.deleteMany();
    const assignmentId = await sentAssignment();
    const res = await request(app)
      .post(`/api/admin/assignments/${assignmentId}/responses`)
      .set(admin.auth)
      .send(response);
    expect(res.status).toBe(201);

    const publicView = await request(app).get(`/api/issues/${issueId}/referrals`);
    const referral = publicView.body.data[0];
    expect(referral.referralStatus).toBe('SENT');
    expect(referral.sentEvidence).toBeUndefined();
    expect(referral.responses[0]).toMatchObject({
      summary: response.summary,
      hasEvidence: true,
      label: expect.stringContaining('as recorded by a VoiceUp admin') as unknown,
    });
    expect(referral.responses[0].evidenceNote).toBeUndefined();

    const adminView = await request(app).get(`/api/issues/${issueId}/referrals`).set(admin.auth);
    expect(adminView.body.data[0].responses[0].evidenceNote).toBe(response.evidenceNote);
    expect(await testPrisma().notification.count({ where: { type: 'EXTERNAL_RESPONSE' } })).toBe(2);
  });

  it('rejects a response dated before the referral was sent', async () => {
    const assignmentId = await sentAssignment();
    const res = await request(app)
      .post(`/api/admin/assignments/${assignmentId}/responses`)
      .set(admin.auth)
      .send({
        receivedAt: new Date(Date.now() - 86_400_000).toISOString(),
        summary: 'Old reply that predates sending',
        evidenceNote: 'Some evidence text',
      });
    expect(res.status).toBe(400);
  });

  it('is backed by database CHECK constraints', async () => {
    const created = await request(app)
      .post(`/api/admin/issues/${issueId}/assignments`)
      .set(admin.auth)
      .send({ organizationId });
    await expect(
      testPrisma().issueAssignment.update({
        where: { id: created.body.data.id as string },
        data: { referralStatus: 'SENT' },
      }),
    ).rejects.toThrow();
  });
});

describe('reopen requests', () => {
  async function resolve() {
    await status('UNDER_REVIEW');
    await sentAssignment();
    await status('REFERRED');
    await status('IN_PROGRESS', { source: 'Reply' });
    await status('RESOLVED', { source: 'Reply' });
  }

  it('lets the reporter and confirmers appeal a resolution, once', async () => {
    const confirmer = await createUser();
    await request(app).post(`/api/issues/${issueId}/confirmations`).set(confirmer.auth);

    const notResolved = await request(app)
      .post(`/api/issues/${issueId}/reopen-requests`)
      .set(author.auth)
      .send({ body: 'This was never actually fixed.' });
    expect(notResolved.status).toBe(409);

    await resolve();
    const stranger = await request(app)
      .post(`/api/issues/${issueId}/reopen-requests`)
      .set(follower.auth)
      .send({ body: 'I think this is not fixed.' });
    expect(stranger.status).toBe(403);

    const ok = await request(app)
      .post(`/api/issues/${issueId}/reopen-requests`)
      .set(confirmer.auth)
      .send({ body: 'The light is still off at night.' });
    expect(ok.status).toBe(201);
    const twice = await request(app)
      .post(`/api/issues/${issueId}/reopen-requests`)
      .set(confirmer.auth)
      .send({ body: 'The light is still off at night!' });
    expect(twice.status).toBe(409);

    const queue = await request(app).get('/api/admin/reopen-requests').set(admin.auth);
    expect(queue.body.meta.total).toBe(1);

    await status('OPEN');
    expect(
      (await request(app).get('/api/admin/reopen-requests').set(admin.auth)).body.meta.total,
    ).toBe(0);
  });
});
