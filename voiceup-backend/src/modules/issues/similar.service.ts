import type { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Db } from '../../lib/prisma.js';
import { scoreSimilarity } from '../../lib/similarity.js';
import type { similarIssuesQuery } from './issues.schemas.js';

const CANDIDATES_PER_BUCKET = 25;
const CANDIDATE_MAX_AGE_DAYS = 365;
const MIN_SCORE = 0.3;
const MAX_RESULTS = 5;

/**
 * Suggests existing published issues that may describe the same problem, before a user
 * reports a new one. Suggestions only: nothing is merged or blocked automatically.
 * Candidates are bounded (same category, recent, at most 50) and scored in TypeScript.
 */
export async function findSimilarIssues(prisma: Db, query: z.output<typeof similarIssuesQuery>) {
  const since = new Date(Date.now() - CANDIDATE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
  const base: Prisma.PublicIssueWhereInput = {
    categoryId: query.categoryId,
    moderationStatus: 'APPROVED',
    mergedIntoId: null,
    createdAt: { gte: since },
  };
  const select = {
    id: true,
    title: true,
    description: true,
    area: true,
    resolutionStatus: true,
    createdAt: true,
  } as const;

  const sameArea = query.area
    ? await prisma.publicIssue.findMany({
        where: { ...base, area: { equals: query.area, mode: 'insensitive' } },
        select,
        orderBy: { createdAt: 'desc' },
        take: CANDIDATES_PER_BUCKET,
      })
    : [];
  const others = await prisma.publicIssue.findMany({
    where: { ...base, id: { notIn: sameArea.map((issue) => issue.id) } },
    select,
    orderBy: { createdAt: 'desc' },
    take: CANDIDATES_PER_BUCKET,
  });

  return [...sameArea, ...others]
    .map((issue) => ({
      issue,
      ...scoreSimilarity(query, { ...issue, isResolved: issue.resolutionStatus === 'RESOLVED' }),
    }))
    .filter((match) => match.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score || b.issue.createdAt.getTime() - a.issue.createdAt.getTime())
    .slice(0, MAX_RESULTS)
    .map(({ issue, score, reasons }) => ({
      id: issue.id,
      title: issue.title,
      area: issue.area,
      resolutionStatus: issue.resolutionStatus,
      createdAt: issue.createdAt,
      score,
      reasons,
    }));
}
