import type { UserRole } from '../../generated/prisma/enums.js';

/** Explicit column lists: passwordHash is never selected, so it can never leak. */
export const privateUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** What other users may see about a person: their display name only, never the email. */
export const publicUserSelect = { id: true, name: true } as const;

export interface PrivateUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}
