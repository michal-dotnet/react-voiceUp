import { Router } from 'express';
import type { AppDependencies } from '../../deps.js';
import { parseId } from '../../lib/http.js';
import { currentUser } from '../../middleware/auth.js';
import {
  adminUpdateBody,
  changeStatusBody,
  createAssignmentBody,
  externalResponseBody,
  updateAssignmentBody,
} from './workflow.schemas.js';
import {
  changeStatus,
  createAssignment,
  getTimeline,
  listReferrals,
  postAdminUpdate,
  recordExternalResponse,
  updateAssignment,
} from './workflow.service.js';

/** Public reads, mounted under /api/issues. */
export function createWorkflowRouter({ prisma }: AppDependencies): Router {
  const router = Router();

  router.get('/:id/history', async (req, res) => {
    res.json({ data: await getTimeline(prisma, parseId(req.params.id), req.user) });
  });

  router.get('/:id/referrals', async (req, res) => {
    res.json({ data: await listReferrals(prisma, parseId(req.params.id), req.user) });
  });

  return router;
}

/** Admin case handling, mounted under /api/admin. */
export function createWorkflowAdminRouter({ prisma }: AppDependencies): Router {
  const router = Router();

  router.post('/issues/:id/status', async (req, res) => {
    const entry = await changeStatus(
      prisma,
      parseId(req.params.id),
      changeStatusBody.parse(req.body),
      currentUser(req),
    );
    res.status(201).json({ data: entry });
  });

  router.post('/issues/:id/updates', async (req, res) => {
    const entry = await postAdminUpdate(
      prisma,
      parseId(req.params.id),
      adminUpdateBody.parse(req.body),
      currentUser(req),
    );
    res.status(201).json({ data: entry });
  });

  router.post('/issues/:id/assignments', async (req, res) => {
    const { organizationId } = createAssignmentBody.parse(req.body);
    const assignment = await createAssignment(
      prisma,
      parseId(req.params.id),
      organizationId,
      currentUser(req),
    );
    res.status(201).json({ data: assignment });
  });

  router.patch('/assignments/:id', async (req, res) => {
    const assignment = await updateAssignment(
      prisma,
      parseId(req.params.id),
      updateAssignmentBody.parse(req.body),
      currentUser(req),
    );
    res.json({ data: assignment });
  });

  router.post('/assignments/:id/responses', async (req, res) => {
    const response = await recordExternalResponse(
      prisma,
      parseId(req.params.id),
      externalResponseBody.parse(req.body),
      currentUser(req),
    );
    res.status(201).json({ data: response });
  });

  return router;
}
