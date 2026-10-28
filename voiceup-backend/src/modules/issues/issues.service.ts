import type { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client.js';
import { ErrorCodes, errors } from '../../lib/errors.js';
import { pageMeta, toSkipTake } from '../../lib/pagination.js';
import type { Db } from '../../lib/prisma.js';
import type { AuthUser } from '../../middleware/auth.js';
import { AuditActions, writeAudit } from '../audit/audit.service.js';
import { notifyUsers } from '../notifications/notifications.service.js';
import { findVisibleIssue } from './issueAccess.js';
import type {
  adminListIssuesQuery,
  approveIssueBody,
  createIssueBody,
  listIssuesQuery,
  redactIssueBody,
  rejectIssueBody,
  updateIssueBody,
} from './issues.schemas.js';
import { issueInclude, serializeIssue, serializeIssues } from './issues.serializer.js';

type ListQuery = z.output<typeof listIssuesQuery>;

const ORDER_BY: Record<ListQuery['sort'], Prisma.PublicIssueOrderByWithRelationInput[]> = {
  newest: [{ createdAt: 'desc' }, { id: 'asc' }],
  oldest: [{ createdAt: 'asc' }, { id: 'asc' }],
  recentlyUpdated: [{ updatedAt: 'desc' }, { id: 'asc' }],
};

/** Every search term must appear in the title or the description (case-insensitive). */
function searchFilter(q: string | undefined): Prisma.PublicIssueWhereInput {
  if (!q) return {};
  const terms = q.split(/\s+/).filter(Boolean).slice(0, 5);
  return {
    AND: terms.map((term) => ({
      OR: [
        { title: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
      ],
    })),
  };
}

function filters(query: ListQuery): Prisma.PublicIssueWhereInput {
  return {
    ...(query.categoryId && { categoryId: query.categoryId }),
    ...(query.area && { area: { equals: query.area, mode: 'insensitive' } }),
    ...(query.status && { resolutionStatus: query.status }),
    ...searchFilter(query.q),
  };
}

async function listWhere(
  prisma: Db,
  where: Prisma.PublicIssueWhereInput,
  query: ListQuery,
  viewer?: AuthUser,
) {
  const [issues, total] = await Promise.all([
    prisma.publicIssue.findMany({
      where,
      include: issueInclude,
      orderBy: ORDER_BY[query.sort],
      ...toSkipTake(query),
    }),
    prisma.publicIssue.count({ where }),
  ]);
  return { data: await serializeIssues(prisma, issues, viewer), meta: pageMeta(query, total) };
}

/** Public list: published issues only; merged issues are represented by their canonical issue. */
export function listPublicIssues(prisma: Db, query: ListQuery, viewer?: AuthUser) {
  return listWhere(
    prisma,
    { moderationStatus: 'APPROVED', mergedIntoId: null, ...filters(query) },
    query,
    viewer,
  );
}

/** The current user's own issues, in every moderation state. */
export function listOwnIssues(prisma: Db, query: ListQuery, viewer: AuthUser) {
  return listWhere(prisma, { authorId: viewer.id, ...filters(query) }, query, viewer);
}

/** Admin queue. Defaults to issues pending review, oldest first. */
export function listIssuesForAdmin(
  prisma: Db,
  query: z.output<typeof adminListIssuesQuery>,
  viewer: AuthUser,
) {
  return listWhere(
    prisma,
    {
      moderationStatus: query.moderationStatus,
      ...(!query.includeMerged && { mergedIntoId: null }),
      ...filters(query),
    },
    query,
    viewer,
  );
}

export async function getIssue(prisma: Db, id: string, viewer?: AuthUser) {
  const visible = await findVisibleIssue(prisma, id, viewer);
  const issue = await prisma.publicIssue.findUniqueOrThrow({
    where: { id: visible.id },
    include: issueInclude,
  });
  return serializeIssue(prisma, issue, viewer);
}

async function requireActiveCategory(prisma: Db, categoryId: string): Promise<void> {
  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category?.isActive) {
    throw errors.badRequest('Unknown or inactive category.', { field: 'categoryId' });
  }
}

/**
 * New issues always start as PENDING_REVIEW / OPEN, whatever the request body says.
 * The author automatically follows their own issue, so they receive its notifications.
 */
export async function createIssue(
  prisma: Db,
  input: z.output<typeof createIssueBody>,
  author: AuthUser,
) {
  await requireActiveCategory(prisma, input.categoryId);
  const issue = await prisma.publicIssue.create({
    data: {
      ...input,
      authorId: author.id,
      moderationStatus: 'PENDING_REVIEW',
      resolutionStatus: 'OPEN',
      follows: { create: { userId: author.id } },
    },
    include: issueInclude,
  });
  return serializeIssue(prisma, issue, author);
}

async function findOwnPendingIssue(prisma: Db, id: string, user: AuthUser) {
  const issue = await findVisibleIssue(prisma, id, user);
  if (issue.authorId !== user.id) throw errors.forbidden('You can only change your own issues.');
  if (issue.moderationStatus !== 'PENDING_REVIEW') {
    throw errors.conflict(
      ErrorCodes.INVALID_STATE,
      'Issues can only be edited or deleted while they are pending review.',
    );
  }
  return issue;
}

export async function updateOwnIssue(
  prisma: Db,
  id: string,
  input: z.output<typeof updateIssueBody>,
  user: AuthUser,
) {
  await findOwnPendingIssue(prisma, id, user);
  if (input.categoryId) await requireActiveCategory(prisma, input.categoryId);
  const issue = await prisma.publicIssue.update({
    where: { id },
    data: input,
    include: issueInclude,
  });
  return serializeIssue(prisma, issue, user);
}

/**
 * A pending issue was never public, so its author may delete it. Its images are stored in
 * the database and are deleted with it (ON DELETE CASCADE).
 */
export async function deleteOwnIssue(prisma: Db, id: string, user: AuthUser): Promise<void> {
  await findOwnPendingIssue(prisma, id, user);
  await prisma.publicIssue.delete({ where: { id } });
}

type RedactInput = z.output<typeof redactIssueBody>;

/**
 * Applies admin redactions and returns the original values of the changed fields, which are
 * kept in the audit log (admin-only) so nothing is lost.
 */
function redactionDiff(
  issue: { title: string; description: string; area: string; location: string | null },
  input: RedactInput,
) {
  const original: Record<string, string | null> = {};
  const data: RedactInput = {};
  for (const field of ['title', 'description', 'area', 'location'] as const) {
    const value = input[field];
    if (value !== undefined && value !== issue[field]) {
      original[field] = issue[field];
      data[field] = value;
    }
  }
  return { data, original, changed: Object.keys(original) };
}

export async function approveIssue(
  prisma: Db,
  id: string,
  input: z.output<typeof approveIssueBody>,
  admin: AuthUser,
) {
  const issue = await prisma.$transaction(async (tx) => {
    const current = await tx.publicIssue.findUnique({ where: { id } });
    if (!current) throw errors.notFound('Issue');
    if (current.moderationStatus === 'APPROVED') {
      throw errors.conflict(ErrorCodes.INVALID_STATE, 'This issue is already approved.');
    }
    const { data, original, changed } = redactionDiff(current, input);
    const updated = await tx.publicIssue.update({
      where: { id },
      data: {
        ...data,
        moderationStatus: 'APPROVED',
        rejectionReason: null,
        publishedAt: current.publishedAt ?? new Date(),
      },
      include: issueInclude,
    });
    await writeAudit(tx, {
      actorId: admin.id,
      action: AuditActions.ISSUE_APPROVED,
      entityType: 'PublicIssue',
      entityId: id,
      metadata: { from: current.moderationStatus, redactedFields: changed, original },
    });
    await notifyUsers(tx, [current.authorId], {
      type: 'ISSUE_APPROVED',
      issueId: id,
      message: `Your issue "${updated.title}" was approved and is now public.`,
    });
    return updated;
  });
  return serializeIssue(prisma, issue, admin);
}

/** Rejects a pending issue, or takes down a published one, with a reason shown to the author. */
export async function rejectIssue(
  prisma: Db,
  id: string,
  input: z.output<typeof rejectIssueBody>,
  admin: AuthUser,
) {
  const issue = await prisma.$transaction(async (tx) => {
    const current = await tx.publicIssue.findUnique({ where: { id } });
    if (!current) throw errors.notFound('Issue');
    if (current.moderationStatus === 'REJECTED') {
      throw errors.conflict(ErrorCodes.INVALID_STATE, 'This issue is already rejected.');
    }
    if (current.mergedIntoId) {
      throw errors.conflict(ErrorCodes.ISSUE_MERGED, 'Merged issues cannot be rejected.');
    }
    const mergedCount = await tx.publicIssue.count({ where: { mergedIntoId: id } });
    if (mergedCount > 0) {
      throw errors.conflict(
        ErrorCodes.INVALID_STATE,
        'Other issues were merged into this issue, so it cannot be rejected.',
      );
    }
    const updated = await tx.publicIssue.update({
      where: { id },
      data: { moderationStatus: 'REJECTED', rejectionReason: input.reason },
      include: issueInclude,
    });
    await writeAudit(tx, {
      actorId: admin.id,
      action: AuditActions.ISSUE_REJECTED,
      entityType: 'PublicIssue',
      entityId: id,
      metadata: { from: current.moderationStatus, reason: input.reason },
    });
    await notifyUsers(tx, [current.authorId], {
      type: 'ISSUE_REJECTED',
      issueId: id,
      message: `Your issue "${current.title}" was not published. Reason: ${input.reason}`,
    });
    return updated;
  });
  return serializeIssue(prisma, issue, admin);
}

/** Admin redaction of a published (or pending) issue, e.g. removing personal details. */
export async function redactIssue(prisma: Db, id: string, input: RedactInput, admin: AuthUser) {
  const issue = await prisma.$transaction(async (tx) => {
    const current = await tx.publicIssue.findUnique({ where: { id } });
    if (!current) throw errors.notFound('Issue');
    const { data, original, changed } = redactionDiff(current, input);
    if (changed.length === 0) {
      return tx.publicIssue.findUniqueOrThrow({ where: { id }, include: issueInclude });
    }
    const updated = await tx.publicIssue.update({ where: { id }, data, include: issueInclude });
    await writeAudit(tx, {
      actorId: admin.id,
      action: AuditActions.ISSUE_REDACTED,
      entityType: 'PublicIssue',
      entityId: id,
      metadata: { redactedFields: changed, original },
    });
    return updated;
  });
  return serializeIssue(prisma, issue, admin);
}
