import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { overlap, scoreSimilarity, tokenize } from '../src/lib/similarity.js';
import {
  buildApp,
  createCategory,
  createIssue,
  createUser,
  resetDb,
  type TestUser,
} from './helpers/setup.js';

describe('similarity scoring (unit)', () => {
  it('tokenizes Hebrew and English and drops stop words', () => {
    expect([...tokenize('The broken LIGHT, near the school!')]).toEqual([
      'broken',
      'light',
      'school',
    ]);
    expect([...tokenize('בור גדול על הכביש')]).toEqual(['בור', 'גדול', 'הכביש']);
  });

  it('treats a Hebrew prefix letter as the same word', () => {
    expect(overlap(tokenize('הכביש'), tokenize('כביש'))).toBe(1);
    expect(overlap(tokenize('במדרכה'), tokenize('מדרכה'))).toBe(1);
  });

  it('scores title, keywords, area and open status, with reasons', () => {
    const result = scoreSimilarity(
      { title: 'Broken streetlight', description: 'dark at night', area: 'Center' },
      {
        title: 'Streetlight broken again',
        description: 'Very dark at night',
        area: 'center',
        isResolved: false,
      },
    );
    expect(result.score).toBe(1);
    expect(result.reasons).toEqual(expect.arrayContaining(['Same area', 'Still open']));
  });

  it('gives no open bonus to unrelated text', () => {
    const result = scoreSimilarity(
      { title: 'Noisy construction site' },
      { title: 'Broken bench', description: 'Wood is cracked', area: 'North', isResolved: false },
    );
    expect(result.score).toBe(0);
  });
});

describe('GET /api/issues/similar', () => {
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

  it('suggests published issues in the same category, best match first', async () => {
    const parks = (await createCategory('Parks', 'parks')).id;
    const best = await createIssue(app, author, categoryId, admin, {
      title: 'Streetlight broken on Herzl',
      area: 'Center',
    });
    await createIssue(app, author, categoryId, admin, {
      title: 'Streetlight flickering',
      area: 'North',
    });
    await createIssue(app, author, parks, admin, {
      title: 'Streetlight broken in park',
      area: 'Center',
    });
    await createIssue(app, author, categoryId, undefined, { title: 'Streetlight broken pending' });

    const res = await request(app)
      .get('/api/issues/similar')
      .query({ title: 'Broken streetlight Herzl', categoryId, area: 'Center' });

    expect(res.status).toBe(200);
    expect(res.body.meta.note).toMatch(/Suggestions only/);
    expect(res.body.data[0]).toMatchObject({
      id: best,
      reasons: expect.arrayContaining(['Same area']) as unknown,
    });
    expect(res.body.data.every((match: { score: number }) => match.score >= 0.3)).toBe(true);
    expect(res.body.data).toHaveLength(2); // other category and pending issue excluded
  });

  it('returns an empty list when nothing is similar', async () => {
    await createIssue(app, author, categoryId, admin, { title: 'Garbage bins overflowing' });
    const res = await request(app)
      .get('/api/issues/similar')
      .query({ title: 'Noisy neighbours', categoryId });
    expect(res.body.data).toEqual([]);
  });

  it('validates the query', async () => {
    expect((await request(app).get('/api/issues/similar').query({ title: 'x' })).status).toBe(400);
  });
});
