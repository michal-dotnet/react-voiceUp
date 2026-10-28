import { Router } from 'express';
import { z } from 'zod';
import type { AppDependencies } from '../../deps.js';
import { pageMeta, paginationQuery, toSkipTake } from '../../lib/pagination.js';
import { currentUser, requireAdmin } from '../../middleware/auth.js';
import { createCommunityAdminRouter } from '../community/community.routes.js';
import { createIssuesAdminRouter } from '../issues/issues.routes.js';
import { mergeBody, mergeIssues } from '../merge/merge.service.js';
import { createReferenceAdminRouter } from '../reference/reference.routes.js';
import { createUsersAdminRouter } from '../users/users.routes.js';
import { createWorkflowAdminRouter } from '../workflow/workflow.routes.js';
import { publicUserSelect } from '../users/users.dto.js';
import { getDashboard } from './dashboard.service.js';

export const auditLogQuery = paginationQuery.extend({
  action: z.string().trim().max(60).optional(),
  entityType: z.string().trim().max(40).optional(),
  entityId: z.uuid().optional(),
});

/** Everything under /api/admin requires the ADMIN role, checked on every request. */
export function createAdminRouter(deps: AppDependencies): Router {
  const { prisma } = deps;
  const router = Router();
  router.use(requireAdmin);

  // Merge is declared before the issues sub-router so "/issues/merge" is not read as an id.
  router.post('/issues/merge', async (req, res) => {
    res.json({ data: await mergeIssues(prisma, mergeBody.parse(req.body), currentUser(req)) });
  });

  router.use('/issues', createIssuesAdminRouter(deps));
  router.use('/users', createUsersAdminRouter(deps));
  router.use(createWorkflowAdminRouter(deps));
  router.use(createCommunityAdminRouter(deps));
  router.use(createReferenceAdminRouter(deps));

  router.get('/dashboard', async (_req, res) => {
    res.json({ data: await getDashboard(prisma) });
  });

  router.get('/audit-logs', async (req, res) => {
    const query = auditLogQuery.parse(req.query);
    const where = {
      ...(query.action && { action: query.action }),
      ...(query.entityType && { entityType: query.entityType }),
      ...(query.entityId && { entityId: query.entityId }),
    };
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: { actor: { select: publicUserSelect } },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        ...toSkipTake(query),
      }),
      prisma.auditLog.count({ where }),
    ]);
    res.json({ data: logs, meta: pageMeta(query, total) });
  });

  return router;
}
