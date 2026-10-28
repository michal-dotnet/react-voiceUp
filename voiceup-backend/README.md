# VoiceUp Backend

REST API for VoiceUp, a public issue reporting, community feedback and resolution tracking
platform. Built with Node.js, Express 5, strict TypeScript, PostgreSQL, Prisma 7 and Zod.

> **VoiceUp is not a substitute for emergency services.** In an emergency, contact the relevant
> emergency number.

## What it does

- **Reporting:** users report public issues (category, area, free-text location, up to 5 images).
  Before reporting, the client can ask for possible duplicates (`GET /api/issues/similar`).
- **Moderation:** every issue starts as `PENDING_REVIEW`. An admin approves it (optionally redacting
  personal details) or rejects it with a reason. Originals of redacted text are kept in the audit log.
- **Community:** confirmations ("this affects me too", one per user), follows, comments, proposed
  solutions (personal experience or unverified suggestion), reports of inappropriate content.
- **Case handling (admins):** a linear status workflow, referrals to organizations with evidence,
  documented external responses, verified admin updates, reopen requests, and merging duplicates.
- **Notifications** (in-app), **dashboard statistics** and a full **audit log** of admin actions.

### Provenance: who said what

VoiceUp always distinguishes these, in the data model and in API labels:

| Information                      | Stored in                                     | Labelled as                                           |
| -------------------------------- | --------------------------------------------- | ----------------------------------------------------- |
| What users claim                 | Confirmations, comments, solutions            | "Reported by N users. Not independently verified."    |
| What admins verified             | Status history, admin updates                 | "Recorded by a VoiceUp admin."                        |
| What was sent to an organization | Referral (`SENT`) with date, method, evidence | "Sending recorded by a VoiceUp admin, with evidence." |
| What an organization answered    | External response with evidence               | "Response from X, as recorded by a VoiceUp admin."    |

Organizations never post to VoiceUp themselves, and nothing is presented as an official statement.

## Requirements

- Node.js 22.12 or newer (LTS), npm 10+
- PostgreSQL 14 or newer

## Setup

```bash
npm install                 # also generates the Prisma client
cp .env.example .env        # then set DATABASE_URL, JWT_SECRET and the SEED_ADMIN_* values
npm run db:deploy           # apply migrations to the database in DATABASE_URL
npm run db:seed             # first admin, categories, reference organizations (idempotent)
npm run dev                 # http://localhost:3000
```

- API docs (Swagger UI): <http://localhost:3000/api/docs>
- OpenAPI JSON: <http://localhost:3000/api/docs/openapi.json>
- Health: `GET /api/health` (liveness), `GET /api/health/ready` (database)

Quick database for development (example with Docker):

```bash
docker run -d --name voiceup-db -p 5432:5432 \
  -e POSTGRES_USER=voiceup -e POSTGRES_PASSWORD=voiceup -e POSTGRES_DB=voiceup_dev postgres:16
docker exec voiceup-db createdb -U voiceup voiceup_test
```

## Scripts

| Script                                    | Purpose                                              |
| ----------------------------------------- | ---------------------------------------------------- |
| `npm run dev`                             | Run with auto-reload (reads `.env`)                  |
| `npm run build` / `npm start`             | Compile to `dist/` / run the compiled server         |
| `npm run check`                           | Typecheck, lint, format check and all tests          |
| `npm run typecheck`                       | Type-check sources and tests                         |
| `npm run lint` / `npm run lint:fix`       | ESLint (type-aware)                                  |
| `npm run format` / `npm run format:check` | Prettier                                             |
| `npm test` / `npm run test:watch`         | Vitest + Supertest against a real PostgreSQL test DB |
| `npm run db:migrate`                      | Create/apply a migration in development              |
| `npm run db:deploy`                       | Apply migrations (production, CI)                    |
| `npm run db:seed` / `npm run db:reset`    | Seed / reset the development database                |

## Tests

The tests run against a real PostgreSQL database named in `DATABASE_URL_TEST` (default
`postgresql://voiceup:voiceup@localhost:5432/voiceup_test`). Before the run, the schema is dropped
and rebuilt from the migrations in `prisma/migrations`; tables are truncated before each test.
For safety, the suite refuses to run against a database whose name does not end in `_test`.

## Configuration

All configuration comes from environment variables, validated at startup with Zod. The server
refuses to start on invalid configuration and prints which variables are wrong (never their
values). See `.env.example` for the complete list.

| Variable                 | Default                   | Description                                  |
| ------------------------ | ------------------------- | -------------------------------------------- |
| `DATABASE_URL`           | required                  | PostgreSQL connection string                 |
| `JWT_SECRET`             | required (32+ characters) | Access token signing secret                  |
| `JWT_EXPIRES_IN_SECONDS` | `7200`                    | Access token lifetime                        |
| `NODE_ENV`, `PORT`       | `development`, `3000`     |                                              |
| `LOG_LEVEL`              | depends on `NODE_ENV`     | `debug`, `info`, `warn`, `error` or `silent` |
| `CORS_ORIGINS`           | empty                     | Comma-separated allowed browser origins      |
| `TRUST_PROXY`            | `0`                       | Reverse-proxy hops to trust for client IPs   |
| `RATE_LIMIT_*`           | 300 req / 15 min          | Global per-IP limit                          |
| `AUTH_RATE_LIMIT_MAX`    | `20`                      | Register/login per IP per window             |
| `WRITE_RATE_LIMIT_MAX`   | `30`                      | Issue creations and uploads per IP per hour  |

## Project structure

```
prisma/
  schema.prisma          16 entities and enums
  migrations/            init + hand-written CHECK constraints
  seed.ts                idempotent seed
src/
  server.ts              process entry: config, HTTP server, graceful shutdown
  app.ts                 builds the Express app (tests import it directly)
  routes.ts              mounts feature routers under /api
  config/env.ts          environment validation
  docs/                  OpenAPI document (built from the Zod schemas) and Swagger UI
  lib/                   errors, logger, prisma, jwt, password, pagination, storage, similarity
  middleware/            auth, security (helmet, CORS, rate limits), logging, error handler
  modules/
    auth/ users/ reference/ issues/ community/ workflow/ merge/
    attachments/ notifications/ admin/ audit/ health/
tests/                   integration tests (Supertest) and unit tests
```

## API conventions

- Success: `{ "data": ..., "meta"?: ... }`. Lists accept `page` and `pageSize` (max 50) and return
  `meta: { page, pageSize, total, totalPages }`.
- Error: `{ "error": { "code": "STABLE_CODE", "message": "English text", "details"?: ... } }`.
  Clients should depend on `error.code`, not on the message.
- Authentication: `Authorization: Bearer <accessToken>` from `POST /api/auth/login`.
- User content may be Hebrew (UTF-8). API messages and documentation are English.
- Issues that are not visible to you return `404`, never `403`, so their existence is not leaked.

## Business rules

**Roles.** Exactly two: `USER` and `ADMIN`. Self-registration always creates a `USER`; roles and
user ids in request bodies are rejected or ignored. Admins cannot change their own role.

**Visibility.** Approved issues are public. Pending and rejected issues are visible only to their
author and to admins (including their images). Authors see the rejection reason.

**Editing.** Authors edit or delete their issue (and add or remove its images) only while it is
pending review. After approval, only admins can change it (redaction is audit-logged with the
original text). Users edit their own comments and solutions; "deleting" hides them, so nothing is lost.

**Status workflow.** `OPEN → UNDER_REVIEW → REFERRED → IN_PROGRESS → RESOLVED` (`REFERRED` is
optional: `UNDER_REVIEW → IN_PROGRESS` is allowed when no organization is involved), plus
`RESOLVED → OPEN` (reopen). Any other transition is `409 INVALID_TRANSITION`. Every change needs a
note; `REFERRED` requires a referral marked `SENT` with date, method and evidence; `IN_PROGRESS`
and `RESOLVED` require a source. Changes write the timeline and the audit log and notify followers.
The reporter or a user who confirmed a resolved issue can submit a reopen request; an admin decides.

**Referrals.** `PREPARED → SENT → ACKNOWLEDGED`. `SENT` and `ACKNOWLEDGED` require dates (not in
the future) and evidence; the database enforces this with CHECK constraints too. Responses can only
be recorded for sent referrals. Evidence notes are admin-only; the public sees that evidence exists.

**Confirmations.** One per user per issue group (unique index + group check). Authors cannot confirm
their own issue. Counts are always labelled as user reports.

**Guest confirmations.** Guests (no login) may only press "this affects me too" via
`POST /api/issues/:id/confirmations` with an empty body; notes, comments, issues and every other
write still require login. The first guest confirmation returns a signed `guestToken`; the client
sends it as `X-Guest-Token` to avoid duplicates and to withdraw (`DELETE`). Only HMAC digests of
the token and IP are stored. Guests are rate limited per IP (`GUEST_CONFIRM_RATE_LIMIT_MAX`) and
capped per IP per issue (`GUEST_CONFIRMATIONS_PER_IP`). They are counted separately
(`guestConfirmationCount`) and labelled unverified: clearing the token makes a new guest, so the
caps limit abuse but cannot prevent it.

**Duplicates.** `GET /api/issues/similar` ranks published issues of the same category by title and
keyword overlap, same area and open status (Hebrew prefix letters are handled). Suggestions only.

**Merging.** `POST /api/admin/issues/merge` runs in one transaction with both issues locked. Nothing
is copied, moved or deleted: the source gets `mergedIntoId`, issues already merged into it are
re-pointed (no chains), and a merge history row and an audit row are written. The canonical issue's
reads combine the whole group (comments, solutions, images, referrals, timeline), counting each
user once. Writes to a merged issue return `409 ISSUE_MERGED` with the canonical id. Followers of
both issues are notified.

**Dashboard.** Published = approved and not merged. Reported resolution time = `resolvedAt −
publishedAt` (average and median, in hours), labelled as recorded by VoiceUp admins.

## Security

- Argon2id password hashing; equal responses and timing for wrong password and unknown email.
- HS256 JWT with issuer check and short expiry; the user and role are loaded from the database on
  every request, so role changes and deleted accounts apply immediately.
- Zod validation of every body, query and path parameter; unknown fields are rejected on writes.
- Explicit `select` lists: password hashes and emails never appear in public responses.
- Helmet headers, CORS allowlist, 100 KB JSON limit, global/auth/write rate limits.
- Uploads: images only, detected from file bytes (the client's type and name are ignored), 5 MB,
  stored in the database, served only through a permission-checked endpoint with `nosniff`.
- Generic 500 responses; details go to the server log only. Logs never contain bodies or tokens.
- Audit log for every sensitive admin action.

## Known limitations (by design for this version)

- Access tokens cannot be revoked before they expire (no refresh tokens, no server-side sessions).
- Rate limits are in-memory, suitable for a single server instance.
- Notifications are in-app only (no email).
- Uploaded images are stored in the database (`MediaAttachment.data`), so they survive
  redeploys; they count toward the database size.
- There is no way to block a user account yet (the `User` model has no status field).
