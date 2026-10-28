import { Router } from 'express';
import type { AppDependencies } from '../../deps.js';
import { errors } from '../../lib/errors.js';
import { parseId, queryBoolean } from '../../lib/http.js';
import { pageMeta, paginationQuery, toSkipTake } from '../../lib/pagination.js';
import { currentUser, requireAuth } from '../../middleware/auth.js';

export const listNotificationsQuery = paginationQuery.extend({ unreadOnly: queryBoolean });

/** In-app notifications. Users only ever see their own. */
export function createNotificationsRouter({ prisma }: AppDependencies): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/', async (req, res) => {
    const query = listNotificationsQuery.parse(req.query);
    const userId = currentUser(req).id;
    const where = { userId, ...(query.unreadOnly && { readAt: null }) };
    const [notifications, total, unread] = await Promise.all([
      prisma.notification.findMany({
        where,
        select: {
          id: true,
          type: true,
          issueId: true,
          message: true,
          readAt: true,
          createdAt: true,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        ...toSkipTake(query),
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    res.json({ data: notifications, meta: { ...pageMeta(query, total), unreadCount: unread } });
  });

  router.patch('/:id/read', async (req, res) => {
    const id = parseId(req.params.id);
    const userId = currentUser(req).id;
    const result = await prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    if (result.count === 0) {
      const exists = await prisma.notification.count({ where: { id, userId } });
      if (exists === 0) throw errors.notFound('Notification');
    }
    res.status(204).end();
  });

  router.post('/read-all', async (req, res) => {
    const result = await prisma.notification.updateMany({
      where: { userId: currentUser(req).id, readAt: null },
      data: { readAt: new Date() },
    });
    res.json({ data: { updated: result.count } });
  });

  return router;
}
