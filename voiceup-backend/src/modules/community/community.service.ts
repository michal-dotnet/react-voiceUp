import type { z } from 'zod';
import type { ReportTargetType, SolutionKind } from '../../generated/prisma/enums.js';
import { AppError, ErrorCodes, errors } from '../../lib/errors.js';
import { pageMeta, toSkipTake, type Pagination } from '../../lib/pagination.js';
import { isUniqueViolation, type Db, type DbClient } from '../../lib/prisma.js';
import type { AuthUser } from '../../middleware/auth.js';
import { AuditActions, writeAudit } from '../audit/audit.service.js';
import { findVisibleIssue, findWritableIssue, issueGroupIds } from '../issues/issueAccess.js';
import { guestConfirmationLabel } from '../issues/issues.serializer.js';
import { lockIssue } from '../workflow/workflow.service.js';
import { publicUserSelect } from '../users/users.dto.js';
import type {
  adminReportsQuery,
  handleReportBody,
  reopenRequestBody,
  solutionBody,
} from './community.schemas.js';

const alreadyExists = (message: string) => new AppError(409, ErrorCodes.ALREADY_EXISTS, message);

// ---------------------------------------------------------------------------
// Confirmations ("this affects me too") and follows
// ---------------------------------------------------------------------------

async function distinctConfirmers(db: DbClient, groupIds: string[]): Promise<number> {
  const rows = await db.issueConfirmation.findMany({
    where: { issueId: { in: groupIds } },
    select: { userId: true },
    distinct: ['userId'],
  });
  return rows.length;
}

function confirmationResult(confirmed: boolean, count: number) {
  return {
    confirmed,
    confirmationCount: count,
    confirmationLabel: `Reported by ${count} user${count === 1 ? '' : 's'}`,
  };
}

/**
 * One confirmation per user per issue group (the canonical issue and everything merged into
 * it). Enforced here across the group and by a unique index per issue against races.
 * Authors cannot confirm their own issue.
 */
export async function confirmIssue(prisma: Db, issueId: string, user: AuthUser, note?: string) {
  const issue = await findWritableIssue(prisma, issueId, user);
  const group = await issueGroupIds(prisma, issue.id);

  const ownIssue = await prisma.publicIssue.count({
    where: { id: { in: group }, authorId: user.id },
  });
  if (ownIssue > 0) {
    throw errors.conflict(ErrorCodes.INVALID_STATE, 'You cannot confirm an issue you reported.');
  }
  const existing = await prisma.issueConfirmation.count({
    where: { issueId: { in: group }, userId: user.id },
  });
  if (existing > 0) throw alreadyExists('You have already confirmed this issue.');

  try {
    await prisma.issueConfirmation.create({
      data: { issueId: issue.id, userId: user.id, note: note ?? null },
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw alreadyExists('You have already confirmed this issue.');
    throw error;
  }
  return confirmationResult(true, await distinctConfirmers(prisma, group));
}

export async function unconfirmIssue(prisma: Db, issueId: string, user: AuthUser) {
  const issue = await findWritableIssue(prisma, issueId, user);
  const group = await issueGroupIds(prisma, issue.id);
  const { count } = await prisma.issueConfirmation.deleteMany({
    where: { issueId: { in: group }, userId: user.id },
  });
  if (count === 0) throw errors.notFound('Confirmation');
  return confirmationResult(false, await distinctConfirmers(prisma, group));
}

// ---------------------------------------------------------------------------
// Guest (unauthenticated) confirmations. Unverified, counted separately from users.
// ---------------------------------------------------------------------------

export interface GuestIdentity {
  /** HMAC of the guest id from the signed guest token. */
  guestKeyHash: string;
  /** HMAC of the client IP. */
  ipHash: string;
}

async function distinctGuestConfirmers(db: DbClient, groupIds: string[]): Promise<number> {
  const rows = await db.guestConfirmation.findMany({
    where: { issueId: { in: groupIds } },
    select: { guestKeyHash: true },
    distinct: ['guestKeyHash'],
  });
  return rows.length;
}

async function guestConfirmationResult(db: DbClient, groupIds: string[], confirmed: boolean) {
  const [users, guests] = await Promise.all([
    distinctConfirmers(db, groupIds),
    distinctGuestConfirmers(db, groupIds),
  ]);
  return {
    ...confirmationResult(confirmed, users),
    guestConfirmationCount: guests,
    guestConfirmationLabel: guestConfirmationLabel(guests),
  };
}

/**
 * Records a guest's confirmation. One per guest token per issue group, and at most
 * `perIpLimit` guest confirmations per IP on the group. The issue row is locked so concurrent
 * requests cannot exceed the cap. Guests never send free text.
 */
export async function confirmIssueAsGuest(
  prisma: Db,
  issueId: string,
  guest: GuestIdentity,
  perIpLimit: number,
) {
  return prisma.$transaction(async (tx) => {
    // Lock first, so a concurrent merge cannot change the issue between the check and insert.
    await lockIssue(tx, issueId);
    const issue = await findWritableIssue(tx, issueId);
    const group = await issueGroupIds(tx, issue.id);

    const existing = await tx.guestConfirmation.count({
      where: { issueId: { in: group }, guestKeyHash: guest.guestKeyHash },
    });
    if (existing > 0) throw alreadyExists('You have already confirmed this issue.');

    const fromIp = await tx.guestConfirmation.count({
      where: { issueId: { in: group }, ipHash: guest.ipHash },
    });
    if (fromIp >= perIpLimit) {
      throw errors.conflict(
        ErrorCodes.LIMIT_REACHED,
        'Too many guest confirmations from this network. Log in to confirm.',
      );
    }

    try {
      await tx.guestConfirmation.create({
        data: { issueId: issue.id, guestKeyHash: guest.guestKeyHash, ipHash: guest.ipHash },
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw alreadyExists('You have already confirmed this issue.');
      throw error;
    }
    return guestConfirmationResult(tx, group, true);
  });
}

export async function unconfirmIssueAsGuest(prisma: Db, issueId: string, guestKeyHash: string) {
  const issue = await findWritableIssue(prisma, issueId);
  const group = await issueGroupIds(prisma, issue.id);
  const { count } = await prisma.guestConfirmation.deleteMany({
    where: { issueId: { in: group }, guestKeyHash },
  });
  if (count === 0) throw errors.notFound('Confirmation');
  return guestConfirmationResult(prisma, group, false);
}

export async function followIssue(prisma: Db, issueId: string, user: AuthUser) {
  const issue = await findWritableIssue(prisma, issueId, user);
  const group = await issueGroupIds(prisma, issue.id);
  const existing = await prisma.issueFollow.count({
    where: { issueId: { in: group }, userId: user.id },
  });
  if (existing > 0) throw alreadyExists('You already follow this issue.');
  try {
    await prisma.issueFollow.create({ data: { issueId: issue.id, userId: user.id } });
  } catch (error) {
    if (isUniqueViolation(error)) throw alreadyExists('You already follow this issue.');
    throw error;
  }
  return { following: true };
}

export async function unfollowIssue(prisma: Db, issueId: string, user: AuthUser) {
  const issue = await findWritableIssue(prisma, issueId, user);
  const group = await issueGroupIds(prisma, issue.id);
  const { count } = await prisma.issueFollow.deleteMany({
    where: { issueId: { in: group }, userId: user.id },
  });
  if (count === 0) throw errors.notFound('Follow');
  return { following: false };
}

// ---------------------------------------------------------------------------
// Comments, reopen requests and proposed solutions
// ---------------------------------------------------------------------------

/** For reads, a merged issue shows its canonical issue's group. */
async function readableGroup(prisma: Db, issueId: string, user?: AuthUser) {
  const issue = await findVisibleIssue(prisma, issueId, user);
  const canonicalId = issue.mergedIntoId ?? issue.id;
  return { canonicalId, group: await issueGroupIds(prisma, canonicalId) };
}

const SOLUTION_LABELS: Record<SolutionKind, string> = {
  PERSONAL_EXPERIENCE: 'Personal experience shared by a user. Not verified.',
  SUGGESTION: 'Unverified suggestion by a user.',
};

const contentSelect = {
  id: true,
  issueId: true,
  body: true,
  moderationStatus: true,
  createdAt: true,
  updatedAt: true,
  author: { select: publicUserSelect },
} as const;

export async function listComments(
  prisma: Db,
  issueId: string,
  pagination: Pagination,
  user?: AuthUser,
) {
  const { canonicalId, group } = await readableGroup(prisma, issueId, user);
  const isAdmin = user?.role === 'ADMIN';
  const where = {
    issueId: { in: group },
    ...(!isAdmin && { moderationStatus: 'VISIBLE' as const }),
  };
  const [rows, total] = await Promise.all([
    prisma.issueComment.findMany({
      where,
      select: { ...contentSelect, kind: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      ...toSkipTake(pagination),
    }),
    prisma.issueComment.count({ where }),
  ]);
  return {
    data: rows.map(({ moderationStatus, ...row }) => ({
      ...row,
      fromMergedIssue: row.issueId !== canonicalId,
      label: row.kind === 'REOPEN_REQUEST' ? 'Reopen request by a user' : 'User comment',
      ...(isAdmin && { moderationStatus }),
    })),
    meta: pageMeta(pagination, total),
  };
}

export async function listSolutions(
  prisma: Db,
  issueId: string,
  pagination: Pagination,
  user?: AuthUser,
) {
  const { canonicalId, group } = await readableGroup(prisma, issueId, user);
  const isAdmin = user?.role === 'ADMIN';
  const where = {
    issueId: { in: group },
    ...(!isAdmin && { moderationStatus: 'VISIBLE' as const }),
  };
  const [rows, total] = await Promise.all([
    prisma.proposedSolution.findMany({
      where,
      select: { ...contentSelect, kind: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      ...toSkipTake(pagination),
    }),
    prisma.proposedSolution.count({ where }),
  ]);
  return {
    data: rows.map(({ moderationStatus, ...row }) => ({
      ...row,
      fromMergedIssue: row.issueId !== canonicalId,
      label: SOLUTION_LABELS[row.kind],
      ...(isAdmin && { moderationStatus }),
    })),
    meta: pageMeta(pagination, total),
  };
}

export async function addComment(prisma: Db, issueId: string, body: string, user: AuthUser) {
  const issue = await findWritableIssue(prisma, issueId, user);
  const comment = await prisma.issueComment.create({
    data: { issueId: issue.id, authorId: user.id, body, kind: 'COMMENT' },
    select: { ...contentSelect, kind: true },
  });
  return { ...comment, label: 'User comment' };
}

export async function addSolution(
  prisma: Db,
  issueId: string,
  input: z.output<typeof solutionBody>,
  user: AuthUser,
) {
  const issue = await findWritableIssue(prisma, issueId, user);
  const solution = await prisma.proposedSolution.create({
    data: { issueId: issue.id, authorId: user.id, kind: input.kind, body: input.body },
    select: { ...contentSelect, kind: true },
  });
  return { ...solution, label: SOLUTION_LABELS[solution.kind] };
}

type ContentModel = 'comment' | 'solution';

/** Loads a comment/solution that belongs to the issue's group and is still visible. */
async function findGroupContent(
  prisma: Db,
  model: ContentModel,
  issueId: string,
  contentId: string,
  user?: AuthUser,
) {
  const { group } = await readableGroup(prisma, issueId, user);
  const select = { id: true, issueId: true, authorId: true, moderationStatus: true } as const;
  const content =
    model === 'comment'
      ? await prisma.issueComment.findUnique({ where: { id: contentId }, select })
      : await prisma.proposedSolution.findUnique({ where: { id: contentId }, select });
  const label = model === 'comment' ? 'Comment' : 'Solution';
  if (!content || !group.includes(content.issueId) || content.moderationStatus === 'HIDDEN') {
    throw errors.notFound(label);
  }
  return content;
}

async function findOwnContent(
  prisma: Db,
  model: ContentModel,
  issueId: string,
  contentId: string,
  user: AuthUser,
) {
  const content = await findGroupContent(prisma, model, issueId, contentId, user);
  if (content.authorId !== user.id) throw errors.forbidden('You can only change your own content.');
  return content;
}

export async function editOwnContent(
  prisma: Db,
  model: ContentModel,
  issueId: string,
  contentId: string,
  body: string,
  user: AuthUser,
) {
  await findOwnContent(prisma, model, issueId, contentId, user);
  const select = { ...contentSelect, kind: true };
  return model === 'comment'
    ? prisma.issueComment.update({ where: { id: contentId }, data: { body }, select })
    : prisma.proposedSolution.update({ where: { id: contentId }, data: { body }, select });
}

/** "Deleting" your own content hides it. Nothing is removed, so history is preserved. */
export async function hideOwnContent(
  prisma: Db,
  model: ContentModel,
  issueId: string,
  contentId: string,
  user: AuthUser,
): Promise<void> {
  await findOwnContent(prisma, model, issueId, contentId, user);
  const data = { moderationStatus: 'HIDDEN' as const };
  if (model === 'comment') await prisma.issueComment.update({ where: { id: contentId }, data });
  else await prisma.proposedSolution.update({ where: { id: contentId }, data });
}

/** Admin moderation: hide or restore a comment or solution. Audit-logged. */
export async function setContentVisibility(
  prisma: Db,
  model: ContentModel,
  contentId: string,
  moderationStatus: 'VISIBLE' | 'HIDDEN',
  admin: AuthUser,
) {
  return prisma.$transaction(async (tx) => {
    const select = { ...contentSelect, kind: true };
    const existing =
      model === 'comment'
        ? await tx.issueComment.findUnique({ where: { id: contentId }, select })
        : await tx.proposedSolution.findUnique({ where: { id: contentId }, select });
    if (!existing) throw errors.notFound(model === 'comment' ? 'Comment' : 'Solution');
    const updated =
      model === 'comment'
        ? await tx.issueComment.update({
            where: { id: contentId },
            data: { moderationStatus },
            select,
          })
        : await tx.proposedSolution.update({
            where: { id: contentId },
            data: { moderationStatus },
            select,
          });
    if (existing.moderationStatus !== moderationStatus) {
      await writeAudit(tx, {
        actorId: admin.id,
        action: AuditActions.CONTENT_VISIBILITY_CHANGED,
        entityType: model === 'comment' ? 'IssueComment' : 'ProposedSolution',
        entityId: contentId,
        metadata: { from: existing.moderationStatus, to: moderationStatus },
      });
    }
    return updated;
  });
}

/**
 * Appeal path for a closed issue: its author or a user who confirmed it can ask admins to
 * reopen it. The request is a comment of kind REOPEN_REQUEST; an admin decides by changing
 * the status. One pending request per user per resolution.
 */
export async function requestReopen(
  prisma: Db,
  issueId: string,
  input: z.output<typeof reopenRequestBody>,
  user: AuthUser,
) {
  const issue = await findWritableIssue(prisma, issueId, user);
  if (issue.resolutionStatus !== 'RESOLVED') {
    throw errors.conflict(ErrorCodes.INVALID_STATE, 'Only resolved issues can be reopened.');
  }
  const group = await issueGroupIds(prisma, issue.id);
  const [isAuthor, hasConfirmed] = await Promise.all([
    prisma.publicIssue.count({ where: { id: { in: group }, authorId: user.id } }),
    prisma.issueConfirmation.count({ where: { issueId: { in: group }, userId: user.id } }),
  ]);
  if (isAuthor === 0 && hasConfirmed === 0) {
    throw errors.forbidden(
      'Only the reporter or users who confirmed this issue can ask to reopen it.',
    );
  }
  const pending = await prisma.issueComment.count({
    where: {
      issueId: issue.id,
      authorId: user.id,
      kind: 'REOPEN_REQUEST',
      createdAt: { gte: issue.resolvedAt ?? new Date(0) },
    },
  });
  if (pending > 0) throw alreadyExists('You have already asked to reopen this issue.');

  const request = await prisma.issueComment.create({
    data: { issueId: issue.id, authorId: user.id, body: input.body, kind: 'REOPEN_REQUEST' },
    select: { ...contentSelect, kind: true },
  });
  return { ...request, label: 'Reopen request by a user' };
}

/** Reopen requests made since each issue's latest resolution, for issues still resolved. */
export async function listPendingReopenRequests(prisma: Db, pagination: Pagination) {
  const resolved = await prisma.publicIssue.findMany({
    where: { resolutionStatus: 'RESOLVED', mergedIntoId: null, moderationStatus: 'APPROVED' },
    select: { id: true, resolvedAt: true },
  });
  const where = {
    kind: 'REOPEN_REQUEST' as const,
    OR: resolved.map((issue) => ({
      issueId: issue.id,
      createdAt: { gte: issue.resolvedAt ?? new Date(0) },
    })),
  };
  if (resolved.length === 0) return { data: [], meta: pageMeta(pagination, 0) };
  const [rows, total] = await Promise.all([
    prisma.issueComment.findMany({
      where,
      select: { ...contentSelect, issue: { select: { id: true, title: true, resolvedAt: true } } },
      orderBy: { createdAt: 'asc' },
      ...toSkipTake(pagination),
    }),
    prisma.issueComment.count({ where }),
  ]);
  return { data: rows, meta: pageMeta(pagination, total) };
}

// ---------------------------------------------------------------------------
// Reports of inappropriate content
// ---------------------------------------------------------------------------

export async function reportContent(
  prisma: Db,
  targetType: ReportTargetType,
  issueId: string,
  contentId: string | undefined,
  reason: string,
  user: AuthUser,
) {
  let targetId: string;
  if (targetType === 'ISSUE') {
    const issue = await findVisibleIssue(prisma, issueId, user);
    if (issue.moderationStatus !== 'APPROVED') throw errors.notFound('Issue');
    targetId = issue.id;
  } else {
    if (!contentId) throw errors.notFound('Content');
    const model = targetType === 'COMMENT' ? 'comment' : 'solution';
    targetId = (await findGroupContent(prisma, model, issueId, contentId, user)).id;
  }
  try {
    const report = await prisma.contentReport.create({
      data: { reporterId: user.id, targetType, targetId, reason },
      select: {
        id: true,
        targetType: true,
        targetId: true,
        reason: true,
        status: true,
        createdAt: true,
      },
    });
    return report;
  } catch (error) {
    if (isUniqueViolation(error)) throw alreadyExists('You have already reported this content.');
    throw error;
  }
}

async function targetPreviews(
  prisma: Db,
  reports: { targetType: ReportTargetType; targetId: string }[],
) {
  const ids = (type: ReportTargetType) =>
    reports.filter((report) => report.targetType === type).map((report) => report.targetId);
  const [issues, comments, solutions] = await Promise.all([
    prisma.publicIssue.findMany({
      where: { id: { in: ids('ISSUE') } },
      select: { id: true, title: true, moderationStatus: true },
    }),
    prisma.issueComment.findMany({
      where: { id: { in: ids('COMMENT') } },
      select: { id: true, issueId: true, body: true, moderationStatus: true },
    }),
    prisma.proposedSolution.findMany({
      where: { id: { in: ids('SOLUTION') } },
      select: { id: true, issueId: true, body: true, moderationStatus: true },
    }),
  ]);
  const previews = new Map<string, unknown>();
  for (const issue of issues) previews.set(issue.id, issue);
  for (const comment of comments) previews.set(comment.id, comment);
  for (const solution of solutions) previews.set(solution.id, solution);
  return previews;
}

export async function listReports(prisma: Db, query: z.output<typeof adminReportsQuery>) {
  const where = { status: query.status, ...(query.targetType && { targetType: query.targetType }) };
  const [reports, total] = await Promise.all([
    prisma.contentReport.findMany({
      where,
      include: { reporter: { select: publicUserSelect }, handledBy: { select: publicUserSelect } },
      orderBy: { createdAt: 'asc' },
      ...toSkipTake(query),
    }),
    prisma.contentReport.count({ where }),
  ]);
  const previews = await targetPreviews(prisma, reports);
  return {
    data: reports.map((report) => ({ ...report, target: previews.get(report.targetId) ?? null })),
    meta: pageMeta(query, total),
  };
}

/**
 * Closes a report and every other open report about the same content. Optionally hides a
 * reported comment or solution in the same transaction. Audit-logged.
 */
export async function handleReport(
  prisma: Db,
  reportId: string,
  input: z.output<typeof handleReportBody>,
  admin: AuthUser,
) {
  return prisma.$transaction(async (tx) => {
    const report = await tx.contentReport.findUnique({ where: { id: reportId } });
    if (!report) throw errors.notFound('Report');
    if (report.status !== 'OPEN') {
      throw errors.conflict(ErrorCodes.INVALID_STATE, 'This report was already handled.');
    }
    if (input.hideContent && report.targetType === 'ISSUE') {
      throw errors.badRequest('Issues are taken down with the reject action, not hideContent.');
    }

    let hidden = false;
    if (input.hideContent) {
      const data = { moderationStatus: 'HIDDEN' as const };
      const where = { id: report.targetId };
      const result =
        report.targetType === 'COMMENT'
          ? await tx.issueComment.updateMany({ where, data })
          : await tx.proposedSolution.updateMany({ where, data });
      hidden = result.count > 0;
    }

    const handledAt = new Date();
    const closed = await tx.contentReport.updateMany({
      where: { targetType: report.targetType, targetId: report.targetId, status: 'OPEN' },
      data: { status: input.status, handledById: admin.id, handledAt },
    });
    await writeAudit(tx, {
      actorId: admin.id,
      action: AuditActions.REPORT_HANDLED,
      entityType: 'ContentReport',
      entityId: report.id,
      metadata: {
        status: input.status,
        targetType: report.targetType,
        targetId: report.targetId,
        contentHidden: hidden,
        reportsClosed: closed.count,
      },
    });
    return {
      ...report,
      status: input.status,
      handledById: admin.id,
      handledAt,
      contentHidden: hidden,
    };
  });
}
