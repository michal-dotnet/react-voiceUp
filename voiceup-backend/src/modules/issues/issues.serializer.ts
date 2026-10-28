import type { Prisma } from '../../generated/prisma/client.js';
import type { DbClient } from '../../lib/prisma.js';
import type { AuthUser } from '../../middleware/auth.js';
import { publicUserSelect } from '../users/users.dto.js';

export const issueInclude = {
  category: { select: { id: true, name: true, slug: true } },
  author: { select: publicUserSelect },
} satisfies Prisma.PublicIssueInclude;

export type IssueWithRelations = Prisma.PublicIssueGetPayload<{ include: typeof issueInclude }>;

/**
 * Fixed provenance labels. Status values are records kept by VoiceUp admins; confirmation
 * counts are users' own reports. Neither is presented as an official or verified fact.
 */
export const ISSUE_PROVENANCE = {
  resolutionStatus: 'Recorded by VoiceUp admins. Not an official statement of any organization.',
  confirmations: 'Reported by users. Not independently verified.',
  guestConfirmations: 'Anonymous guests. Unverified; one person may be counted more than once.',
} as const;

export function guestConfirmationLabel(count: number): string {
  return `${count} guest confirmation${count === 1 ? '' : 's'} (unverified)`;
}

interface GroupStats {
  mergedIssueIds: string[];
  confirmers: Set<string>;
  guestConfirmers: Set<string>;
  followers: Set<string>;
}

/**
 * Aggregates user confirmations, guest confirmations and followers across each canonical issue and the issues merged
 * into it. Users are counted once per group even if they confirmed several merged issues.
 */
async function loadGroupStats(
  db: DbClient,
  canonicalIds: string[],
): Promise<Map<string, GroupStats>> {
  const stats = new Map<string, GroupStats>(
    canonicalIds.map((id) => [
      id,
      {
        mergedIssueIds: [],
        confirmers: new Set(),
        guestConfirmers: new Set(),
        followers: new Set(),
      },
    ]),
  );
  if (canonicalIds.length === 0) return stats;

  const merged = await db.publicIssue.findMany({
    where: { mergedIntoId: { in: canonicalIds } },
    select: { id: true, mergedIntoId: true },
    orderBy: { createdAt: 'asc' },
  });
  const groupOf = new Map<string, string>(canonicalIds.map((id) => [id, id]));
  for (const issue of merged) {
    if (!issue.mergedIntoId) continue;
    groupOf.set(issue.id, issue.mergedIntoId);
    stats.get(issue.mergedIntoId)?.mergedIssueIds.push(issue.id);
  }

  const allIds = [...groupOf.keys()];
  const [confirmations, guestConfirmations, follows] = await Promise.all([
    db.issueConfirmation.findMany({
      where: { issueId: { in: allIds } },
      select: { issueId: true, userId: true },
    }),
    db.guestConfirmation.findMany({
      where: { issueId: { in: allIds } },
      select: { issueId: true, guestKeyHash: true },
    }),
    db.issueFollow.findMany({
      where: { issueId: { in: allIds } },
      select: { issueId: true, userId: true },
    }),
  ]);
  for (const row of confirmations) {
    stats.get(groupOf.get(row.issueId) ?? '')?.confirmers.add(row.userId);
  }
  for (const row of guestConfirmations) {
    stats.get(groupOf.get(row.issueId) ?? '')?.guestConfirmers.add(row.guestKeyHash);
  }
  for (const row of follows) {
    stats.get(groupOf.get(row.issueId) ?? '')?.followers.add(row.userId);
  }
  return stats;
}

function toDto(issue: IssueWithRelations, stats: GroupStats | undefined, viewer?: AuthUser) {
  const isAuthor = viewer?.id === issue.authorId;
  const isAdmin = viewer?.role === 'ADMIN';
  const confirmationCount = stats?.confirmers.size ?? 0;
  const guestConfirmationCount = stats?.guestConfirmers.size ?? 0;
  return {
    id: issue.id,
    title: issue.title,
    description: issue.description,
    area: issue.area,
    location: issue.location,
    category: issue.category,
    author: issue.author,
    moderationStatus: issue.moderationStatus,
    ...((isAuthor || isAdmin) && { rejectionReason: issue.rejectionReason }),
    resolutionStatus: issue.resolutionStatus,
    mergedIntoId: issue.mergedIntoId,
    mergedIssueIds: stats?.mergedIssueIds ?? [],
    confirmationCount,
    confirmationLabel: `Reported by ${confirmationCount} user${confirmationCount === 1 ? '' : 's'}`,
    guestConfirmationCount,
    guestConfirmationLabel: guestConfirmationLabel(guestConfirmationCount),
    followerCount: stats?.followers.size ?? 0,
    publishedAt: issue.publishedAt,
    resolvedAt: issue.resolvedAt,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
    provenance: ISSUE_PROVENANCE,
    ...(viewer && {
      viewer: {
        isAuthor,
        hasConfirmed: stats?.confirmers.has(viewer.id) ?? false,
        isFollowing: stats?.followers.has(viewer.id) ?? false,
      },
    }),
  };
}

export type IssueDto = ReturnType<typeof toDto>;

export async function serializeIssues(
  db: DbClient,
  issues: IssueWithRelations[],
  viewer?: AuthUser,
): Promise<IssueDto[]> {
  const canonicalIds = issues.filter((issue) => !issue.mergedIntoId).map((issue) => issue.id);
  const stats = await loadGroupStats(db, canonicalIds);
  return issues.map((issue) => toDto(issue, stats.get(issue.id), viewer));
}

export async function serializeIssue(
  db: DbClient,
  issue: IssueWithRelations,
  viewer?: AuthUser,
): Promise<IssueDto> {
  const [dto] = await serializeIssues(db, [issue], viewer);
  if (!dto) throw new Error('serializeIssues returned no result');
  return dto;
}
