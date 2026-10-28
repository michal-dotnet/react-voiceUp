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

/**
 * Verification of the "report with image" and "edit before approval" flows end to end.
 * The behavior itself lives in issues.* and attachments.routes.ts; these tests only add
 * coverage for cases not checked elsewhere.
 */
const app = buildApp();
const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489',
  'hex',
);
const JPEG = Buffer.from('ffd8ffe000104a46494600010100000100010000', 'hex');
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]);

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

const upload = (issueId: string, user: TestUser, file: Buffer, name = 'photo.png') =>
  request(app).post(`/api/issues/${issueId}/attachments`).set(user.auth).attach('file', file, name);

const listImages = (issueId: string, user: TestUser) =>
  request(app).get(`/api/issues/${issueId}/attachments`).set(user.auth);

describe('reporting an issue with an image', () => {
  it('creates an issue without an image as before', async () => {
    const id = await createIssue(app, author, categoryId);
    const images = await listImages(id, author);
    expect(images.status).toBe(200);
    expect(images.body.data).toEqual([]);
  });

  it('creates the issue, then attaches JPEG and WebP images that can be listed and fetched', async () => {
    const id = await createIssue(app, author, categoryId);
    const jpeg = await upload(id, author, JPEG, 'photo.jpg');
    const webp = await upload(id, author, WEBP, 'photo.webp');
    expect(jpeg.status).toBe(201);
    expect(webp.status).toBe(201);
    expect(jpeg.body.data).toMatchObject({ issueId: id, mimeType: 'image/jpeg' });
    expect(webp.body.data.mimeType).toBe('image/webp');

    const images = await listImages(id, author);
    expect(images.body.data.map((image: { id: string }) => image.id)).toEqual([
      jpeg.body.data.id,
      webp.body.data.id,
    ]);
    const file = await request(app)
      .get(jpeg.body.data.url as string)
      .set(author.auth);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toBe('image/jpeg');
  });

  it('rejects an upload without a file', async () => {
    const id = await createIssue(app, author, categoryId);
    const res = await request(app).post(`/api/issues/${id}/attachments`).set(author.auth);
    expect(res.status).toBe(400);
  });
});

describe('editing an issue before approval', () => {
  it('lets the author edit every editable field while pending', async () => {
    const id = await createIssue(app, author, categoryId);
    const lighting = await createCategory('Lighting', 'lighting');
    const res = await request(app).patch(`/api/issues/${id}`).set(author.auth).send({
      title: 'Edited title of the issue',
      description: 'An edited description that is long enough.',
      categoryId: lighting.id,
      area: 'North',
      location: 'Corner of the main square',
    });
    expect(res.status).toBe(200);
    const stored = await testPrisma().publicIssue.findUniqueOrThrow({ where: { id } });
    expect(stored).toMatchObject({
      title: 'Edited title of the issue',
      description: 'An edited description that is long enough.',
      categoryId: lighting.id,
      area: 'North',
      location: 'Corner of the main square',
      moderationStatus: 'PENDING_REVIEW',
      authorId: author.id,
    });
  });

  it('applies the same validation as creation', async () => {
    const id = await createIssue(app, author, categoryId);
    const short = await request(app)
      .patch(`/api/issues/${id}`)
      .set(author.auth)
      .send({ title: 'x' });
    expect(short.status).toBe(400);
    expect(short.body.error.code).toBe('VALIDATION_ERROR');
    const badCategory = await request(app)
      .patch(`/api/issues/${id}`)
      .set(author.auth)
      .send({ categoryId: 'not-a-uuid' });
    expect(badCategory.status).toBe(400);
  });

  it('rejects protected fields and leaves them unchanged', async () => {
    const id = await createIssue(app, author, categoryId);
    for (const body of [
      { moderationStatus: 'APPROVED' },
      { authorId: other.id },
      { resolutionStatus: 'RESOLVED' },
    ]) {
      const res = await request(app).patch(`/api/issues/${id}`).set(author.auth).send(body);
      expect(res.status).toBe(400);
    }
    const stored = await testPrisma().publicIssue.findUniqueOrThrow({ where: { id } });
    expect(stored).toMatchObject({
      moderationStatus: 'PENDING_REVIEW',
      resolutionStatus: 'OPEN',
      authorId: author.id,
    });
  });

  it('rejects unauthenticated edits', async () => {
    const id = await createIssue(app, author, categoryId);
    const res = await request(app).patch(`/api/issues/${id}`).send({ title: 'Anonymous edit' });
    expect(res.status).toBe(401);
  });

  it('hides a pending issue from other users, so they cannot edit it', async () => {
    const id = await createIssue(app, author, categoryId);
    const res = await request(app)
      .patch(`/api/issues/${id}`)
      .set(other.auth)
      .send({ title: 'Hijacked title' });
    expect(res.status).toBe(404);
  });

  it('blocks edits and image changes after rejection', async () => {
    const id = await createIssue(app, author, categoryId);
    const image = await upload(id, author, PNG);
    const rejected = await request(app)
      .post(`/api/admin/issues/${id}/reject`)
      .set(admin.auth)
      .send({ reason: 'Not a public issue.' });
    expect(rejected.status).toBe(200);

    const edit = await request(app)
      .patch(`/api/issues/${id}`)
      .set(author.auth)
      .send({ title: 'Trying again after rejection' });
    expect(edit.status).toBe(409);
    expect(edit.body.error.code).toBe('INVALID_STATE');
    expect((await upload(id, author, PNG)).status).toBe(409);
    const remove = await request(app)
      .delete(`/api/attachments/${image.body.data.id as string}`)
      .set(author.auth);
    expect(remove.status).toBe(403);
  });
});

describe('changing the image of a pending issue', () => {
  it('replaces an image by removing the old one and uploading a new one', async () => {
    const id = await createIssue(app, author, categoryId);
    const old = await upload(id, author, PNG);
    const oldUrl = old.body.data.url as string;

    const removed = await request(app)
      .delete(`/api/attachments/${old.body.data.id as string}`)
      .set(author.auth);
    expect(removed.status).toBe(204);
    expect((await request(app).get(oldUrl).set(author.auth)).status).toBe(404);

    const replacement = await upload(id, author, JPEG, 'new.jpg');
    expect(replacement.status).toBe(201);
    const images = await listImages(id, author);
    expect(images.body.data).toHaveLength(1);
    expect(images.body.data[0].id).toBe(replacement.body.data.id);
  });

  it('does not let other or anonymous users remove the image', async () => {
    const id = await createIssue(app, author, categoryId);
    const image = await upload(id, author, PNG);
    const path = `/api/attachments/${image.body.data.id as string}`;
    expect((await request(app).delete(path)).status).toBe(401);
    expect((await request(app).delete(path).set(other.auth)).status).toBe(404);
    expect(await testPrisma().mediaAttachment.count()).toBe(1);
  });
});
