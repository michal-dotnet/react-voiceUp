import type { z } from 'zod';
import { AppError, ErrorCodes, errors } from '../../lib/errors.js';
import { isUniqueViolation, type Db, type DbClient } from '../../lib/prisma.js';
import type { AuthUser } from '../../middleware/auth.js';
import { AuditActions, writeAudit } from '../audit/audit.service.js';
import {
  findVisibleIssue,
  findWritableIssue,
  groupFollowerIds,
  issueGroupIds,
} from '../issues/issueAccess.js';
import { notifyUsers } from '../notifications/notifications.service.js';
import { publicUserSelect } from '../users/users.dto.js';
import { canTransition, REQUIRES_SOURCE, TRANSITIONS } from './statusMachine.js';
import type {
  adminUpdateBody,
  changeStatusBody,
  externalResponseBody,
  updateAssignmentBody,
} from './workflow.schemas.js';

const ADMIN_RECORD_LABEL = 'Recorded by a VoiceUp admin.';

/** Serializes concurrent admin actions on the same issue. */
export async function lockIssue(tx: DbClient, issueId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "PublicIssue" WHERE "id" = ${issueId}::uuid FOR UPDATE`;
}

const STATUS_TEXT: Record<string, string> = {
  OPEN: 'open',
  UNDER_REVIEW: 'under review',
  REFERRED: 'referred to an organization',
  IN_PROGRESS: 'in progress',
  RESOLVED: 'resolved',
};

// ---------------------------------------------------------------------------
// Status changes and verified admin updates (the issue timeline)
// ---------------------------------------------------------------------------

/**
 * Moves an issue along the workflow. Rules:
 * - only the transitions in TRANSITIONS are allowed;
 * - REFERRED requires a referral that was actually SENT (with date, method and evidence);
 * - IN_PROGRESS and RESOLVED require a stated source;
 * - every change writes the timeline, the audit log and notifies followers.
 */
export async function changeStatus(
  prisma: Db,
  issueId: string,
  input: z.output<typeof changeStatusBody>,
  admin: AuthUser,
) {
  return prisma.$transaction(async (tx) => {
    await lockIssue(tx, issueId);
    const issue = await findWritableIssue(tx, issueId, admin);
    const from = issue.resolutionStatus;
    const to = input.toStatus;

    if (!canTransition(from, to)) {
      throw new AppError(
        409,
        ErrorCodes.INVALID_TRANSITION,
        `An issue cannot move from ${from} to ${to}.`,
        { from, to, allowed: TRANSITIONS[from] },
      );
    }
    if (REQUIRES_SOURCE.includes(to) && !input.source) {
      throw new AppError(400, ErrorCodes.VALIDATION_ERROR, `Moving to ${to} requires a source.`, [
        { path: 'source', message: 'Required for this status.' },
      ]);
    }
    const group = await issueGroupIds(tx, issue.id);
    if (to === 'REFERRED') {
      const sent = await tx.issueAssignment.count({
        where: { issueId: { in: group }, referralStatus: { in: ['SENT', 'ACKNOWLEDGED'] } },
      });
      if (sent === 0) {
        throw errors.conflict(
          ErrorCodes.INVALID_STATE,
          'REFERRED requires a referral that was marked as sent, with its date and evidence.',
        );
      }
    }

    await tx.publicIssue.update({
      where: { id: issue.id },
      data: {
        resolutionStatus: to,
        ...(to === 'RESOLVED' && { resolvedAt: new Date() }),
        ...(from === 'RESOLVED' && { resolvedAt: null }),
      },
    });
    const entry = await tx.issueStatusHistory.create({
      data: {
        issueId: issue.id,
        fromStatus: from,
        toStatus: to,
        changedById: admin.id,
        note: input.note,
        source: input.source ?? null,
      },
      include: { changedBy: { select: publicUserSelect } },
    });
    await writeAudit(tx, {
      actorId: admin.id,
      action: AuditActions.ISSUE_STATUS_CHANGED,
      entityType: 'PublicIssue',
      entityId: issue.id,
      metadata: { from, to, historyId: entry.id },
    });
    await notifyUsers(
      tx,
      await groupFollowerIds(tx, group),
      {
        type: 'STATUS_CHANGED',
        issueId: issue.id,
        message: `"${issue.title}" is now ${STATUS_TEXT[to] ?? to}.`,
      },
      admin.id,
    );
    return toTimelineEntry(entry, issue.id);
  });
}

/** A verified admin update without a status change (fromStatus = toStatus). */
export async function postAdminUpdate(
  prisma: Db,
  issueId: string,
  input: z.output<typeof adminUpdateBody>,
  admin: AuthUser,
) {
  return prisma.$transaction(async (tx) => {
    await lockIssue(tx, issueId);
    const issue = await findWritableIssue(tx, issueId, admin);
    const entry = await tx.issueStatusHistory.create({
      data: {
        issueId: issue.id,
        fromStatus: issue.resolutionStatus,
        toStatus: issue.resolutionStatus,
        changedById: admin.id,
        note: input.note,
        source: input.source ?? null,
      },
      include: { changedBy: { select: publicUserSelect } },
    });
    await writeAudit(tx, {
      actorId: admin.id,
      action: AuditActions.ISSUE_UPDATE_POSTED,
      entityType: 'PublicIssue',
      entityId: issue.id,
      metadata: { historyId: entry.id },
    });
    const group = await issueGroupIds(tx, issue.id);
    await notifyUsers(
      tx,
      await groupFollowerIds(tx, group),
      { type: 'ISSUE_UPDATE', issueId: issue.id, message: `New update on "${issue.title}".` },
      admin.id,
    );
    return toTimelineEntry(entry, issue.id);
  });
}

interface HistoryRow {
  id: string;
  issueId: string;
  fromStatus: string;
  toStatus: string;
  note: string;
  source: string | null;
  createdAt: Date;
  changedBy: { id: string; name: string };
}

function toTimelineEntry(row: HistoryRow, canonicalId: string) {
  return {
    id: row.id,
    type: row.fromStatus === row.toStatus ? ('ADMIN_UPDATE' as const) : ('STATUS_CHANGE' as const),
    issueId: row.issueId,
    fromMergedIssue: row.issueId !== canonicalId,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    note: row.note,
    source: row.source,
    recordedBy: row.changedBy,
    label: ADMIN_RECORD_LABEL,
    createdAt: row.createdAt,
  };
}

/** The public timeline: status changes, admin updates and merges, oldest first. */
export async function getTimeline(prisma: Db, issueId: string, user?: AuthUser) {
  const issue = await findVisibleIssue(prisma, issueId, user);
  const canonicalId = issue.mergedIntoId ?? issue.id;
  const group = await issueGroupIds(prisma, canonicalId);
  const [history, merges] = await Promise.all([
    prisma.issueStatusHistory.findMany({
      where: { issueId: { in: group } },
      include: { changedBy: { select: publicUserSelect } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.issueMergeHistory.findMany({
      where: { canonicalIssueId: canonicalId },
      include: {
        mergedBy: { select: publicUserSelect },
        sourceIssue: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
  ]);
  const entries = [
    ...history.map((row) => toTimelineEntry(row, canonicalId)),
    ...merges.map((merge) => ({
      id: merge.id,
      type: 'MERGE' as const,
      issueId: canonicalId,
      mergedIssue: merge.sourceIssue,
      reason: merge.reason,
      recordedBy: merge.mergedBy,
      label: ADMIN_RECORD_LABEL,
      createdAt: merge.createdAt,
    })),
  ].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return { canonicalIssueId: canonicalId, entries };
}

// ---------------------------------------------------------------------------
// Referrals to organizations and documented external responses
// ---------------------------------------------------------------------------

export async function createAssignment(
  prisma: Db,
  issueId: string,
  organizationId: string,
  admin: AuthUser,
) {
  return prisma.$transaction(async (tx) => {
    const issue = await findWritableIssue(tx, issueId, admin);
    const organization = await tx.organization.findUnique({ where: { id: organizationId } });
    if (!organization?.isActive) {
      throw errors.badRequest('Unknown or inactive organization.', { field: 'organizationId' });
    }
    try {
      const assignment = await tx.issueAssignment.create({
        data: { issueId: issue.id, organizationId, assignedById: admin.id },
        include: { organization: { select: { id: true, name: true, type: true } } },
      });
      await writeAudit(tx, {
        actorId: admin.id,
        action: AuditActions.ASSIGNMENT_CREATED,
        entityType: 'IssueAssignment',
        entityId: assignment.id,
        metadata: { issueId: issue.id, organizationId },
      });
      return assignment;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppError(
          409,
          ErrorCodes.ALREADY_EXISTS,
          'This issue is already assigned to this organization.',
        );
      }
      throw error;
    }
  });
}

/**
 * Records that a referral was actually sent (PREPARED → SENT) or acknowledged by the
 * organization (SENT → ACKNOWLEDGED). Both require a date and evidence; the database
 * enforces the same rule with CHECK constraints.
 */
export async function updateAssignment(
  prisma: Db,
  assignmentId: string,
  input: z.output<typeof updateAssignmentBody>,
  admin: AuthUser,
) {
  return prisma.$transaction(async (tx) => {
    const assignment = await tx.issueAssignment.findUnique({ where: { id: assignmentId } });
    if (!assignment) throw errors.notFound('Assignment');
    const from = assignment.referralStatus;
    const expectedFrom = input.referralStatus === 'SENT' ? 'PREPARED' : 'SENT';
    if (from !== expectedFrom) {
      throw new AppError(
        409,
        ErrorCodes.INVALID_TRANSITION,
        `A referral cannot move from ${from} to ${input.referralStatus}.`,
        { from, to: input.referralStatus },
      );
    }
    if (
      input.referralStatus === 'ACKNOWLEDGED' &&
      assignment.sentAt &&
      input.ackAt < assignment.sentAt
    ) {
      throw errors.badRequest('The acknowledgement date cannot be before the sent date.', {
        field: 'ackAt',
      });
    }
    const updated = await tx.issueAssignment.update({
      where: { id: assignmentId },
      data: input,
      include: { organization: { select: { id: true, name: true, type: true } } },
    });
    await writeAudit(tx, {
      actorId: admin.id,
      action: AuditActions.ASSIGNMENT_UPDATED,
      entityType: 'IssueAssignment',
      entityId: assignmentId,
      metadata: { from, to: input.referralStatus },
    });
    return updated;
  });
}

export async function recordExternalResponse(
  prisma: Db,
  assignmentId: string,
  input: z.output<typeof externalResponseBody>,
  admin: AuthUser,
) {
  return prisma.$transaction(async (tx) => {
    const assignment = await tx.issueAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        organization: { select: { name: true } },
        issue: { select: { id: true, title: true, mergedIntoId: true } },
      },
    });
    if (!assignment) throw errors.notFound('Assignment');
    if (assignment.referralStatus === 'PREPARED' || !assignment.sentAt) {
      throw errors.conflict(
        ErrorCodes.INVALID_STATE,
        'A response can only be recorded for a referral that was sent.',
      );
    }
    if (input.receivedAt < assignment.sentAt) {
      throw errors.badRequest('The response date cannot be before the referral was sent.', {
        field: 'receivedAt',
      });
    }
    const response = await tx.externalResponse.create({
      data: { ...input, assignmentId, recordedById: admin.id },
    });
    await writeAudit(tx, {
      actorId: admin.id,
      action: AuditActions.EXTERNAL_RESPONSE_RECORDED,
      entityType: 'ExternalResponse',
      entityId: response.id,
      metadata: { assignmentId, issueId: assignment.issueId },
    });
    const canonicalId = assignment.issue.mergedIntoId ?? assignment.issue.id;
    await notifyUsers(
      tx,
      await groupFollowerIds(tx, await issueGroupIds(tx, canonicalId)),
      {
        type: 'EXTERNAL_RESPONSE',
        issueId: canonicalId,
        message: `A response from ${assignment.organization.name} was recorded on "${assignment.issue.title}".`,
      },
      admin.id,
    );
    return response;
  });
}

/**
 * Public view of referrals and responses across the issue group. Evidence notes stay
 * admin-only (they may contain contact details); the public sees that evidence exists.
 */
export async function listReferrals(prisma: Db, issueId: string, user?: AuthUser) {
  const issue = await findVisibleIssue(prisma, issueId, user);
  const canonicalId = issue.mergedIntoId ?? issue.id;
  const group = await issueGroupIds(prisma, canonicalId);
  const isAdmin = user?.role === 'ADMIN';
  const assignments = await prisma.issueAssignment.findMany({
    where: { issueId: { in: group } },
    include: {
      organization: { select: { id: true, name: true, type: true } },
      responses: {
        include: { recordedBy: { select: publicUserSelect } },
        orderBy: { receivedAt: 'asc' },
      },
    },
    orderBy: { createdAt: 'asc' },
  });
  return assignments.map((assignment) => ({
    id: assignment.id,
    issueId: assignment.issueId,
    fromMergedIssue: assignment.issueId !== canonicalId,
    organization: assignment.organization,
    referralStatus: assignment.referralStatus,
    referralLabel:
      assignment.referralStatus === 'PREPARED'
        ? 'Prepared by VoiceUp. Not sent yet.'
        : 'Sending recorded by a VoiceUp admin, with evidence.',
    sentAt: assignment.sentAt,
    sentMethod: assignment.sentMethod,
    ackAt: assignment.ackAt,
    ...(isAdmin && { sentEvidence: assignment.sentEvidence, ackEvidence: assignment.ackEvidence }),
    createdAt: assignment.createdAt,
    responses: assignment.responses.map((response) => ({
      id: response.id,
      receivedAt: response.receivedAt,
      summary: response.summary,
      label: `Response from ${assignment.organization.name}, as recorded by a VoiceUp admin. Not published by the organization itself.`,
      recordedBy: response.recordedBy,
      hasEvidence: true,
      ...(isAdmin && { evidenceNote: response.evidenceNote, evidenceUrl: response.evidenceUrl }),
      createdAt: response.createdAt,
    })),
  }));
}
