import { z } from 'zod';
import { ResolutionStatus } from '../../generated/prisma/enums.js';
import { optionalText, text, uuidParam } from '../../lib/http.js';

const CLOCK_SKEW_MS = 5 * 60 * 1000;

/** A date that has already happened (evidence describes past events). */
const pastDate = z.coerce
  .date()
  .refine((date) => date.getTime() <= Date.now() + CLOCK_SKEW_MS, 'must not be in the future');

export const changeStatusBody = z
  .object({
    toStatus: z.enum(ResolutionStatus),
    note: text(5, 2000),
    /** Where the information comes from (a reply, a site visit, a phone call...). */
    source: optionalText(500),
  })
  .strict();

export const adminUpdateBody = z
  .object({ note: text(5, 2000), source: optionalText(500) })
  .strict();

export const createAssignmentBody = z.object({ organizationId: uuidParam }).strict();

export const updateAssignmentBody = z.discriminatedUnion('referralStatus', [
  z
    .object({
      referralStatus: z.literal('SENT'),
      sentAt: pastDate,
      sentMethod: text(2, 100),
      sentEvidence: text(5, 1000),
    })
    .strict(),
  z
    .object({
      referralStatus: z.literal('ACKNOWLEDGED'),
      ackAt: pastDate,
      ackEvidence: text(5, 1000),
    })
    .strict(),
]);

export const externalResponseBody = z
  .object({
    receivedAt: pastDate,
    summary: text(5, 2000),
    evidenceNote: text(5, 1000),
    evidenceUrl: z
      .url({ protocol: /^https?$/ })
      .max(500)
      .optional(),
  })
  .strict();
