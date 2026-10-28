import type { PublicIssue } from '../../generated/prisma/client.js';
import { AppError, ErrorCodes, errors } from '../../lib/errors.js';
import type { DbClient } from '../../lib/prisma.js';
import type { AuthUser } from '../../middleware/auth.js';

/**
 * Who can see an issue:
 * - APPROVED issues are public (merged ones only as a pointer to their canonical issue).
 * - PENDING_REVIEW and REJECTED issues are visible to their author and to admins only.
 */
export function canViewIssue(
  issue: Pick<PublicIssue, 'moderationStatus' | 'authorId'>,
  user?: AuthUser,
): boolean {
  if (issue.moderationStatus === 'APPROVED') return true;
  if (!user) return false;
  return user.role === 'ADMIN' || user.id === issue.authorId;
}

/** Loads an issue the user may see. Invisible issues are reported as 404, never 403. */
export async function findVisibleIssue(
  db: DbClient,
  id: string,
  user?: AuthUser,
): Promise<PublicIssue> {
  const issue = await db.publicIssue.findUnique({ where: { id } });
  if (!issue || !canViewIssue(issue, user)) throw errors.notFound('Issue');
  return issue;
}

export function mergedError(issue: Pick<PublicIssue, 'id' | 'mergedIntoId'>): AppError {
  return new AppError(
    409,
    ErrorCodes.ISSUE_MERGED,
    'This issue was merged into another issue. Use the canonical issue instead.',
    { canonicalIssueId: issue.mergedIntoId },
  );
}

/**
 * Loads a published, canonical issue for a community or admin write (confirm, follow,
 * comment, assign, change status...). Merged issues are read-only: 409 ISSUE_MERGED.
 */
export async function findWritableIssue(
  db: DbClient,
  id: string,
  user?: AuthUser,
): Promise<PublicIssue> {
  const issue = await findVisibleIssue(db, id, user);
  if (issue.mergedIntoId) throw mergedError(issue);
  if (issue.moderationStatus !== 'APPROVED') {
    throw errors.conflict(ErrorCodes.INVALID_STATE, 'This issue has not been published.');
  }
  return issue;
}

/**
 * The ids whose data is shown together on a canonical issue: the issue itself plus every
 * issue merged into it. Merges always point at a canonical issue, so one level is enough.
 */
export async function issueGroupIds(db: DbClient, canonicalId: string): Promise<string[]> {
  const merged = await db.publicIssue.findMany({
    where: { mergedIntoId: canonicalId },
    select: { id: true },
  });
  return [canonicalId, ...merged.map((issue) => issue.id)];
}

/** Every distinct user who follows any issue in the group. */
export async function groupFollowerIds(db: DbClient, groupIds: string[]): Promise<string[]> {
  const follows = await db.issueFollow.findMany({
    where: { issueId: { in: groupIds } },
    select: { userId: true },
    distinct: ['userId'],
  });
  return follows.map((follow) => follow.userId);
}
