import {
  OpenApiGeneratorV31,
  OpenAPIRegistry,
  type RouteConfig,
} from '@asteasolutions/zod-to-openapi';
import { z, type ZodObject, type ZodType } from 'zod';
import { auditLogQuery } from '../modules/admin/admin.routes.js';
import { loginBody, registerBody } from '../modules/auth/auth.schemas.js';
import {
  adminReportsQuery,
  commentBody,
  confirmBody,
  handleReportBody,
  reopenRequestBody,
  reportBody,
  solutionBody,
  updateSolutionBody,
  visibilityBody,
} from '../modules/community/community.schemas.js';
import {
  adminListIssuesQuery,
  approveIssueBody,
  createIssueBody,
  listIssuesQuery,
  redactIssueBody,
  rejectIssueBody,
  similarIssuesQuery,
  updateIssueBody,
} from '../modules/issues/issues.schemas.js';
import { mergeBody } from '../modules/merge/merge.service.js';
import { listNotificationsQuery } from '../modules/notifications/notifications.routes.js';
import {
  createCategoryBody,
  createOrganizationBody,
  includeInactiveQuery,
  updateCategoryBody,
  updateOrganizationBody,
} from '../modules/reference/reference.routes.js';
import {
  changePasswordBody,
  listUsersQuery,
  updateMeBody,
  updateUserBody,
} from '../modules/users/users.routes.js';
import {
  adminUpdateBody,
  changeStatusBody,
  createAssignmentBody,
  externalResponseBody,
  updateAssignmentBody,
} from '../modules/workflow/workflow.schemas.js';
import { paginationQuery } from '../lib/pagination.js';

type Access = 'public' | 'user' | 'admin';
type Method = RouteConfig['method'];

interface Endpoint {
  method: Method;
  path: string;
  tag: string;
  summary: string;
  access: Access;
  body?: ZodType;
  query?: ZodObject;
  status?: number;
  multipart?: boolean;
  /** Overrides the default access note. */
  description?: string;
  headers?: ZodObject;
}

const id = z.uuid();
const params = (path: string): ZodObject | undefined => {
  const names = [...path.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? '');
  return names.length > 0
    ? z.object(Object.fromEntries(names.map((name) => [name, id])))
    : undefined;
};

const errorBody = z.object({
  error: z.object({
    code: z.string().meta({ example: 'VALIDATION_ERROR' }),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

const P = '/api';

const guestTokenHeader = z.object({
  'X-Guest-Token': z
    .string()
    .optional()
    .meta({ description: 'Guests only: the guestToken returned by their first confirmation.' }),
});

const GUEST_CONFIRM_NOTE = [
  'With a Bearer token: a registered user confirmation (optional `note`), counted in `confirmationCount`.',
  'Without a token: a guest confirmation. The body must be empty (`{}`); notes are not allowed.',
  'The first guest confirmation returns `guestToken`; send it as `X-Guest-Token` to avoid',
  'duplicates and to withdraw. Guest confirmations are counted separately',
  '(`guestConfirmationCount`), are unverified, are rate limited per IP and capped per IP per issue.',
].join(' ');
const endpoints: Endpoint[] = [
  // Health
  {
    method: 'get',
    path: `${P}/health`,
    tag: 'Health',
    summary: 'Liveness check',
    access: 'public',
  },
  {
    method: 'get',
    path: `${P}/health/ready`,
    tag: 'Health',
    summary: 'Readiness check (database)',
    access: 'public',
  },

  // Auth and current user
  {
    method: 'post',
    path: `${P}/auth/register`,
    tag: 'Auth',
    summary: 'Register (always creates a USER)',
    access: 'public',
    body: registerBody,
    status: 201,
  },
  {
    method: 'post',
    path: `${P}/auth/login`,
    tag: 'Auth',
    summary: 'Log in and receive an access token',
    access: 'public',
    body: loginBody,
  },
  {
    method: 'get',
    path: `${P}/users/me`,
    tag: 'Users',
    summary: 'Current user profile',
    access: 'user',
  },
  {
    method: 'patch',
    path: `${P}/users/me`,
    tag: 'Users',
    summary: 'Change display name',
    access: 'user',
    body: updateMeBody,
  },
  {
    method: 'post',
    path: `${P}/users/me/password`,
    tag: 'Users',
    summary: 'Change password',
    access: 'user',
    body: changePasswordBody,
    status: 204,
  },

  // Reference data
  {
    method: 'get',
    path: `${P}/categories`,
    tag: 'Reference data',
    summary: 'List categories',
    access: 'public',
    query: includeInactiveQuery,
  },
  {
    method: 'get',
    path: `${P}/organizations`,
    tag: 'Reference data',
    summary: 'List organizations (reference data only)',
    access: 'public',
    query: includeInactiveQuery,
  },

  // Issues
  {
    method: 'get',
    path: `${P}/issues`,
    tag: 'Issues',
    summary: 'Search and list published issues',
    access: 'public',
    query: listIssuesQuery,
  },
  {
    method: 'get',
    path: `${P}/issues/similar`,
    tag: 'Issues',
    summary: 'Suggest possible duplicates before reporting (suggestions only)',
    access: 'public',
    query: similarIssuesQuery,
  },
  {
    method: 'get',
    path: `${P}/issues/mine`,
    tag: 'Issues',
    summary: "List the current user's own issues (all states)",
    access: 'user',
    query: listIssuesQuery,
  },
  {
    method: 'post',
    path: `${P}/issues`,
    tag: 'Issues',
    summary: 'Report a new issue (starts as PENDING_REVIEW)',
    access: 'user',
    body: createIssueBody,
    status: 201,
  },
  {
    method: 'get',
    path: `${P}/issues/{id}`,
    tag: 'Issues',
    summary: 'Get an issue (merged issues include mergedIntoId)',
    access: 'public',
  },
  {
    method: 'patch',
    path: `${P}/issues/{id}`,
    tag: 'Issues',
    summary: 'Edit own issue while pending review',
    access: 'user',
    body: updateIssueBody,
  },
  {
    method: 'delete',
    path: `${P}/issues/{id}`,
    tag: 'Issues',
    summary: 'Delete own issue while pending review',
    access: 'user',
    status: 204,
  },
  {
    method: 'get',
    path: `${P}/issues/{id}/history`,
    tag: 'Issues',
    summary: 'Timeline: status changes, admin updates and merges',
    access: 'public',
  },
  {
    method: 'get',
    path: `${P}/issues/{id}/referrals`,
    tag: 'Issues',
    summary: 'Referrals to organizations and recorded responses',
    access: 'public',
  },

  // Community
  {
    method: 'post',
    path: `${P}/issues/{id}/confirmations`,
    tag: 'Community',
    summary: 'Confirm "this affects me too" (users and guests)',
    access: 'public',
    body: confirmBody,
    headers: guestTokenHeader,
    status: 201,
    description: GUEST_CONFIRM_NOTE,
  },
  {
    method: 'delete',
    path: `${P}/issues/{id}/confirmations`,
    tag: 'Community',
    summary: 'Withdraw confirmation (users, or guests with X-Guest-Token)',
    access: 'public',
    headers: guestTokenHeader,
    description: GUEST_CONFIRM_NOTE,
  },
  {
    method: 'post',
    path: `${P}/issues/{id}/followers`,
    tag: 'Community',
    summary: 'Follow an issue',
    access: 'user',
    status: 201,
  },
  {
    method: 'delete',
    path: `${P}/issues/{id}/followers`,
    tag: 'Community',
    summary: 'Unfollow an issue',
    access: 'user',
  },
  {
    method: 'get',
    path: `${P}/issues/{id}/comments`,
    tag: 'Community',
    summary: 'List comments',
    access: 'public',
    query: paginationQuery,
  },
  {
    method: 'post',
    path: `${P}/issues/{id}/comments`,
    tag: 'Community',
    summary: 'Add a comment',
    access: 'user',
    body: commentBody,
    status: 201,
  },
  {
    method: 'patch',
    path: `${P}/issues/{id}/comments/{commentId}`,
    tag: 'Community',
    summary: 'Edit own comment',
    access: 'user',
    body: commentBody,
  },
  {
    method: 'delete',
    path: `${P}/issues/{id}/comments/{commentId}`,
    tag: 'Community',
    summary: 'Remove own comment (hidden, not deleted)',
    access: 'user',
    status: 204,
  },
  {
    method: 'get',
    path: `${P}/issues/{id}/solutions`,
    tag: 'Community',
    summary: 'List proposed solutions',
    access: 'public',
    query: paginationQuery,
  },
  {
    method: 'post',
    path: `${P}/issues/{id}/solutions`,
    tag: 'Community',
    summary: 'Propose a solution or share an experience',
    access: 'user',
    body: solutionBody,
    status: 201,
  },
  {
    method: 'patch',
    path: `${P}/issues/{id}/solutions/{solutionId}`,
    tag: 'Community',
    summary: 'Edit own solution',
    access: 'user',
    body: updateSolutionBody,
  },
  {
    method: 'delete',
    path: `${P}/issues/{id}/solutions/{solutionId}`,
    tag: 'Community',
    summary: 'Remove own solution (hidden, not deleted)',
    access: 'user',
    status: 204,
  },
  {
    method: 'post',
    path: `${P}/issues/{id}/reopen-requests`,
    tag: 'Community',
    summary: 'Ask admins to reopen a resolved issue (reporter or confirmer)',
    access: 'user',
    body: reopenRequestBody,
    status: 201,
  },
  {
    method: 'post',
    path: `${P}/issues/{id}/reports`,
    tag: 'Community',
    summary: 'Report an issue as inappropriate',
    access: 'user',
    body: reportBody,
    status: 201,
  },
  {
    method: 'post',
    path: `${P}/issues/{id}/comments/{commentId}/reports`,
    tag: 'Community',
    summary: 'Report a comment',
    access: 'user',
    body: reportBody,
    status: 201,
  },
  {
    method: 'post',
    path: `${P}/issues/{id}/solutions/{solutionId}/reports`,
    tag: 'Community',
    summary: 'Report a solution',
    access: 'user',
    body: reportBody,
    status: 201,
  },

  // Attachments
  {
    method: 'get',
    path: `${P}/issues/{id}/attachments`,
    tag: 'Attachments',
    summary: 'List images of an issue',
    access: 'public',
  },
  {
    method: 'post',
    path: `${P}/issues/{id}/attachments`,
    tag: 'Attachments',
    summary: 'Upload an image (JPEG/PNG/WebP, max 5 MB, 5 per issue)',
    access: 'user',
    multipart: true,
    status: 201,
  },
  {
    method: 'get',
    path: `${P}/attachments/{id}/file`,
    tag: 'Attachments',
    summary: 'Download an image (same visibility as its issue)',
    access: 'public',
  },
  {
    method: 'delete',
    path: `${P}/attachments/{id}`,
    tag: 'Attachments',
    summary: 'Remove an image (own while pending, or admin)',
    access: 'user',
    status: 204,
  },

  // Notifications
  {
    method: 'get',
    path: `${P}/notifications`,
    tag: 'Notifications',
    summary: 'List own notifications',
    access: 'user',
    query: listNotificationsQuery,
  },
  {
    method: 'patch',
    path: `${P}/notifications/{id}/read`,
    tag: 'Notifications',
    summary: 'Mark one notification as read',
    access: 'user',
    status: 204,
  },
  {
    method: 'post',
    path: `${P}/notifications/read-all`,
    tag: 'Notifications',
    summary: 'Mark all notifications as read',
    access: 'user',
  },

  // Admin: moderation
  {
    method: 'get',
    path: `${P}/admin/issues`,
    tag: 'Admin: moderation',
    summary: 'Moderation queue (defaults to pending, oldest first)',
    access: 'admin',
    query: adminListIssuesQuery,
  },
  {
    method: 'post',
    path: `${P}/admin/issues/{id}/approve`,
    tag: 'Admin: moderation',
    summary: 'Approve, optionally redacting personal details',
    access: 'admin',
    body: approveIssueBody,
  },
  {
    method: 'post',
    path: `${P}/admin/issues/{id}/reject`,
    tag: 'Admin: moderation',
    summary: 'Reject or take down, with a reason',
    access: 'admin',
    body: rejectIssueBody,
  },
  {
    method: 'patch',
    path: `${P}/admin/issues/{id}`,
    tag: 'Admin: moderation',
    summary: 'Redact an issue (originals kept in the audit log)',
    access: 'admin',
    body: redactIssueBody,
  },
  {
    method: 'patch',
    path: `${P}/admin/comments/{id}`,
    tag: 'Admin: moderation',
    summary: 'Hide or restore a comment',
    access: 'admin',
    body: visibilityBody,
  },
  {
    method: 'patch',
    path: `${P}/admin/solutions/{id}`,
    tag: 'Admin: moderation',
    summary: 'Hide or restore a solution',
    access: 'admin',
    body: visibilityBody,
  },
  {
    method: 'get',
    path: `${P}/admin/reports`,
    tag: 'Admin: moderation',
    summary: 'Reported content queue',
    access: 'admin',
    query: adminReportsQuery,
  },
  {
    method: 'patch',
    path: `${P}/admin/reports/{id}`,
    tag: 'Admin: moderation',
    summary: 'Handle a report',
    access: 'admin',
    body: handleReportBody,
  },
  {
    method: 'get',
    path: `${P}/admin/reopen-requests`,
    tag: 'Admin: moderation',
    summary: 'Pending reopen requests',
    access: 'admin',
    query: paginationQuery,
  },

  // Admin: case handling
  {
    method: 'post',
    path: `${P}/admin/issues/{id}/status`,
    tag: 'Admin: case handling',
    summary: 'Change resolution status (state machine)',
    access: 'admin',
    body: changeStatusBody,
    status: 201,
  },
  {
    method: 'post',
    path: `${P}/admin/issues/{id}/updates`,
    tag: 'Admin: case handling',
    summary: 'Post a verified admin update',
    access: 'admin',
    body: adminUpdateBody,
    status: 201,
  },
  {
    method: 'post',
    path: `${P}/admin/issues/{id}/assignments`,
    tag: 'Admin: case handling',
    summary: 'Prepare a referral to an organization',
    access: 'admin',
    body: createAssignmentBody,
    status: 201,
  },
  {
    method: 'patch',
    path: `${P}/admin/assignments/{id}`,
    tag: 'Admin: case handling',
    summary: 'Record that a referral was sent or acknowledged (with evidence)',
    access: 'admin',
    body: updateAssignmentBody,
  },
  {
    method: 'post',
    path: `${P}/admin/assignments/{id}/responses`,
    tag: 'Admin: case handling',
    summary: "Record an organization's response (with evidence)",
    access: 'admin',
    body: externalResponseBody,
    status: 201,
  },
  {
    method: 'post',
    path: `${P}/admin/issues/merge`,
    tag: 'Admin: case handling',
    summary: 'Merge a duplicate into a canonical issue',
    access: 'admin',
    body: mergeBody,
  },

  // Admin: management
  {
    method: 'get',
    path: `${P}/admin/dashboard`,
    tag: 'Admin: management',
    summary: 'Statistics dashboard',
    access: 'admin',
  },
  {
    method: 'get',
    path: `${P}/admin/audit-logs`,
    tag: 'Admin: management',
    summary: 'Audit log',
    access: 'admin',
    query: auditLogQuery,
  },
  {
    method: 'get',
    path: `${P}/admin/users`,
    tag: 'Admin: management',
    summary: 'List users',
    access: 'admin',
    query: listUsersQuery,
  },
  {
    method: 'get',
    path: `${P}/admin/users/{id}`,
    tag: 'Admin: management',
    summary: 'Get a user',
    access: 'admin',
  },
  {
    method: 'patch',
    path: `${P}/admin/users/{id}`,
    tag: 'Admin: management',
    summary: "Change a user's role (not your own)",
    access: 'admin',
    body: updateUserBody,
  },
  {
    method: 'post',
    path: `${P}/admin/categories`,
    tag: 'Admin: management',
    summary: 'Create a category',
    access: 'admin',
    body: createCategoryBody,
    status: 201,
  },
  {
    method: 'patch',
    path: `${P}/admin/categories/{id}`,
    tag: 'Admin: management',
    summary: 'Update or deactivate a category',
    access: 'admin',
    body: updateCategoryBody,
  },
  {
    method: 'post',
    path: `${P}/admin/organizations`,
    tag: 'Admin: management',
    summary: 'Create an organization',
    access: 'admin',
    body: createOrganizationBody,
    status: 201,
  },
  {
    method: 'patch',
    path: `${P}/admin/organizations/{id}`,
    tag: 'Admin: management',
    summary: 'Update or deactivate an organization',
    access: 'admin',
    body: updateOrganizationBody,
  },
];

const ACCESS_NOTE: Record<Access, string> = {
  public: 'Public. A token is optional and may reveal more (e.g. your own pending issues).',
  user: 'Requires a Bearer token.',
  admin: 'Requires a Bearer token of an ADMIN.',
};

export function buildOpenApiDocument() {
  const registry = new OpenAPIRegistry();
  const bearer = registry.registerComponent('securitySchemes', 'bearerAuth', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
  });

  for (const endpoint of endpoints) {
    const status = endpoint.status ?? 200;
    const pathParams = params(endpoint.path);
    const responses: RouteConfig['responses'] = {
      [status]: {
        description: status === 204 ? 'No content' : 'Success. Body: `{ data, meta? }`.',
      },
      400: {
        description: 'Validation error',
        content: { 'application/json': { schema: errorBody } },
      },
      ...(endpoint.access !== 'public' && {
        401: {
          description: 'Missing or invalid token',
          content: { 'application/json': { schema: errorBody } },
        },
      }),
      ...(endpoint.access === 'admin' && {
        403: {
          description: 'Not an admin',
          content: { 'application/json': { schema: errorBody } },
        },
      }),
      ...(pathParams && {
        404: {
          description: 'Not found (or not visible to you)',
          content: { 'application/json': { schema: errorBody } },
        },
      }),
      ...(endpoint.method !== 'get' && {
        409: {
          description: 'Conflict: invalid state or transition, duplicate, or merged issue',
          content: { 'application/json': { schema: errorBody } },
        },
      }),
    };
    registry.registerPath({
      method: endpoint.method,
      path: endpoint.path,
      tags: [endpoint.tag],
      summary: endpoint.summary,
      description: endpoint.description ?? ACCESS_NOTE[endpoint.access],
      ...(endpoint.access !== 'public' && { security: [{ [bearer.name]: [] }] }),
      request: {
        ...(pathParams && { params: pathParams }),
        ...(endpoint.headers && { headers: endpoint.headers }),
        ...(endpoint.query && { query: endpoint.query }),
        ...(endpoint.body && {
          body: { required: true, content: { 'application/json': { schema: endpoint.body } } },
        }),
        ...(endpoint.multipart && {
          body: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: z.object({ file: z.string().meta({ format: 'binary' }) }),
              },
            },
          },
        }),
      },
      responses,
    });
  }

  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'VoiceUp API',
      version: '1.0.0',
      description: [
        'Public issue reporting, community feedback and resolution tracking.',
        '',
        '**VoiceUp is not an emergency service.** In an emergency, contact the relevant emergency number.',
        '',
        "Provenance: confirmation counts are users' own reports; statuses, referrals and external",
        'responses are records kept by VoiceUp admins with evidence. Nothing is presented as an',
        'official statement of an outside organization.',
        '',
        'Success: `{ data, meta? }`. Errors: `{ error: { code, message, details? } }`. Lists accept',
        '`page` and `pageSize` (max 50) and return `meta.total`.',
      ].join('\n'),
    },
    servers: [{ url: '/' }],
  });
}

/** Number of documented operations, used by tests to keep docs and routes in sync. */
export const documentedEndpoints = endpoints.map(({ method, path }) => ({ method, path }));
