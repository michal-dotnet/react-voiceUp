import { Router, type Request } from 'express';
import type { AppDependencies } from '../../deps.js';
import { errors } from '../../lib/errors.js';
import { guestKeyHash, ipHash, issueGuestToken, verifyGuestToken } from '../../lib/guestToken.js';
import { parseId } from '../../lib/http.js';
import { paginationQuery } from '../../lib/pagination.js';
import { currentUser, requireAuth } from '../../middleware/auth.js';
import { guestConfirmRateLimiter } from '../../middleware/security.js';
import {
  adminReportsQuery,
  commentBody,
  confirmBody,
  guestConfirmBody,
  handleReportBody,
  reopenRequestBody,
  reportBody,
  solutionBody,
  updateSolutionBody,
  visibilityBody,
} from './community.schemas.js';
import {
  addComment,
  addSolution,
  confirmIssue,
  confirmIssueAsGuest,
  editOwnContent,
  followIssue,
  handleReport,
  hideOwnContent,
  listComments,
  listPendingReopenRequests,
  listReports,
  listSolutions,
  reportContent,
  requestReopen,
  setContentVisibility,
  unconfirmIssue,
  unconfirmIssueAsGuest,
  unfollowIssue,
} from './community.service.js';

export const GUEST_TOKEN_HEADER = 'X-Guest-Token';

/** Reads and verifies the X-Guest-Token header. Missing → undefined; present but invalid → 400. */
function guestIdFromHeader(req: Request, secret: string): string | undefined {
  const token = req.get(GUEST_TOKEN_HEADER);
  if (token === undefined) return undefined;
  const guestId = verifyGuestToken(token, secret);
  if (!guestId) throw errors.badRequest('Invalid guest token.', { header: GUEST_TOKEN_HEADER });
  return guestId;
}

/** Mounted under /api/issues. */
export function createCommunityRouter({ env, prisma }: AppDependencies): Router {
  const router = Router();
  const secret = env.JWT_SECRET;
  const clientIpHash = (req: Request) => ipHash(req.ip ?? req.socket.remoteAddress ?? '', secret);

  // Confirmations: "this affects me too".
  // Registered users: unchanged behavior. Guests (no Authorization header): no body allowed,
  // identified by a signed guest token, rate limited per IP and capped per IP per issue.
  router.post('/:id/confirmations', guestConfirmRateLimiter(env), async (req, res) => {
    const issueId = parseId(req.params.id);
    if (req.user) {
      const { note } = confirmBody.parse(req.body ?? {});
      res.status(201).json({ data: await confirmIssue(prisma, issueId, req.user, note) });
      return;
    }
    guestConfirmBody.parse(req.body ?? {});
    const existingGuestId = guestIdFromHeader(req, secret);
    const issued = existingGuestId ? undefined : issueGuestToken(secret);
    const guestId = existingGuestId ?? issued?.guestId ?? '';
    const result = await confirmIssueAsGuest(
      prisma,
      issueId,
      { guestKeyHash: guestKeyHash(guestId, secret), ipHash: clientIpHash(req) },
      env.GUEST_CONFIRMATIONS_PER_IP,
    );
    // A new token is returned once; the client stores it and sends it in X-Guest-Token later.
    res.status(201).json({ data: { ...result, ...(issued && { guestToken: issued.token }) } });
  });

  router.delete('/:id/confirmations', guestConfirmRateLimiter(env), async (req, res) => {
    const issueId = parseId(req.params.id);
    if (req.user) {
      res.json({ data: await unconfirmIssue(prisma, issueId, req.user) });
      return;
    }
    const guestId = guestIdFromHeader(req, secret);
    if (!guestId) {
      throw errors.unauthorized(`Log in, or send the ${GUEST_TOKEN_HEADER} header.`);
    }
    res.json({
      data: await unconfirmIssueAsGuest(prisma, issueId, guestKeyHash(guestId, secret)),
    });
  });

  // Follows
  router.post('/:id/followers', requireAuth, async (req, res) => {
    res
      .status(201)
      .json({ data: await followIssue(prisma, parseId(req.params.id), currentUser(req)) });
  });
  router.delete('/:id/followers', requireAuth, async (req, res) => {
    res.json({ data: await unfollowIssue(prisma, parseId(req.params.id), currentUser(req)) });
  });

  // Comments
  router.get('/:id/comments', async (req, res) => {
    res.json(
      await listComments(
        prisma,
        parseId(req.params.id),
        paginationQuery.parse(req.query),
        req.user,
      ),
    );
  });
  router.post('/:id/comments', requireAuth, async (req, res) => {
    const { body } = commentBody.parse(req.body);
    res
      .status(201)
      .json({ data: await addComment(prisma, parseId(req.params.id), body, currentUser(req)) });
  });
  router.patch('/:id/comments/:commentId', requireAuth, async (req, res) => {
    const { body } = commentBody.parse(req.body);
    const comment = await editOwnContent(
      prisma,
      'comment',
      parseId(req.params.id),
      parseId(req.params.commentId),
      body,
      currentUser(req),
    );
    res.json({ data: comment });
  });
  router.delete('/:id/comments/:commentId', requireAuth, async (req, res) => {
    await hideOwnContent(
      prisma,
      'comment',
      parseId(req.params.id),
      parseId(req.params.commentId),
      currentUser(req),
    );
    res.status(204).end();
  });

  // Proposed solutions
  router.get('/:id/solutions', async (req, res) => {
    res.json(
      await listSolutions(
        prisma,
        parseId(req.params.id),
        paginationQuery.parse(req.query),
        req.user,
      ),
    );
  });
  router.post('/:id/solutions', requireAuth, async (req, res) => {
    const solution = await addSolution(
      prisma,
      parseId(req.params.id),
      solutionBody.parse(req.body),
      currentUser(req),
    );
    res.status(201).json({ data: solution });
  });
  router.patch('/:id/solutions/:solutionId', requireAuth, async (req, res) => {
    const { body } = updateSolutionBody.parse(req.body);
    const solution = await editOwnContent(
      prisma,
      'solution',
      parseId(req.params.id),
      parseId(req.params.solutionId),
      body,
      currentUser(req),
    );
    res.json({ data: solution });
  });
  router.delete('/:id/solutions/:solutionId', requireAuth, async (req, res) => {
    await hideOwnContent(
      prisma,
      'solution',
      parseId(req.params.id),
      parseId(req.params.solutionId),
      currentUser(req),
    );
    res.status(204).end();
  });

  // Reopen requests (appeal against a resolution)
  router.post('/:id/reopen-requests', requireAuth, async (req, res) => {
    const request = await requestReopen(
      prisma,
      parseId(req.params.id),
      reopenRequestBody.parse(req.body),
      currentUser(req),
    );
    res.status(201).json({ data: request });
  });

  // Reports of inappropriate content
  router.post('/:id/reports', requireAuth, async (req, res) => {
    const { reason } = reportBody.parse(req.body);
    const report = await reportContent(
      prisma,
      'ISSUE',
      parseId(req.params.id),
      undefined,
      reason,
      currentUser(req),
    );
    res.status(201).json({ data: report });
  });
  router.post('/:id/comments/:commentId/reports', requireAuth, async (req, res) => {
    const { reason } = reportBody.parse(req.body);
    const report = await reportContent(
      prisma,
      'COMMENT',
      parseId(req.params.id),
      parseId(req.params.commentId),
      reason,
      currentUser(req),
    );
    res.status(201).json({ data: report });
  });
  router.post('/:id/solutions/:solutionId/reports', requireAuth, async (req, res) => {
    const { reason } = reportBody.parse(req.body);
    const report = await reportContent(
      prisma,
      'SOLUTION',
      parseId(req.params.id),
      parseId(req.params.solutionId),
      reason,
      currentUser(req),
    );
    res.status(201).json({ data: report });
  });

  return router;
}

/** Mounted under /api/admin (admin only). */
export function createCommunityAdminRouter({ prisma }: AppDependencies): Router {
  const router = Router();

  router.patch('/comments/:id', async (req, res) => {
    const { moderationStatus } = visibilityBody.parse(req.body);
    res.json({
      data: await setContentVisibility(
        prisma,
        'comment',
        parseId(req.params.id),
        moderationStatus,
        currentUser(req),
      ),
    });
  });

  router.patch('/solutions/:id', async (req, res) => {
    const { moderationStatus } = visibilityBody.parse(req.body);
    res.json({
      data: await setContentVisibility(
        prisma,
        'solution',
        parseId(req.params.id),
        moderationStatus,
        currentUser(req),
      ),
    });
  });

  router.get('/reports', async (req, res) => {
    res.json(await listReports(prisma, adminReportsQuery.parse(req.query)));
  });

  router.patch('/reports/:id', async (req, res) => {
    res.json({
      data: await handleReport(
        prisma,
        parseId(req.params.id),
        handleReportBody.parse(req.body),
        currentUser(req),
      ),
    });
  });

  router.get('/reopen-requests', async (req, res) => {
    res.json(await listPendingReopenRequests(prisma, paginationQuery.parse(req.query)));
  });

  return router;
}
