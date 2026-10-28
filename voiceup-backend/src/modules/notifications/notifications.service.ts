import type { NotificationType } from '../../generated/prisma/enums.js';
import type { DbClient } from '../../lib/prisma.js';

export interface NotificationInput {
  type: NotificationType;
  issueId: string;
  message: string;
}

/** Creates one in-app notification per distinct user, skipping the actor. */
export async function notifyUsers(
  db: DbClient,
  userIds: Iterable<string>,
  input: NotificationInput,
  excludeUserId?: string,
): Promise<number> {
  const recipients = [...new Set(userIds)].filter((id) => id !== excludeUserId);
  if (recipients.length === 0) return 0;
  const result = await db.notification.createMany({
    data: recipients.map((userId) => ({ userId, ...input, message: input.message.slice(0, 300) })),
  });
  return result.count;
}
