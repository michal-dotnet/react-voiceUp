import type { Prisma } from '../../generated/prisma/client.js';
import type { DbClient } from '../../lib/prisma.js';

export const AuditActions = {
  ISSUE_APPROVED: 'ISSUE_APPROVED',
  ISSUE_REJECTED: 'ISSUE_REJECTED',
  ISSUE_REDACTED: 'ISSUE_REDACTED',
  ISSUE_STATUS_CHANGED: 'ISSUE_STATUS_CHANGED',
  ISSUE_UPDATE_POSTED: 'ISSUE_UPDATE_POSTED',
  ISSUE_MERGED: 'ISSUE_MERGED',
  ASSIGNMENT_CREATED: 'ASSIGNMENT_CREATED',
  ASSIGNMENT_UPDATED: 'ASSIGNMENT_UPDATED',
  EXTERNAL_RESPONSE_RECORDED: 'EXTERNAL_RESPONSE_RECORDED',
  CONTENT_VISIBILITY_CHANGED: 'CONTENT_VISIBILITY_CHANGED',
  REPORT_HANDLED: 'REPORT_HANDLED',
  ATTACHMENT_DELETED: 'ATTACHMENT_DELETED',
  USER_ROLE_CHANGED: 'USER_ROLE_CHANGED',
  CATEGORY_CREATED: 'CATEGORY_CREATED',
  CATEGORY_UPDATED: 'CATEGORY_UPDATED',
  ORGANIZATION_CREATED: 'ORGANIZATION_CREATED',
  ORGANIZATION_UPDATED: 'ORGANIZATION_UPDATED',
} as const;

export type AuditAction = (typeof AuditActions)[keyof typeof AuditActions];

export interface AuditEntry {
  actorId: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  metadata?: Prisma.InputJsonObject;
}

/** Records a sensitive admin action. Call it inside the same transaction as the action. */
export async function writeAudit(db: DbClient, entry: AuditEntry): Promise<void> {
  await db.auditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      metadata: entry.metadata ?? {},
    },
  });
}
