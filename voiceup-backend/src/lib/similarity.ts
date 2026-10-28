/**
 * Deterministic text similarity for duplicate suggestions. No AI, no database extensions.
 * Works for Hebrew and English: tokens are Unicode letters/digits, and a single Hebrew
 * prefix letter (ה, ו, ב, ל, מ, ש, כ) is ignored when comparing words.
 */

const STOP_WORDS = new Set([
  // English
  'the',
  'and',
  'for',
  'with',
  'from',
  'this',
  'that',
  'are',
  'was',
  'not',
  'has',
  'have',
  'there',
  'near',
  'very',
  'all',
  'our',
  'its',
  'into',
  'out',
  // Hebrew
  'של',
  'על',
  'את',
  'עם',
  'זה',
  'זו',
  'יש',
  'אין',
  'לא',
  'גם',
  'כל',
  'אבל',
  'או',
  'כי',
  'אם',
  'הוא',
  'היא',
  'הם',
  'הן',
  'מאוד',
  'ליד',
  'אצל',
  'כבר',
  'עוד',
  'רק',
]);

const HEBREW_PREFIXES = new Set(['ה', 'ו', 'ב', 'ל', 'מ', 'ש', 'כ']);

export function tokenize(value: string): Set<string> {
  const tokens = value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return new Set(tokens.filter((token) => token.length >= 2 && !STOP_WORDS.has(token)));
}

function stripPrefix(token: string): string {
  const first = token[0];
  return token.length >= 4 && first !== undefined && HEBREW_PREFIXES.has(first)
    ? token.slice(1)
    : token;
}

function sameWord(a: string, b: string): boolean {
  return (
    a === b || stripPrefix(a) === b || a === stripPrefix(b) || stripPrefix(a) === stripPrefix(b)
  );
}

/** Share of the smaller token set that also appears in the other set (0..1). */
export function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  const largeTokens = [...large];
  let matches = 0;
  for (const token of small) {
    if (largeTokens.some((other) => sameWord(token, other))) matches += 1;
  }
  return matches / small.size;
}

export interface SimilarityInput {
  title: string;
  description?: string;
  area?: string;
}

export interface SimilarityCandidate {
  title: string;
  description: string;
  area: string;
  isResolved: boolean;
}

export interface SimilarityScore {
  score: number;
  reasons: string[];
}

export const SIMILARITY_WEIGHTS = { title: 0.5, keywords: 0.2, area: 0.2, open: 0.1 } as const;

/**
 * Weighted score in 0..1. Category is a hard filter applied before scoring.
 * Title overlap counts most; shared keywords, same area and an unresolved status add to it.
 */
export function scoreSimilarity(
  input: SimilarityInput,
  candidate: SimilarityCandidate,
): SimilarityScore {
  const reasons: string[] = [];
  const titleOverlap = overlap(tokenize(input.title), tokenize(candidate.title));
  const inputWords = tokenize(`${input.title} ${input.description ?? ''}`);
  const candidateWords = tokenize(`${candidate.title} ${candidate.description}`);
  const keywordOverlap = overlap(inputWords, candidateWords);
  const sameArea =
    !!input.area && input.area.trim().toLowerCase() === candidate.area.trim().toLowerCase();

  let score =
    SIMILARITY_WEIGHTS.title * titleOverlap + SIMILARITY_WEIGHTS.keywords * keywordOverlap;
  if (titleOverlap > 0) reasons.push(`Similar title (${Math.round(titleOverlap * 100)}% of words)`);
  if (keywordOverlap > 0) reasons.push(`Shared keywords (${Math.round(keywordOverlap * 100)}%)`);
  if (sameArea) {
    score += SIMILARITY_WEIGHTS.area;
    reasons.push('Same area');
  }
  if (!candidate.isResolved && score > 0) {
    score += SIMILARITY_WEIGHTS.open;
    reasons.push('Still open');
  }
  return { score: Math.round(score * 100) / 100, reasons };
}
