import { z } from 'zod';

/** Path parameter `:id` (and friends) must be a UUID; anything else is a 400, not a DB error. */
export const uuidParam = z.uuid();

export const idParams = z.object({ id: uuidParam });

export function parseId(value: unknown): string {
  return uuidParam.parse(value);
}

/** Trimmed string with length limits. Empty after trimming counts as missing. */
export const text = (min: number, max: number) => z.string().trim().min(min).max(max);

/** Optional trimmed string; an empty string becomes undefined. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === '' ? undefined : value));

/** Query-string boolean: accepts "true"/"false" (and 1/0). */
export const queryBoolean = z
  .enum(['true', 'false', '1', '0'])
  .optional()
  .transform((value) => value === 'true' || value === '1');
