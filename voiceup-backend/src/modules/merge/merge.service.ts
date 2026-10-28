import { z } from 'zod';
import { ErrorCodes, errors } from '../../lib/errors.js';
import { optionalText, uuidParam } from '../../lib/http.js';
import type { Db } from '../../lib/prisma.js';
import type { AuthUser } from '../../middleware/auth.js';
import { AuditActions, writeAudit } from '../audit/audit.service.js';
import { groupFollowerIds, issueGroupIds } from '../issues/issueAccess.js';
import { getIssue } from '../issues/issues.service.js';
import { notifyUsers } from '../notifications/notifications.service.js';

export const mergeBody = z
  .object({
    sourceIssueId: uuidParam,
    canonicalIssueId: uuidParam,
    reason: optionalText(500),
  })
  .strict();

/**
 * Merges a duplicate (source) issue into a canonical issue.
 *
 * Nothing is copied, moved or deleted. The source keeps its comments, solutions, uploads,
 * confirmations, follows, referrals and history, with their original authors. The merge
 * only sets `mergedIntoId`, and the canonical issue's reads aggregate across the group.
 * Issues already merged into the source are re-pointed, so merges are never chained.
 *
 * Runs in one transaction with both rows locked in a fixed order, so concurrent merges
 * cannot deadlock or leave a half-merged state.
 */
export async function mergeIssues(prisma: Db, input: z.output<typeof mergeBody>, admin: AuthUser) {
  const { sourceIssueId, canonicalIssueId } = input;
  if (sourceIssueId === canonicalIssueId) {
    throw errors.badRequest('An issue cannot be merged into itself.');
  }

  await prisma.$transaction(async (tx) => {
    const ids = [sourceIssueId, canonicalIssueId].sort();
    await tx.$queryRaw`SELECT "id" FROM "PublicIssue" WHERE "id" IN (${ids[0]}::uuid, ${ids[1]}::uuid) ORDER BY "id" FOR UPDATE`;

    const [source, canonical] = await Promise.all([
      tx.publicIssue.findUnique({ where: { id: sourceIssueId } }),
      tx.publicIssue.findUnique({ where: { id: canonicalIssueId } }),
    ]);
    if (!source) throw errors.notFound('Source issue');
    if (!canonical) throw errors.notFound('Canonical issue');
    for (const issue of [source, canonical]) {
      if (issue.moderationStatus !== 'APPROVED') {
        throw errors.conflict(ErrorCodes.INVALID_STATE, 'Only published issues can be merged.', {
          issueId: issue.id,
        });
      }
      if (issue.mergedIntoId) {
        throw errors.conflict(ErrorCodes.ISSUE_MERGED, 'This issue was already merged.', {
          issueId: issue.id,
          canonicalIssueId: issue.mergedIntoId,
        });
      }
    }

    // Followers of both groups, collected before the merge changes the groups.
    const followers = new Set([
      ...(await groupFollowerIds(tx, await issueGroupIds(tx, source.id))),
      ...(await groupFollowerIds(tx, await issueGroupIds(tx, canonical.id))),
    ]);

    const repointed = await tx.publicIssue.updateMany({
      where: { mergedIntoId: source.id },
      data: { mergedIntoId: canonical.id },
    });
    await tx.publicIssue.update({
      where: { id: source.id },
      data: { mergedIntoId: canonical.id },
    });
    const history = await tx.issueMergeHistory.create({
      data: {
        sourceIssueId: source.id,
        canonicalIssueId: canonical.id,
        mergedById: admin.id,
        reason: input.reason ?? null,
      },
    });
    await writeAudit(tx, {
      actorId: admin.id,
      action: AuditActions.ISSUE_MERGED,
      entityType: 'PublicIssue',
      entityId: source.id,
      metadata: {
        canonicalIssueId: canonical.id,
        mergeHistoryId: history.id,
        repointedIssues: repointed.count,
      },
    });
    await notifyUsers(
      tx,
      followers,
      {
        type: 'ISSUE_MERGED',
        issueId: canonical.id,
        message: `"${source.title}" was merged into "${canonical.title}". Updates continue there.`,
      },
      admin.id,
    );
  });

  return getIssue(prisma, canonicalIssueId, admin);
}
