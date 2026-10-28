import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { detectImageType } from '../src/lib/storage.js';
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

describe('image type detection', () => {
  it('recognizes JPEG, PNG and WebP by their bytes only', () => {
    expect(detectImageType(PNG)?.mimeType).toBe('image/png');
    expect(detectImageType(JPEG)?.mimeType).toBe('image/jpeg');
    expect(detectImageType(WEBP)?.mimeType).toBe('image/webp');
    expect(
      detectImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')),
    ).toBeNull();
    expect(detectImageType(Buffer.from('%PDF-1.7'))).toBeNull();
  });
});

describe('uploads', () => {
  it('stores the image in the database and serves it with the right type', async () => {
    const issueId = await createIssue(app, author, categoryId);
    const res = await upload(issueId, author, PNG, '../../etc/passwd.png');
    await request(app).post(`/api/admin/issues/${issueId}/approve`).set(admin.auth).send({});

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ mimeType: 'image/png', sizeBytes: PNG.length });
    const stored = await testPrisma().mediaAttachment.findFirstOrThrow();
    expect(Buffer.from(stored.data).equals(PNG)).toBe(true);
    expect(res.body.data).not.toHaveProperty('data');

    const file = await request(app).get(res.body.data.url as string);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toBe('image/png');
    expect(file.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.from(file.body as Buffer).equals(PNG)).toBe(true);
  });

  it('ignores the declared type and rejects files that are not images', async () => {
    const issueId = await createIssue(app, author, categoryId);
    const res = await request(app)
      .post(`/api/issues/${issueId}/attachments`)
      .set(author.auth)
      .attach('file', Buffer.from('<script>alert(1)</script>'), {
        filename: 'evil.png',
        contentType: 'image/png',
      });
    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('rejects files over 5 MB', async () => {
    const issueId = await createIssue(app, author, categoryId);
    const big = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]);
    const res = await upload(issueId, author, big);
    expect(res.status).toBe(413);
  });

  it('allows at most 5 images per issue', async () => {
    const issueId = await createIssue(app, author, categoryId);
    for (let index = 0; index < 5; index += 1) {
      expect((await upload(issueId, author, PNG)).status).toBe(201);
    }
    const res = await upload(issueId, author, PNG);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('LIMIT_REACHED');
  });

  it('moderates reporter images: no reporter uploads once the issue is published', async () => {
    const issueId = await createIssue(app, author, categoryId, admin);
    const res = await upload(issueId, author, PNG);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_STATE');
  });

  it('lets only the reporter or an admin upload', async () => {
    const issueId = await createIssue(app, author, categoryId, admin);
    expect((await upload(issueId, other, PNG)).status).toBe(403);
    expect((await upload(issueId, admin, PNG)).status).toBe(201);
    expect(
      (await request(app).post(`/api/issues/${issueId}/attachments`).attach('file', PNG, 'a.png'))
        .status,
    ).toBe(401);
  });

  it('keeps images of pending issues private', async () => {
    const issueId = await createIssue(app, author, categoryId);
    const res = await upload(issueId, author, PNG);
    const url = res.body.data.url as string;

    expect((await request(app).get(url)).status).toBe(404);
    expect((await request(app).get(url).set(other.auth)).status).toBe(404);
    expect((await request(app).get(url).set(author.auth)).status).toBe(200);
    expect((await request(app).get(url).set(admin.auth)).status).toBe(200);
  });
});

describe('removing images', () => {
  it('lets the reporter remove images only while pending, and admins at any time', async () => {
    const issueId = await createIssue(app, author, categoryId);
    const first = await upload(issueId, author, PNG);
    expect(
      (
        await request(app)
          .delete(`/api/attachments/${first.body.data.id as string}`)
          .set(author.auth)
      ).status,
    ).toBe(204);

    const second = await upload(issueId, author, PNG);
    await request(app).post(`/api/admin/issues/${issueId}/approve`).set(admin.auth).send({});
    const id = second.body.data.id as string;
    expect((await request(app).delete(`/api/attachments/${id}`).set(author.auth)).status).toBe(403);
    expect((await request(app).delete(`/api/attachments/${id}`).set(admin.auth)).status).toBe(204);
    expect(await testPrisma().auditLog.count({ where: { action: 'ATTACHMENT_DELETED' } })).toBe(1);
    expect((await request(app).get(`/api/attachments/${id}/file`).set(admin.auth)).status).toBe(
      404,
    );
  });
});
