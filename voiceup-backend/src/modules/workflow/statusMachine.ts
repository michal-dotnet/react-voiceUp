import type { ResolutionStatus } from '../../generated/prisma/enums.js';

/**
 * Allowed resolution-status transitions. The workflow is linear (the referral step is
 * optional), plus reopening a resolved issue. Anything not listed here is rejected with 409 INVALID_TRANSITION.
 */
export const TRANSITIONS: Record<ResolutionStatus, readonly ResolutionStatus[]> = {
  OPEN: ['UNDER_REVIEW'],
  // IN_PROGRESS directly: lets admins skip the referral step when no organization is involved.
  UNDER_REVIEW: ['REFERRED', 'IN_PROGRESS'],
  REFERRED: ['IN_PROGRESS'],
  IN_PROGRESS: ['RESOLVED'],
  RESOLVED: ['OPEN'],
};

export function canTransition(from: ResolutionStatus, to: ResolutionStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** These statuses describe what an outside organization did, so the admin must cite a source. */
export const REQUIRES_SOURCE: readonly ResolutionStatus[] = ['IN_PROGRESS', 'RESOLVED'];
