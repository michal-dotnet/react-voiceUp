import { z } from 'zod';
import {
  ContentVisibility,
  ReportStatus,
  ReportTargetType,
  SolutionKind,
} from '../../generated/prisma/enums.js';
import { optionalText, text } from '../../lib/http.js';
import { paginationQuery } from '../../lib/pagination.js';

export const confirmBody = z.object({ note: optionalText(500) }).strict();

/** Guests can only press "this affects me too": no note or any other field is accepted. */
export const guestConfirmBody = z.object({}).strict();

export const commentBody = z.object({ body: text(1, 2000) }).strict();

export const solutionBody = z
  .object({
    /** PERSONAL_EXPERIENCE: "this worked for me". SUGGESTION: an unverified idea. */
    kind: z.enum(SolutionKind),
    body: text(5, 3000),
  })
  .strict();

export const updateSolutionBody = z.object({ body: text(5, 3000) }).strict();

export const reopenRequestBody = z.object({ body: text(10, 2000) }).strict();

export const reportBody = z.object({ reason: text(3, 500) }).strict();

export const visibilityBody = z.object({ moderationStatus: z.enum(ContentVisibility) }).strict();

export const listContentQuery = paginationQuery;

export const adminReportsQuery = paginationQuery.extend({
  status: z.enum(ReportStatus).default('OPEN'),
  targetType: z.enum(ReportTargetType).optional(),
});

export const handleReportBody = z
  .object({
    status: z.enum(['ACTIONED', 'DISMISSED']),
    /** For comments and solutions: also hide the reported content. Issues are rejected separately. */
    hideContent: z.boolean().default(false),
  })
  .strict();
