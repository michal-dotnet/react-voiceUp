import { Router } from 'express';
import multer from 'multer';
import type { AppDependencies } from '../../deps.js';
import { AppError, ErrorCodes, errors } from '../../lib/errors.js';
import { parseId } from '../../lib/http.js';
import { detectImageType } from '../../lib/storage.js';
import { currentUser, requireAuth } from '../../middleware/auth.js';
import { writeRateLimiter } from '../../middleware/security.js';
import { AuditActions, writeAudit } from '../audit/audit.service.js';
import { canViewIssue, findVisibleIssue, issueGroupIds } from '../issues/issueAccess.js';

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_ISSUE = 5;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 0 },
});

const attachmentSelect = {
  id: true,
  issueId: true,
  mimeType: true,
  sizeBytes: true,
  createdAt: true,
} as const;

const withUrl = <T extends { id: string }>(attachment: T) => ({
  ...attachment,
  url: `/api/attachments/${attachment.id}/file`,
});

/**
 * Image uploads for issues. Images only (JPEG, PNG, WebP, detected from the file's bytes),
 * up to 5 MB each and 5 per issue. The reporter may upload only while the issue is pending
 * review, so every image is moderated; admins may upload at any time. The image bytes are
 * stored in the database (MediaAttachment.data) and served only through GET .../file, which
 * applies the same visibility rules as the issue. Lists never select the bytes.
 */
export function createAttachmentsRouter({ env, prisma }: AppDependencies): Router {
  const router = Router();

  router.get('/issues/:id/attachments', async (req, res) => {
    const issue = await findVisibleIssue(prisma, parseId(req.params.id), req.user);
    const group = await issueGroupIds(prisma, issue.mergedIntoId ?? issue.id);
    const attachments = await prisma.mediaAttachment.findMany({
      where: { issueId: { in: group } },
      select: attachmentSelect,
      orderBy: { createdAt: 'asc' },
    });
    res.json({ data: attachments.map(withUrl) });
  });

  router.post(
    '/issues/:id/attachments',
    requireAuth,
    writeRateLimiter(env),
    upload.single('file'),
    async (req, res) => {
      const user = currentUser(req);
      const issue = await findVisibleIssue(prisma, parseId(req.params.id), user);
      if (user.role !== 'ADMIN' && issue.authorId !== user.id) {
        throw errors.forbidden('Only the reporter or an admin can add images to an issue.');
      }
      if (issue.moderationStatus === 'REJECTED' || issue.mergedIntoId) {
        throw errors.conflict(ErrorCodes.INVALID_STATE, 'Images cannot be added to this issue.');
      }
      // Like text edits, reporter images go through moderation: once published, only admins add images.
      if (user.role !== 'ADMIN' && issue.moderationStatus !== 'PENDING_REVIEW') {
        throw errors.conflict(
          ErrorCodes.INVALID_STATE,
          'Images can only be added while the issue is pending review.',
        );
      }
      const file = req.file;
      if (!file) throw errors.badRequest('Send one image in the multipart field "file".');
      const type = detectImageType(file.buffer);
      if (!type) {
        throw new AppError(
          415,
          ErrorCodes.UNSUPPORTED_MEDIA_TYPE,
          'Only JPEG, PNG and WebP images are allowed.',
        );
      }
      const count = await prisma.mediaAttachment.count({ where: { issueId: issue.id } });
      if (count >= MAX_ATTACHMENTS_PER_ISSUE) {
        throw errors.conflict(
          ErrorCodes.LIMIT_REACHED,
          `An issue can have at most ${MAX_ATTACHMENTS_PER_ISSUE} images.`,
        );
      }

      const attachment = await prisma.mediaAttachment.create({
        data: {
          issueId: issue.id,
          uploaderId: user.id,
          mimeType: type.mimeType,
          sizeBytes: file.size,
          // A copy as a plain Uint8Array, the type Prisma expects for Bytes.
          data: new Uint8Array(file.buffer),
        },
        select: attachmentSelect,
      });
      res.status(201).json({ data: withUrl(attachment) });
    },
  );

  router.get('/attachments/:id/file', async (req, res) => {
    const attachment = await prisma.mediaAttachment.findUnique({
      where: { id: parseId(req.params.id) },
      select: {
        mimeType: true,
        data: true,
        issue: { select: { moderationStatus: true, authorId: true } },
      },
    });
    if (!attachment || !canViewIssue(attachment.issue, req.user)) {
      throw errors.notFound('Attachment');
    }
    const body = Buffer.from(attachment.data);
    res.setHeader('Content-Type', attachment.mimeType);
    res.setHeader('Content-Length', body.length);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.end(body);
  });

  /** Reporters can remove their images while pending; admins can remove any (audit-logged). */
  router.delete('/attachments/:id', requireAuth, async (req, res) => {
    const user = currentUser(req);
    const id = parseId(req.params.id);
    const attachment = await prisma.mediaAttachment.findUnique({
      where: { id },
      select: {
        issueId: true,
        uploaderId: true,
        issue: { select: { moderationStatus: true, authorId: true } },
      },
    });
    if (!attachment || !canViewIssue(attachment.issue, user)) throw errors.notFound('Attachment');
    const isAdmin = user.role === 'ADMIN';
    const ownPending =
      attachment.uploaderId === user.id && attachment.issue.moderationStatus === 'PENDING_REVIEW';
    if (!isAdmin && !ownPending) {
      throw errors.forbidden('Images can only be removed by an admin once an issue is reviewed.');
    }
    await prisma.$transaction(async (tx) => {
      await tx.mediaAttachment.delete({ where: { id } });
      if (isAdmin) {
        await writeAudit(tx, {
          actorId: user.id,
          action: AuditActions.ATTACHMENT_DELETED,
          entityType: 'MediaAttachment',
          entityId: id,
          metadata: { issueId: attachment.issueId, uploaderId: attachment.uploaderId },
        });
      }
    });
    res.status(204).end();
  });

  return router;
}
