import { z } from 'zod';
import { ModerationStatus, ResolutionStatus } from '../../generated/prisma/enums.js';
import { optionalText, text, uuidParam } from '../../lib/http.js';
import { paginationQuery } from '../../lib/pagination.js';

const title = text(5, 150);
const description = text(10, 5000);
const area = text(2, 100);
const location = optionalText(200);

export const createIssueBody = z
  .object({ title, description, categoryId: uuidParam, area, location })
  .strict();

/** Authors may edit their issue only while it is pending review. */
export const updateIssueBody = z
  .object({ title, description, categoryId: uuidParam, area, location })
  .partial()
  .strict();

/** Admin redaction of personal details (at approval, or later). */
export const redactIssueBody = z.object({ title, description, area, location }).partial().strict();

export const approveIssueBody = redactIssueBody;

export const rejectIssueBody = z.object({ reason: text(5, 500) }).strict();

export const ISSUE_SORTS = ['newest', 'oldest', 'recentlyUpdated'] as const;

export const listIssuesQuery = paginationQuery.extend({
  categoryId: uuidParam.optional(),
  area: z.string().trim().min(1).max(100).optional(),
  status: z.enum(ResolutionStatus).optional(),
  q: z.string().trim().min(1).max(200).optional(),
  sort: z.enum(ISSUE_SORTS).default('newest'),
});

export const adminListIssuesQuery = listIssuesQuery.extend({
  moderationStatus: z.enum(ModerationStatus).default('PENDING_REVIEW'),
  includeMerged: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
  sort: z.enum(ISSUE_SORTS).default('oldest'),
});

export const similarIssuesQuery = z.object({
  title: text(3, 150),
  description: z.string().trim().max(5000).optional(),
  categoryId: uuidParam,
  area: z.string().trim().max(100).optional(),
});
