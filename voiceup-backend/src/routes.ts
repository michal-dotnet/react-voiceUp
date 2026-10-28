import { Router } from 'express';
import type { AppDependencies } from './deps.js';
import { createAdminRouter } from './modules/admin/admin.routes.js';
import { createAttachmentsRouter } from './modules/attachments/attachments.routes.js';
import { createAuthRouter } from './modules/auth/auth.routes.js';
import { createCommunityRouter } from './modules/community/community.routes.js';
import { createHealthRouter } from './modules/health/health.routes.js';
import { createIssuesRouter } from './modules/issues/issues.routes.js';
import { createNotificationsRouter } from './modules/notifications/notifications.routes.js';
import { createReferenceRouter } from './modules/reference/reference.routes.js';
import { createUsersRouter } from './modules/users/users.routes.js';
import { createWorkflowRouter } from './modules/workflow/workflow.routes.js';

/** Root of the API, mounted at /api. Each feature module contributes its own router. */
export function createApiRouter(deps: AppDependencies): Router {
  const router = Router();

  router.use('/health', createHealthRouter(deps));
  router.use('/auth', createAuthRouter(deps));
  router.use('/users', createUsersRouter(deps));
  router.use(createReferenceRouter(deps));
  router.use('/issues', createIssuesRouter(deps));
  router.use('/issues', createCommunityRouter(deps));
  router.use('/issues', createWorkflowRouter(deps));
  router.use(createAttachmentsRouter(deps));
  router.use('/notifications', createNotificationsRouter(deps));
  router.use('/admin', createAdminRouter(deps));

  return router;
}
