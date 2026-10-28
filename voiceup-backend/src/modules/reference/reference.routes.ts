import { Router } from 'express';
import { z } from 'zod';
import type { AppDependencies } from '../../deps.js';
import { AppError, ErrorCodes, errors } from '../../lib/errors.js';
import { optionalText, parseId, queryBoolean, text } from '../../lib/http.js';
import { isUniqueViolation } from '../../lib/prisma.js';
import { currentUser } from '../../middleware/auth.js';
import { AuditActions, writeAudit } from '../audit/audit.service.js';

// Categories and organizations are reference data managed by admins.
// They are deactivated, never deleted, because issues and referrals point at them.

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'lowercase letters, digits and dashes only')
  .max(80);

export const createCategoryBody = z.object({ name: text(2, 80), slug }).strict();
export const updateCategoryBody = z
  .object({ name: text(2, 80), slug, isActive: z.boolean() })
  .partial()
  .strict();

export const createOrganizationBody = z
  .object({ name: text(2, 120), type: optionalText(80), contactInfo: optionalText(500) })
  .strict();
export const updateOrganizationBody = z
  .object({
    name: text(2, 120),
    type: optionalText(80),
    contactInfo: optionalText(500),
    isActive: z.boolean(),
  })
  .partial()
  .strict();

export const includeInactiveQuery = z.object({ includeInactive: queryBoolean });

function duplicateName(error: unknown): never {
  if (isUniqueViolation(error)) {
    throw new AppError(409, ErrorCodes.ALREADY_EXISTS, 'The name or slug is already in use.');
  }
  throw error;
}

/** Public reads. Inactive entries are hidden unless an admin asks for them. */
export function createReferenceRouter({ prisma }: AppDependencies): Router {
  const router = Router();

  router.get('/categories', async (req, res) => {
    const { includeInactive } = includeInactiveQuery.parse(req.query);
    const all = includeInactive && req.user?.role === 'ADMIN';
    const categories = await prisma.category.findMany({
      where: all ? {} : { isActive: true },
      select: { id: true, name: true, slug: true, isActive: true },
      orderBy: { name: 'asc' },
    });
    res.json({ data: categories });
  });

  router.get('/organizations', async (req, res) => {
    const { includeInactive } = includeInactiveQuery.parse(req.query);
    const all = includeInactive && req.user?.role === 'ADMIN';
    const organizations = await prisma.organization.findMany({
      where: all ? {} : { isActive: true },
      select: { id: true, name: true, type: true, contactInfo: true, isActive: true },
      orderBy: { name: 'asc' },
    });
    res.json({ data: organizations });
  });

  return router;
}

/** Mounted under /api/admin (admin only). */
export function createReferenceAdminRouter({ prisma }: AppDependencies): Router {
  const router = Router();

  router.post('/categories', async (req, res) => {
    const body = createCategoryBody.parse(req.body);
    const admin = currentUser(req);
    const category = await prisma
      .$transaction(async (tx) => {
        const created = await tx.category.create({ data: body });
        await writeAudit(tx, {
          actorId: admin.id,
          action: AuditActions.CATEGORY_CREATED,
          entityType: 'Category',
          entityId: created.id,
          metadata: { name: created.name },
        });
        return created;
      })
      .catch(duplicateName);
    res.status(201).json({ data: category });
  });

  router.patch('/categories/:id', async (req, res) => {
    const id = parseId(req.params.id);
    const body = updateCategoryBody.parse(req.body);
    const admin = currentUser(req);
    const category = await prisma
      .$transaction(async (tx) => {
        if (!(await tx.category.findUnique({ where: { id } }))) throw errors.notFound('Category');
        const updated = await tx.category.update({ where: { id }, data: body });
        await writeAudit(tx, {
          actorId: admin.id,
          action: AuditActions.CATEGORY_UPDATED,
          entityType: 'Category',
          entityId: id,
          metadata: { changes: body },
        });
        return updated;
      })
      .catch(duplicateName);
    res.json({ data: category });
  });

  router.post('/organizations', async (req, res) => {
    const body = createOrganizationBody.parse(req.body);
    const admin = currentUser(req);
    const organization = await prisma
      .$transaction(async (tx) => {
        const created = await tx.organization.create({ data: body });
        await writeAudit(tx, {
          actorId: admin.id,
          action: AuditActions.ORGANIZATION_CREATED,
          entityType: 'Organization',
          entityId: created.id,
          metadata: { name: created.name },
        });
        return created;
      })
      .catch(duplicateName);
    res.status(201).json({ data: organization });
  });

  router.patch('/organizations/:id', async (req, res) => {
    const id = parseId(req.params.id);
    const body = updateOrganizationBody.parse(req.body);
    const admin = currentUser(req);
    const organization = await prisma
      .$transaction(async (tx) => {
        if (!(await tx.organization.findUnique({ where: { id } }))) {
          throw errors.notFound('Organization');
        }
        const updated = await tx.organization.update({ where: { id }, data: body });
        await writeAudit(tx, {
          actorId: admin.id,
          action: AuditActions.ORGANIZATION_UPDATED,
          entityType: 'Organization',
          entityId: id,
          metadata: { changes: body },
        });
        return updated;
      })
      .catch(duplicateName);
    res.json({ data: organization });
  });

  return router;
}
