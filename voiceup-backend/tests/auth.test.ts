import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildApp,
  createUser,
  resetDb,
  TEST_JWT_SECRET,
  TEST_PASSWORD,
  testPrisma,
} from './helpers/setup.js';

const app = buildApp();

beforeEach(resetDb);

describe('POST /api/auth/register', () => {
  it('creates a USER and returns a token without the password hash', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Dana', email: '  Dana@Example.COM ', password: 'longenough1' });

    expect(res.status).toBe(201);
    expect(res.body.data.user).toMatchObject({
      name: 'Dana',
      email: 'dana@example.com',
      role: 'USER',
    });
    expect(res.body.data.tokenType).toBe('Bearer');
    expect(typeof res.body.data.accessToken).toBe('string');
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2/);
  });

  it('ignores a role sent in the body', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Eve', email: 'eve@example.com', password: 'longenough1', role: 'ADMIN' });

    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('USER');
  });

  it('stores an Argon2id hash, not the password', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ name: 'Dana', email: 'dana@example.com', password: 'longenough1' });
    const user = await testPrisma().user.findUniqueOrThrow({
      where: { email: 'dana@example.com' },
    });

    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.passwordHash).not.toContain('longenough1');
  });

  it('rejects a duplicate email with EMAIL_TAKEN', async () => {
    const body = { name: 'Dana', email: 'dana@example.com', password: 'longenough1' };
    await request(app).post('/api/auth/register').send(body);
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...body, email: 'DANA@example.com' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('validates the input', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'D', email: 'not-an-email', password: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const paths = (res.body.error.details as { path: string }[]).map((detail) => detail.path);
    expect(paths).toEqual(expect.arrayContaining(['name', 'email', 'password']));
  });
});

describe('POST /api/auth/login', () => {
  it('returns a token that works on protected routes', async () => {
    const user = await createUser();
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: TEST_PASSWORD });

    expect(login.status).toBe(200);
    const me = await request(app)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${login.body.data.accessToken as string}`);
    expect(me.status).toBe(200);
    expect(me.body.data.email).toBe(user.email);
  });

  it('gives the same error for a wrong password and an unknown email', async () => {
    const user = await createUser();
    const wrong = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'WrongPassword1' });
    const unknown = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'WrongPassword1' });

    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('is rate limited separately from the rest of the API', async () => {
    const limited = buildApp({ AUTH_RATE_LIMIT_MAX: '2' });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await request(limited).post('/api/auth/login').send({ email: 'a@b.co', password: 'x' });
    }
    const res = await request(limited)
      .post('/api/auth/login')
      .send({ email: 'a@b.co', password: 'x' });

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });
});

describe('access tokens', () => {
  it('requires a token for /api/users/me', async () => {
    const res = await request(app).get('/api/users/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects tampered, expired and foreign-secret tokens', async () => {
    const user = await createUser();
    const expired = jwt.sign({}, TEST_JWT_SECRET, {
      subject: user.id,
      issuer: 'voiceup',
      expiresIn: -10,
    });
    const foreign = jwt.sign({}, 'another-secret-that-is-also-32-characters', {
      subject: user.id,
      issuer: 'voiceup',
    });
    const noneAlg = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(
      JSON.stringify({ sub: user.id, iss: 'voiceup' }),
    ).toString('base64url')}.`;

    for (const token of [`${user.token}x`, expired, foreign, noneAlg, 'garbage']) {
      const res = await request(app).get('/api/users/me').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(401);
    }
  });

  it('stops working when the user no longer exists', async () => {
    const user = await createUser();
    await testPrisma().user.delete({ where: { id: user.id } });
    const res = await request(app).get('/api/users/me').set(user.auth);
    expect(res.status).toBe(401);
  });

  it('applies role changes immediately, without a new token', async () => {
    const admin = await createUser('ADMIN');
    const user = await createUser();
    expect((await request(app).get('/api/admin/dashboard').set(user.auth)).status).toBe(403);

    await request(app).patch(`/api/admin/users/${user.id}`).set(admin.auth).send({ role: 'ADMIN' });
    expect((await request(app).get('/api/admin/dashboard').set(user.auth)).status).toBe(200);
  });
});

describe('current user', () => {
  it('updates the display name only', async () => {
    const user = await createUser();
    const res = await request(app).patch('/api/users/me').set(user.auth).send({ name: 'New Name' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('New Name');

    const escalation = await request(app)
      .patch('/api/users/me')
      .set(user.auth)
      .send({ name: 'X Name', role: 'ADMIN' });
    expect(escalation.status).toBe(400);
  });

  it('changes the password after checking the current one', async () => {
    const user = await createUser();
    const wrong = await request(app)
      .post('/api/users/me/password')
      .set(user.auth)
      .send({ currentPassword: 'nope', newPassword: 'BrandNewPass1' });
    expect(wrong.status).toBe(401);

    const ok = await request(app)
      .post('/api/users/me/password')
      .set(user.auth)
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'BrandNewPass1' });
    expect(ok.status).toBe(204);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'BrandNewPass1' });
    expect(login.status).toBe(200);
  });
});

describe('admin user management', () => {
  it('is admin-only', async () => {
    const user = await createUser();
    expect((await request(app).get('/api/admin/users')).status).toBe(401);
    expect((await request(app).get('/api/admin/users').set(user.auth)).status).toBe(403);
  });

  it('lists users without password hashes and filters by role', async () => {
    const admin = await createUser('ADMIN');
    await createUser();
    const res = await request(app).get('/api/admin/users?role=USER').set(admin.auth);

    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(1);
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('changes roles with an audit entry, but never your own role', async () => {
    const admin = await createUser('ADMIN');
    const user = await createUser();

    const self = await request(app)
      .patch(`/api/admin/users/${admin.id}`)
      .set(admin.auth)
      .send({ role: 'USER' });
    expect(self.status).toBe(409);

    const res = await request(app)
      .patch(`/api/admin/users/${user.id}`)
      .set(admin.auth)
      .send({ role: 'ADMIN' });
    expect(res.status).toBe(200);
    const audit = await testPrisma().auditLog.findFirst({ where: { action: 'USER_ROLE_CHANGED' } });
    expect(audit).toMatchObject({ actorId: admin.id, entityId: user.id });
  });

  it('returns 400 for a malformed id and 404 for an unknown one', async () => {
    const admin = await createUser('ADMIN');
    expect((await request(app).get('/api/admin/users/not-a-uuid').set(admin.auth)).status).toBe(
      400,
    );
    expect(
      (
        await request(app)
          .get('/api/admin/users/00000000-0000-4000-8000-000000000000')
          .set(admin.auth)
      ).status,
    ).toBe(404);
  });
});
