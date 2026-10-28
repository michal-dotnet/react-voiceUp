import type { Prisma } from '../../generated/prisma/client.js';
import type { Db } from '../../lib/prisma.js';
import { publicUserSelect } from '../users/users.dto.js';

/** Published = approved and not merged into another issue. */
const PUBLISHED: Prisma.PublicIssueWhereInput = {
  moderationStatus: 'APPROVED',
  mergedIntoId: null,
};

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2 === 0
      ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
      : sorted[middle];
  return value ?? null;
}

const HOUR_MS = 60 * 60 * 1000;
const round1 = (value: number) => Math.round(value * 10) / 10;

/**
 * Admin dashboard. Every figure is computed from VoiceUp's own records; resolution times
 * use the dates admins recorded (publishedAt → resolvedAt), not official figures.
 */
export async function getDashboard(prisma: Db) {
  const [
    totalPublished,
    resolved,
    pendingModeration,
    openReports,
    byStatus,
    byCategory,
    byArea,
    resolvedIssues,
    recentActivity,
    categories,
  ] = await Promise.all([
    prisma.publicIssue.count({ where: PUBLISHED }),
    prisma.publicIssue.count({ where: { ...PUBLISHED, resolutionStatus: 'RESOLVED' } }),
    prisma.publicIssue.count({ where: { moderationStatus: 'PENDING_REVIEW' } }),
    prisma.contentReport.count({ where: { status: 'OPEN' } }),
    prisma.publicIssue.groupBy({
      by: ['resolutionStatus'],
      where: PUBLISHED,
      _count: { _all: true },
    }),
    prisma.publicIssue.groupBy({ by: ['categoryId'], where: PUBLISHED, _count: { _all: true } }),
    prisma.publicIssue.groupBy({
      by: ['area'],
      where: PUBLISHED,
      _count: { _all: true },
      orderBy: { _count: { area: 'desc' } },
      take: 20,
    }),
    prisma.publicIssue.findMany({
      where: { ...PUBLISHED, resolutionStatus: 'RESOLVED', publishedAt: { not: null } },
      select: { publishedAt: true, resolvedAt: true },
    }),
    prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { actor: { select: publicUserSelect } },
    }),
    prisma.category.findMany({ select: { id: true, name: true } }),
  ]);

  const durationsHours = resolvedIssues
    .filter((issue) => issue.publishedAt && issue.resolvedAt)
    .map(
      (issue) =>
        ((issue.resolvedAt?.getTime() ?? 0) - (issue.publishedAt?.getTime() ?? 0)) / HOUR_MS,
    );
  const average =
    durationsHours.length > 0
      ? durationsHours.reduce((sum, value) => sum + value, 0) / durationsHours.length
      : null;
  const medianHours = median(durationsHours);
  const categoryName = new Map(categories.map((category) => [category.id, category.name]));

  return {
    totals: {
      published: totalPublished,
      open: totalPublished - resolved,
      resolved,
      pendingModeration,
      openReports,
    },
    byStatus: byStatus.map((row) => ({ status: row.resolutionStatus, count: row._count._all })),
    byCategory: byCategory
      .map((row) => ({
        categoryId: row.categoryId,
        name: categoryName.get(row.categoryId) ?? null,
        count: row._count._all,
      }))
      .sort((a, b) => b.count - a.count),
    byArea: byArea.map((row) => ({ area: row.area, count: row._count._all })),
    reportedResolutionTime: {
      label:
        'Reported resolution time, from publication to the resolution recorded by VoiceUp admins.',
      sampleSize: durationsHours.length,
      averageHours: average === null ? null : round1(average),
      medianHours: medianHours === null ? null : round1(medianHours),
    },
    recentActivity: recentActivity.map((log) => ({
      id: log.id,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      actor: log.actor,
      createdAt: log.createdAt,
    })),
  };
}
