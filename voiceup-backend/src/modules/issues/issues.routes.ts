import { Router } from 'express';
import type { AppDependencies } from '../../deps.js';
import { parseId } from '../../lib/http.js';
import { currentUser, requireAuth } from '../../middleware/auth.js';
import { writeRateLimiter } from '../../middleware/security.js';
import {
  adminListIssuesQuery,
  approveIssueBody,
  createIssueBody,
  listIssuesQuery,
  redactIssueBody,
  rejectIssueBody,
  similarIssuesQuery,
  updateIssueBody,
} from './issues.schemas.js';
import {
  approveIssue,
  createIssue,
  deleteOwnIssue,
  getIssue,
  listIssuesForAdmin,
  listOwnIssues,
  listPublicIssues,
  redactIssue,
  rejectIssue,
  updateOwnIssue,
} from './issues.service.js';
import { findSimilarIssues } from './similar.service.js';

export function createIssuesRouter({ env, prisma }: AppDependencies): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    res.json(await listPublicIssues(prisma, listIssuesQuery.parse(req.query), req.user));
  });

  // Static paths are declared before "/:id".
  router.get('/similar', async (req, res) => {
    res.json({
      data: await findSimilarIssues(prisma, similarIssuesQuery.parse(req.query)),
      meta: { note: 'Suggestions only. The reporter decides whether an issue is the same.' },
    });
  });

  router.get('/mine', requireAuth, async (req, res) => {
    res.json(await listOwnIssues(prisma, listIssuesQuery.parse(req.query), currentUser(req)));
  });

  router.get('/:id', async (req, res) => {
    res.json({ data: await getIssue(prisma, parseId(req.params.id), req.user) });
  });

  router.post('/', requireAuth, writeRateLimiter(env), async (req, res) => {
    const issue = await createIssue(prisma, createIssueBody.parse(req.body), currentUser(req));
    res.status(201).json({ data: issue });
  });

  router.patch('/:id', requireAuth, async (req, res) => {
    const issue = await updateOwnIssue(
      prisma,
      parseId(req.params.id),
      updateIssueBody.parse(req.body),
      currentUser(req),
    );
    res.json({ data: issue });
  });

  router.delete('/:id', requireAuth, async (req, res) => {
    await deleteOwnIssue(prisma, parseId(req.params.id), currentUser(req));
    res.status(204).end();
  });

  return router;
}

/** Mounted under /api/admin/issues (admin only). */
export function createIssuesAdminRouter({ prisma }: AppDependencies): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    res.json(
      await listIssuesForAdmin(prisma, adminListIssuesQuery.parse(req.query), currentUser(req)),
    );
  });

  router.patch('/:id', async (req, res) => {
    const issue = await redactIssue(
      prisma,
      parseId(req.params.id),
      redactIssueBody.parse(req.body),
      currentUser(req),
    );
    res.json({ data: issue });
  });

  router.post('/:id/approve', async (req, res) => {
    const issue = await approveIssue(
      prisma,
      parseId(req.params.id),
      approveIssueBody.parse(req.body ?? {}),
      currentUser(req),
    );
    res.json({ data: issue });
  });

  router.post('/:id/reject', async (req, res) => {
    const issue = await rejectIssue(
      prisma,
      parseId(req.params.id),
      rejectIssueBody.parse(req.body),
      currentUser(req),
    );
    res.json({ data: issue });
  });

  return router;
}
