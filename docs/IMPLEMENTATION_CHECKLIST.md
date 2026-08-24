# ham-backend — Implementation Checklist

**Project name:** ham-backend  
**Sheet status:** Phase 0 complete · Phase 1 complete · Phase 2 complete · Phase 3 complete  
**Date:** 2026-08-24

Related: [PROJECT_PLAN.md](PROJECT_PLAN.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [DATABASE_DESIGN.md](DATABASE_DESIGN.md) · [SECURITY.md](SECURITY.md) · [API_DESIGN.md](API_DESIGN.md) · [SECURITY_REVIEW.md](SECURITY_REVIEW.md) · [DEPLOYMENT.md](DEPLOYMENT.md) · [API_REVIEW.md](API_REVIEW.md)

This is the sequential implementation sheet. Each task is small enough to implement and verify independently.

---

## How to use this sheet

1. Implement **only** the phase or task that was explicitly requested.
2. Do **not** automatically start the next phase.
3. After a task is done: set **Status** to `Done`, note what was validated, and stop if that was the requested scope.
4. If blocked by a missing requirement (PROJECT_PLAN M1–M14), record the block instead of inventing a risky default.
5. Do not refactor unrelated working code.
6. Do not implement application code under Phase 0 (already complete).

**Status values:** `Done` · `NOT STARTED` · `Blocked`

---

## Phase 0 — Discovery and architecture

**Phase status: Done**

### P0-T1 — Inspect Node.js and package manager environment

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | None |
| Deliverables | Versions recorded in PROJECT_PLAN.md §3 |
| Acceptance | Node, npm, PostgreSQL client, and unused managers documented |

**Result:** Node **v22.23.2**, npm **10.9.8**, pnpm/yarn not installed, `psql` **PostgreSQL 17.10**. Development database server is **PostgreSQL 18** (database `ham_backend`). Node 22 is compatible; Node 24 LTS recommended for production/CI.

### P0-T2 — Verify stable compatible NestJS version

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P0-T1 |
| Deliverables | NestJS 11.2.1 selected in PROJECT_PLAN.md |
| Acceptance | Latest stable Nest confirmed against official docs and npm; Node `>= 20` engines recorded |

**Result:** `@nestjs/core@11.2.1` (2026-08-14). Docs: Node `>= 20`. CLI 11.x.

### P0-T3 — Verify PostgreSQL and ORM compatibility

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P0-T2 |
| Deliverables | Prisma 7.9.1 decision; Prisma 8 RC rejected |
| Acceptance | ORM is stable, PostgreSQL-capable, Nest-documented |

**Result:** Prisma **7.9.1** + `@prisma/adapter-pg`. Prisma engines: `^20.19 \|\| ^22.12 \|\| >=24.0`. TypeORM/Sequelize/Drizzle rejected for v1.

### P0-T4 — Finalize architecture decisions

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P0-T1–T3 |
| Deliverables | ARCHITECTURE.md, SECURITY.md, API_DESIGN.md, DATABASE_DESIGN.md |
| Acceptance | Modular monolith, roles, adapters, auth methods, payment non-gating, and token transport decided |

**Result:** See those documents. Confirmed: phone+password **and** OTP; payment **does not** gate jobs; Super Admin included; Bearer for all clients in v1.

### P0-T5 — Create planning documentation

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P0-T4 |
| Deliverables | Six planning docs + docs README index under `ham-backend/docs/` |
| Acceptance | Documents exist, cross-reference, checklist is sequential |

**Result:** This file and siblings in `ham-backend/docs/`.

---

## Phase 1 — Project foundation

**Phase status: Done** (2026-08-24)

Runtime used: Node.js **v24.19.0** via nvm (`nvm use 24.19.0`). Node **22.23.2** remains installed. NestJS **11.2.1**.

### P1-T1 — Initialize the NestJS project

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P0-T5 |
| Deliverables | `ham-backend` Nest app named **ham-backend**; `package.json` name `ham-backend`; npm lockfile |
| Acceptance | `nest new ham-backend --strict` (or equivalent in existing folder without overwriting `docs/`); `npm run start` serves default route; Node engines field set to `^22.12.0 \|\| >=24.0.0` |

**Result:** Scaffolded with `@nestjs/cli@11 --strict` into a temp folder and merged into `ham-backend` without overwriting `docs/`. `engines.node` is `^22.12.0 || >=24.0.0`. `npm run start` serves `/health` and `/ready`.

### P1-T2 — Configure strict TypeScript

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P1-T1 |
| Deliverables | `tsconfig` with `strict` true (and Nest strict defaults) |
| Acceptance | `strict`/`noImplicitAny`/`strictNullChecks` enabled; `npm run build` succeeds |

**Result:** `tsconfig.json` has `strict`, `noImplicitAny`, and `strictNullChecks`. `npm run build` succeeds.

### P1-T3 — Configure linting and formatting

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P1-T1 |
| Deliverables | ESLint + Prettier scripts from Nest scaffold, working `lint` and `format` |
| Acceptance | `npm run lint` and `npm run format` run without requiring disabled rules as a shortcut |

**Result:** `npm run format` and `npm run lint` succeed on Phase 1 sources.

### P1-T4 — Configure environment validation

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P1-T1 |
| Deliverables | `.env.example` (no secrets), `@nestjs/config` 4.x, boot-time validate, fail-closed production |
| Acceptance | Missing `DATABASE_URL` or short JWT secret in a production-like `NODE_ENV` prevents boot; `.env` gitignored |

**Result:** `@nestjs/config@4.0.4` with class-validator `validateEnv`. Production placeholder secrets refused. `.env` is gitignored. Unit tests cover missing URL, short JWT, and production fail-closed.

### P1-T5 — Add health endpoint

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P1-T4 |
| Deliverables | `@nestjs/terminus`; `GET /health` liveness; `GET /ready` (DB check may stub until Phase 2) |
| Acceptance | `/health` returns 200 `{ status: "ok" }`; no secrets in body |

**Result:** Verified live: `GET /health` → `{ "status": "ok" }`; `GET /ready` → `{ "status": "ok", "checks": { "database": "skipped" } }`. Database ping deferred to Phase 2.

### P1-T6 — Establish module structure

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P1-T1 |
| Deliverables | `src/config`, `src/common` (minimal), `src/modules/health`; `app.module.ts` wiring |
| Acceptance | Structure matches ARCHITECTURE.md for Phase 1 only; **no** empty domain modules for jobs/payments yet |

**Result:** Phase 1 folders only (`config`, `common/constants`, `common/middleware`, `modules/health`). No jobs/payments/auth modules. Global prefix `api` + URI version `1`; health routes excluded.

---

## Phase 2 — Database

**Phase status: Done** (2026-08-24) — PostgreSQL **18** at `localhost:5433`, database `ham_backend`

### P2-T1 — Design ER model in Prisma schema

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P1-T6, DATABASE_DESIGN.md |
| Deliverables | `prisma/schema.prisma` covering identity, profiles, skills, jobs, applications, verification, membership, legal, geo, payments, files, welfare, audit |
| Acceptance | Models match DATABASE_DESIGN.md; no full Aadhaar field; HAM tables separate from verification |

**Result:** `prisma/schema.prisma` has the documented models. No Aadhaar column. `HamMembership` / `ConsentRecord` are separate from `VerificationRequest` (`maskedIdentity` only).

### P2-T2 — Create ORM schema configuration

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P2-T1 |
| Deliverables | `prisma.config.ts`; generator `moduleFormat = "cjs"`; `PrismaService` with `PrismaPg` adapter |
| Acceptance | Client generates; Nest boots and connects using `DATABASE_URL` only |

**Result:** Prisma **7.9.1**, `prisma.config.ts` reads `DATABASE_URL` from env, generator `moduleFormat = "cjs"` output `src/generated/prisma`. `PrismaService` uses `PrismaPg`. Live Nest boot connected to PostgreSQL 18 `ham_backend`.

### P2-T3 — Define constraints and indexes

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P2-T1 |
| Deliverables | Uniques and indexes from DATABASE_DESIGN.md including `(employeeProfileId, jobId)` |
| Acceptance | Schema includes documented uniques/indexes; each important index has a comment or is listed in a short schema note |

**Result:** Includes `JobApplication (employeeProfileId, jobId)` unique. SQL-only indexes in `20260824120000_init`: verification provider-ref partial unique, GeoCoverage `COALESCE` unique, job feed `(status, published_at DESC, id DESC)`, payment provider-order partial unique, email partial unique. Listed at the bottom of `schema.prisma`.

### P2-T4 — Run initial migration

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P2-T2, P2-T3, local Postgres |
| Deliverables | Initial Prisma migration applied to a **new** empty database |
| Acceptance | `npx prisma migrate dev` (dev) succeeds; tables exist in pgAdmin; no `migrate reset` on shared DBs |

**Result:** `npx prisma migrate deploy` applied `20260824120000_init` to PostgreSQL 18 database `ham_backend` (`localhost:5433`). `migrate reset` was not used. Refresh pgAdmin to see tables.

### P2-T5 — Add development seed data

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P2-T4 |
| Deliverables | Seed: skill catalog, TN districts (and practical cities/areas), welfare COMING_SOON; optional admin only if `SEED_DEV_ADMIN=true` and development |
| Acceptance | `prisma db seed` is idempotent enough for local use; no production passwords in git |

**Result:** `npx prisma db seed` succeeded. Skills, 38 TN districts, practical cities/areas, welfare `COMING_SOON`, support categories. Dev admin was **not** seeded (`SEED_DEV_ADMIN=false`). No production passwords in git. `.env` remains gitignored.

### P2-T6 — Wire readiness to database

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P2-T2, P1-T5 |
| Deliverables | `/ready` pings Postgres |
| Acceptance | Stop DB → `/ready` 503; start DB → 200 |

**Result:** Live `GET /ready` → **200** `{ "status": "ok", "checks": { "database": "up" } }`. Live `GET /health` → **200** `{ "status": "ok" }`. Unit/e2e already covered ping-down → 503. Postgres 18 was not stopped during this check.

---

## Phase 3 — Security foundation

**Phase status: Done** (2026-08-24)

### P3-T1 — Global validation

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P1-T6 |
| Deliverables | Global `ValidationPipe` whitelist + forbidNonWhitelisted + transform |
| Acceptance | Extra body fields return 400; DTOs required on a sample POST |

**Result:** `setupApp` applies `whitelist`, `forbidNonWhitelisted`, `transform`. Sample `POST /api/v1/security/sample` (`SecuritySampleDto`). Extra field `role` → 400 `VALIDATION_ERROR`.

### P3-T2 — Helmet / security headers

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P1-T1 |
| Deliverables | `helmet()` in `main.ts` |
| Acceptance | Response includes standard security headers (e.g. `X-Content-Type-Options`) |

**Result:** `helmet()` in `setupApp` (called from `main.ts`). Live `GET /health` includes `X-Content-Type-Options: nosniff`.

### P3-T3 — CORS configuration

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P1-T4 |
| Deliverables | CORS from `CORS_ORIGINS` allowlist |
| Acceptance | Disallowed origin is rejected; production does not use `*` |

**Result:** Allowlist from `CORS_ORIGINS`. `http://localhost:3001` gets `Access-Control-Allow-Origin`; `http://evil.example` does not. Production boot refuses `CORS_ORIGINS=*`.

### P3-T4 — Rate limiting

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P1-T4 |
| Deliverables | `@nestjs/throttler` global; named stricter limits reserved for auth routes (applied in Phase 4) |
| Acceptance | Exceeding global limit returns 429 `RATE_LIMITED` envelope |

**Result:** `@nestjs/throttler` 6.x with named `default` and `auth` throttlers. Global `ThrottlerGuard`. Health skipped. e2e with `THROTTLE_LIMIT=2` → 429 `{ error: { code: "RATE_LIMITED" } }`. Named `auth` limit is applied to `/api/v1/auth/*` in Phase 4.

### P3-T5 — Global exception filter

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P1-T6 |
| Deliverables | Filter producing API_DESIGN error envelope + `requestId` |
| Acceptance | Thrown `NotFoundException` matches envelope; production mode omits stack from body |

**Result:** `HttpExceptionFilter` emits `{ error: { code, message, details?, requestId } }`. Unknown route → `NOT_FOUND`. Production unexpected errors use generic message and no stack. `/ready` 503 still returns `{ status, checks }` (not the envelope). Prisma unique (`P2002`) maps to `CONFLICT`.

### P3-T6 — Logging and redaction

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P1-T4 |
| Deliverables | nestjs-pino, request id, redact list from SECURITY.md |
| Acceptance | A test log of `{ password: "x", authorization: "Bearer y" }` does not contain the secrets |

**Result:** `nestjs-pino` with SECURITY.md redact paths plus `LOG_REDACT`. Request id from `X-Request-Id`. Unit test: logged `{ password: "x", authorization: "Bearer y" }` is censored.

### P3-T7 — Audit writer skeleton

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P2-T4 |
| Deliverables | `AuditService.append` used later by admin; redacts metadata |
| Acceptance | Unit test: forbidden keys stripped before insert |

**Result:** `AuditService.append` redacts metadata (password, authorization, aadhaar, …) then `auditLog.create`. Unit test asserts forbidden keys are `[Redacted]` before insert. Not wired to admin routes yet (Phase 11).

---

## Phase 4 — Authentication

**Phase status: Done** (2026-08-24)

### P4-T1 — Registration

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P2-T4, P3-T1, P3-T5 |
| Deliverables | `POST /api/v1/auth/register`; employee/employer only; PENDING_PHONE; Argon2id if password sent |
| Acceptance | Cannot register ADMIN; duplicate phone CONFLICT/generic; passwordHash never in response |

**Result:** `POST /api/v1/auth/register` creates EMPLOYEE/EMPLOYER only (`PENDING_PHONE`) plus matching profile in one transaction. ADMIN/SUPER_ADMIN rejected by DTO. Duplicate phone → 409 `CONFLICT` “Unable to register with this phone”. No tokens until OTP verify. `passwordHash` never in the body.

### P4-T2 — OTP request and verify (register + login)

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P4-T1, SmsProvider mock |
| Deliverables | `otp/request`, `otp/verify`; hashed OTP; attempt limits |
| Acceptance | LOGIN request does not reveal account existence; expired/wrong code generic error; mock OTP not logged when `NODE_ENV=production` |

**Result:** Hashed OTP in `OtpChallenge` (SHA-256), 5 min TTL, max 5 attempts, one active challenge per `(phone, purpose)`. LOGIN/PASSWORD_RESET request always `{ data: { expiresIn: 300 } }`. Wrong/expired → 401 `INVALID_OR_EXPIRED_CODE`. `MockSmsProvider` logs OTP only when `NODE_ENV=development`.

### P4-T3 — Password login

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P4-T1 |
| Deliverables | `POST /api/v1/auth/login`; generic `INVALID_CREDENTIALS` |
| Acceptance | Wrong password and unknown phone same message/timing as practical; Argon2 verify works |

**Result:** Unknown phone and wrong password both 401 `INVALID_CREDENTIALS` with dummy Argon2 verify for unknown/OTP-only accounts. Rehash on login when parameters change.

### P4-T4 — Access token

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P4-T2 or P4-T3 |
| Deliverables | JWT access 15m; payload `sub` + `role` |
| Acceptance | Protected sample route 401 without token; 200 with valid token |

**Result:** HS256 access JWT, 15m, payload `sub` + `role` (no phone). Protected sample `GET /api/v1/auth/session` (not `/me`, which is Phase 5). Global `JwtAuthGuard` + `@Public()`.

### P4-T5 — Refresh token rotation

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P4-T4 |
| Deliverables | Hashed refresh rows; rotate on refresh; reuse revokes family |
| Acceptance | Refresh returns new pair; old refresh 401; reused revoked token revokes family (test) |

**Result:** Opaque refresh (32 bytes), SHA-256 `tokenHash`, 14d, rotation via `familyId` / `replacedByTokenId`. Reuse of a revoked token revokes the family and records `AuthEvent` `REFRESH_REUSE`.

### P4-T6 — Logout / revocation

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P4-T5 |
| Deliverables | `POST /api/v1/auth/logout`; optional all devices |
| Acceptance | After logout, refresh fails; access expires naturally |

**Result:** Logout accepts Bearer and/or refresh body. Refresh fails after logout; access JWT remains valid until expiry (`GET /auth/session` still 200).

### P4-T7 — Account status checks

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P4-T4 |
| Deliverables | Guard rejects SUSPENDED/BLOCKED/deleted |
| Acceptance | Suspended user with valid JWT gets 403 `ACCOUNT_SUSPENDED` |

**Result:** `AccountStatusGuard` reloads the user from DB. SUSPENDED → 403 `ACCOUNT_SUSPENDED`; BLOCKED → `ACCOUNT_BLOCKED`; `deletedAt` / `PENDING_PHONE` → 401. Password login after verify also returns those 403 codes.

### P4-T8 — Password set / reset

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P4-T2 |
| Deliverables | `password/set`, `password/reset` via OTP reset token |
| Acceptance | Reset token single-use; set password requires current password if hash exists |

**Result:** `password/set` requires `currentPassword` when a hash exists. PASSWORD_RESET OTP verify returns a short-lived single-use `resetToken` stored as a hashed `OtpChallenge` (not a session). Reset does not auto-login and revokes refresh families.

### P4-T9 — Auth throttling

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P3-T4, P4-T3 |
| Deliverables | Stricter limits on login/otp/refresh |
| Acceptance | Burst login returns 429 |

**Result:** Auth controller skips the `default` throttler so named `auth` limits apply. Burst login e2e with `THROTTLE_AUTH_LIMIT=2` → 429 `RATE_LIMITED`.

### P4-T10 — Authentication tests

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P4-T1–T8 |
| Deliverables | Unit + e2e: register, both logins, refresh, reuse, logout, negative cases |
| Acceptance | Tests pass in CI-local; security cases included |

**Result:** Unit tests for hashing, OTP lockout, JWT public skip, account status, mock SMS production logging. Live-DB e2e for register, OTP register/login, password login, refresh reuse, logout, suspend, password set/reset, auth throttle. Health remains public. e2e uses `node --experimental-vm-modules` so Prisma 7’s query compiler can load under Jest.

---

## Phase 5 — Authorization and users

**Phase status: Done** (2026-08-24)

### P5-T1 — Roles and permissions

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P4-T4, P2-T4 |
| Deliverables | Role enum guards; AdminUserPermission; SUPER_ADMIN implicit all |
| Acceptance | EMPLOYEE cannot hit a `@Roles(ADMIN)` route |

**Result:** Global `RolesGuard` + `@Roles()`. SUPER_ADMIN satisfies ADMIN routes. EMPLOYEE/EMPLOYER → 403 `FORBIDDEN` on `GET /api/v1/admin/session`. `PermissionsGuard` + `@RequirePermissions()`; SUPER_ADMIN bypasses rows; ADMIN needs `AdminUserPermission`.

### P5-T2 — Guards composition

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P5-T1, P4-T7 |
| Deliverables | Jwt + Roles + Permissions + @Public + @CurrentUser |
| Acceptance | Public health still public; admin route forbidden to employer |

**Result:** Guard order: Throttler → JWT → AccountStatus → Roles → Permissions. Health remains `@Public()`. Employer cannot call admin or employee routes.

### P5-T3 — Ownership helpers

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P5-T2 |
| Deliverables | Shared helpers/services to assert resource ownership |
| Acceptance | Unit tests for “same org” / “same user” true/false |

**Result:** `isSameUser` / `isSameOrganization` plus assert helpers that 404 on mismatch. Unit tests cover true/false and missing org ids.

### P5-T4 — Employee profile

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P5-T2, geo/skills seed |
| Deliverables | GET/PATCH profile, skills replace, image upload (local storage) |
| Acceptance | Cannot patch `role`; other user’s profile 404/403 |

**Result:** `GET/PATCH /api/v1/employee/profile`, `PUT/GET /employee/skills`, `POST /employee/profile/image`. Extra `role` rejected. Unknown district/skill → 400. Images: magic-byte jpeg/png/webp, 2 MiB, local `FileStorageProvider`. Other roles get 403 on employee routes.

### P5-T5 — Employer profile and organization

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P5-T2 |
| Deliverables | Employer profile + PUT organization |
| Acceptance | Employer A cannot update employer B’s organization |

**Result:** `GET/PATCH /employer/profile`, `PUT /employer/organization` create-or-update caller’s org only. Extra `organizationId` forbidden. Two employers get distinct org ids; A’s PUT does not change B’s org.

### P5-T6 — Me, catalog, geo

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P5-T4, P2-T5 |
| Deliverables | `GET /me`, skills, categories, districts/cities/areas |
| Acceptance | Localized names follow `preferredLanguage`; PATCH me cannot set role |

**Result:** `GET/PATCH /api/v1/me` (no role/phone/accountStatus writes). Onboarding flags from profile completeness, latest verification, HAM membership. `GET /skills`, `/skill-categories`, `/geo/districts` (+ cities/areas) use preferred language.

### P5-T7 — Admin permission seed (dev)

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P2-T5, P5-T1 |
| Deliverables | Dev admin receives permissions when seeded |
| Acceptance | Only when seed flag set; not in production seed |

**Result:** `seedDevAdmin` still requires `SEED_DEV_ADMIN=true` and `NODE_ENV=development`. SUPER_ADMIN seed inserts no permission rows (implicit all). ADMIN seed would receive assignable permissions except `admins.manage`.

---

## Phase 6 — Jobs and applications

**Phase status: Done** (2026-08-24)

### P6-T1 — Employer job CRUD

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P5-T5 |
| Deliverables | Create, list own, get, patch, publish, close |
| Acceptance | Ownership enforced; cannot publish another org’s job; payment **not** required |

**Result:** `POST/GET/PATCH /api/v1/employer/jobs` plus publish/close. Caller’s organization only (404 otherwise). Create without org → 409. Publish does not check payment. CLOSED jobs cannot be edited.

### P6-T2 — Browse / search / filter

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P6-T1 |
| Deliverables | Cursor job feed; filters district/skill/jobType; only PUBLISHED |
| Acceptance | Draft jobs hidden from employees; max limit 50; invalid sort rejected |

**Result:** `GET /api/v1/jobs` cursor feed (`publishedAt DESC, id DESC`). Drafts/unpublished return 404 on the public detail route. Extra `sort` → 400; `limit` max 50.

### P6-T3 — Apply for jobs

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P6-T2, employee profile |
| Deliverables | POST application |
| Acceptance | Duplicate 409; closed/draft job 409; unique constraint holds |

**Result:** `POST /api/v1/applications` EMPLOYEE. Missing job 404; draft/closed 409; duplicate unique `(employeeProfileId, jobId)` → 409. History row `SUBMITTED`.

### P6-T4 — Application management (employee)

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P6-T3 |
| Deliverables | List/get/withdraw own |
| Acceptance | Cannot read another employee’s application (404) |

**Result:** List/get/withdraw scoped to caller’s profile. Other employee’s application 404. Withdraw unless `HIRED` or already `WITHDRAWN` (409).

### P6-T5 — Employer applicant access

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P6-T3 |
| Deliverables | List applicants; patch permitted statuses; history rows |
| Acceptance | No phone in worker/applicant payload (default M8); cannot access other org’s applicants |

**Result:** `GET/PATCH /api/v1/employer/jobs/:jobId/applications`. Allowlisted employee fields only (name, skills, district, availability). Other org 404. Employer statuses `VIEWED|SHORTLISTED|REJECTED|HIRED`; `WITHDRAWN` rejected. Writes `ApplicationStatusHistory`.

### P6-T6 — Worker search

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P5-T4 |
| Deliverables | GET employer/workers allowlisted fields |
| Acceptance | No phone/DOB/identity numbers; suspended workers excluded |

**Result:** `GET /api/v1/employer/workers` offset filters district/skill/availability. Active employees only. Optional `identityVerified` from latest verification `SUCCEEDED`.

### P6-T7 — Jobs tests

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P6-T1–T6 |
| Deliverables | e2e ownership, duplicate apply, unpublished hidden |
| Acceptance | Negative tests pass |

**Result:** Unit tests for job cursor and application state. Live-DB e2e: ownership 404, unpublished hidden, extra sort/limit 400, duplicate/draft/closed apply 409, applicant/worker payloads without phone/DOB, suspended workers excluded.

---

## Phase 7 — Onboarding and verification

**Phase status: Done** (2026-08-24)

### P7-T1 — Onboarding state on GET /me

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P5-T6, P7-T3 |
| Deliverables | Derived flags: phone, profile completeness, verification, membership decision |
| Acceptance | Flags match related tables; no extra PII |

**Result:** `GET /api/v1/me` onboarding is `phoneVerified`, `profileComplete`, `identityVerified`, `hamMembershipStatus`. Derived from `phoneVerifiedAt`, profile/skills/org, latest verification `SUCCEEDED`, and `HamMembership`. No masked identity on `/me`.

### P7-T2 — Verification provider adapter

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P2-T1 |
| Deliverables | `IdentityVerificationProvider` interface; DI token |
| Acceptance | Domain service depends on interface, not a vendor SDK |

**Result:** `IDENTITY_VERIFICATION_PROVIDER` + `IdentityVerificationProvider`. `VerificationService` injects the token. v1 binds `MockIdentityVerificationProvider`.

### P7-T3 — Mock verification provider

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P7-T2 |
| Deliverables | Mock + start/me; mock complete **non-production only** |
| Acceptance | Production `NODE_ENV` rejects mock/complete; no full Aadhaar stored |

**Result:** `POST /api/v1/verification/start` (EMPLOYEE), `GET /verification/me`. `POST /verification/mock/complete` 404 when `NODE_ENV=production` even if config says otherwise. Mock returns `XXXX-XXXX-1234` only.

### P7-T4 — Verification status flow

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P7-T3 |
| Deliverables | PENDING → SUCCEEDED/FAILED; webhook signature + idempotency |
| Acceptance | Webhook without signature 401; duplicate event id does not double-apply |

**Result:** Public `POST /api/v1/verification/webhooks/:provider` verifies `X-Identity-Signature` HMAC-SHA256 of the raw body (`IDENTITY_WEBHOOK_SECRET`). Duplicate `providerEventId` returns 200 without reversing a terminal status. Webhook does not create `HamMembership`.

### P7-T5 — Sensitive data handling

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P7-T4, P3-T6 |
| Deliverables | maskedIdentity only; logs redacted |
| Acceptance | Tests assert no 12-digit Aadhaar in DB columns or log output |

**Result:** 12-digit values in `maskedIdentity` are dropped. `aadhaar` is redacted in `redactSensitive` / Pino. e2e asserts stored metadata/mask have no 12-digit Aadhaar. Webhook bodies are not stored (fingerprint only).

---

## Phase 8 — HAM membership

**Phase status: Done** (2026-08-24)

### P8-T1 — Membership information

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P7-T4 |
| Deliverables | GET membership + info (termsVersion from config) |
| Acceptance | `canJoin` false if not verified |

**Result:** `GET /api/v1/membership` returns `status`, `canJoin`, `termsVersion` (`HAM_MEMBERSHIP_TERMS_VERSION`), `identityVerified`. `canJoin` is true only when latest verification is `SUCCEEDED` and status is not `JOINED`. `GET /membership/info` returns versioned copy keys and a placeholder notice (no invented political claims). `withdrawEnabled` is false.

### P8-T2 — Explicit consent flow

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P8-T1 |
| Deliverables | join (accepted true) and decline; single transaction with ConsentRecord |
| Acceptance | Verification webhook **must not** create membership (test); join without verify 409 |

**Result:** `POST /membership/join` requires `accepted: true` and current `termsVersion`. Join/decline require identity verification. HamMembership + ConsentRecord in one transaction. Webhook success still creates no membership row.

### P8-T3 — Consent audit data

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P8-T2 |
| Deliverables | timestamp, termsVersion, action, ip/ua truncated |
| Acceptance | Consent row exists for join and decline |

**Result:** Consent rows store `occurredAt`, `termsVersion`, `action` (`JOINED`/`DECLINED`), IP (max 45), user-agent (max 255). e2e asserts a row for join and for decline.

### P8-T4 — Membership status

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P8-T2 |
| Deliverables | GET reflects JOINED/DECLINED |
| Acceptance | Second join 409 |

**Result:** GET reflects `JOINED`/`DECLINED`. Second join → 409. `GET /me` onboarding `hamMembershipStatus` follows the membership row.

### P8-T5 — Withdraw (conditional)

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P8-T4, M9 |
| Deliverables | withdraw endpoint **or** explicit NOT_ENABLED |
| Acceptance | If M9 unanswered, return not enabled; do not silently ship political withdrawal copy |

**Result:** `POST /api/v1/membership/withdraw` exists and returns 409 `NOT_ENABLED`. M9 is unanswered, so withdrawal is not performed and no political withdrawal copy is returned.

---

## Phase 9 — Legal support

**Phase status: Done** (2026-08-24)

### P9-T1 — Provider models in use

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P2-T4 |
| Deliverables | CRUD service used by admin in Phase 11; employee read in this phase |
| Acceptance | trustLevel returned; unapproved hidden from employees |

**Result:** Phase 2 `SupportProvider` / `GeoCoverage` models are used by `LegalSupportService` (`create` / `update` / `archive`). Employee `GET` list and detail return `trustLevel`. DRAFT, REJECTED, and soft-deleted providers are hidden (404 on get-by-id).

### P9-T2 — Area / category search

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P9-T1 |
| Deliverables | GET categories + providers by district/city/area |
| Acceptance | Coverage match includes district-wide rows; pagination works |

**Result:** `GET /api/v1/legal-support/categories` (Bearer, localized). `GET /providers` requires `districtId` or `cityId`/`areaId`; `categoryId` optional. District-wide coverages match city and area searches. Offset `meta.page` / `meta.limit` / `meta.total`; `limit` max 50.

### P9-T3 — Admin management (employee-facing complete; mutations in P11)

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P9-T2 |
| Deliverables | If this phase is requested without admin, read APIs only are enough |
| Acceptance | Employee cannot create providers |

**Result:** Employee-facing routes are GET only. `POST /api/v1/legal-support/providers` is 404. Employer listing providers is 403. Admin HTTP mutations stay in P11; the service CRUD is ready for that work.

---

## Phase 10 — Payments

**Phase status: Done** (2026-08-24)  
**Note:** Do not gate job posting. Provider remains stub until M6.

### P10-T1 — Provider abstraction

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P2-T1 |
| Deliverables | `PaymentProvider` + StubPaymentProvider |
| Acceptance | Jobs module does not import payment |

**Result:** `src/integrations/payment` has `PaymentProvider` + `StubPaymentProvider`. Jobs module has no payment imports (isolation unit test). Publish still does not check payment.

### P10-T2 — Payment initiation

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P10-T1 |
| Deliverables | POST initiate; server-side amount |
| Acceptance | No card fields stored; may return `NOT_ENABLED` if stub disabled |

**Result:** `POST /api/v1/payments/initiate` (EMPLOYER + org). Amount comes from `PAYMENT_EMPLOYER_ACTIVATION_PAISE` (client `amountPaise` ignored). Extra card fields → 400. `PAYMENT_STUB_ENABLED=false` or non-stub provider → 409 `NOT_ENABLED`. Checkout payload has no card/PAN/CVV.

### P10-T3 — Webhook verification

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P10-T2 |
| Deliverables | Signature check |
| Acceptance | Bad signature 401 |

**Result:** `POST /api/v1/payments/webhooks/:provider` is public, HMAC `X-Payment-Signature` (`PAYMENT_WEBHOOK_SECRET`). Bad/missing signature → 401. Fingerprint stored; raw body is not.

### P10-T4 — Idempotency

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P10-T3 |
| Deliverables | Unique providerEventId |
| Acceptance | Replayed webhook does not double-succeed a payment |

**Result:** `WebhookEvent` unique `(provider, providerEventId)`. Replay returns `{ received: true }` and does not change a terminal payment (including a later FAILED event after SUCCEEDED).

### P10-T5 — Payment status management

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P10-T4 |
| Deliverables | GET payment by id; state machine |
| Acceptance | Employer cannot read another org’s payment; frontend success ignored without webhook/status |

**Result:** `GET /api/v1/payments/:paymentId` is org-scoped (other org → 404). State: `CREATED` → `PENDING` → `SUCCEEDED` \| `FAILED` \| `CANCELLED`. No client complete route; GET stays `PENDING` until webhook. Organization `activationStatus` is not changed. Jobs remain ungated.

---

## Phase 11 — Admin APIs

**Phase status: Done** (2026-08-24)

### P11-T1 — User listing and details

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P5-T2 |
| Deliverables | GET users / users/:id; no hashes; masked identity only |
| Acceptance | EMPLOYER 403; phone visible to admin |

**Result:** `GET /api/v1/admin/users` and `GET /users/:userId` require `users.read`. Offset pagination; `q` is exact phone or email. Phone is returned. No `passwordHash`. Detail includes profile plus latest verification `status` / `maskedIdentity` / `failureCode` (no metadata). EMPLOYER → 403.

### P11-T2 — Blocking / suspension

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P11-T1, P3-T7 |
| Deliverables | POST status; audit log |
| Acceptance | Target cannot use API; actor cannot block SUPER_ADMIN unless SUPER_ADMIN |

**Result:** `POST /admin/users/:userId/status` (`users.block`) sets `ACTIVE` / `SUSPENDED` / `BLOCKED` and writes `user.status` audit. Target gets `ACCOUNT_BLOCKED` / `ACCOUNT_SUSPENDED`. Non-SUPER_ADMIN cannot change a SUPER_ADMIN (403). Cannot set a role.

### P11-T3 — Job moderation

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P6-T1 |
| Deliverables | unpublish/close; audit |
| Acceptance | Job disappears from public feed |

**Result:** `GET /admin/jobs` (`jobs.moderate`) lists non-deleted jobs including unpublished. Unpublish is `PUBLISHED` → `UNPUBLISHED`; close sets `CLOSED`. Both audit. Unpublished jobs drop out of `GET /jobs`.

### P11-T4 — Legal support management

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P9-T1 |
| Deliverables | admin create/patch/approve; audit |
| Acceptance | Unapproved not in employee list |

**Result:** Admin create/patch/approve under `/admin/legal-support/providers` (`legal.manage`). Create is always `DRAFT`. Employee directory still requires `APPROVED`. Approve is a separate POST.

### P11-T5 — Basic metrics

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P11-T1 |
| Deliverables | GET metrics counts only |
| Acceptance | No user PII arrays |

**Result:** `GET /admin/metrics` (`metrics.read`) returns numeric counts: users by role/status, jobs by status, applications last 7/30 days. No user lists.

### P11-T6 — Audit log read API

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P11-T2 |
| Deliverables | GET audit-logs with `audit.read` |
| Acceptance | Employee 403; metadata redacted |

**Result:** `GET /admin/audit-logs` (`audit.read`), offset + `actorUserId` / `action` / `targetType` / `from` / `to`. Metadata passed through `redactSensitive` on read. Employee → 403.

### P11-T7 — Super Admin manages admins

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P5-T1 |
| Deliverables | create admin; patch permissions |
| Acceptance | ADMIN without `admins.manage` cannot create admins |

**Result:** `POST /admin/admins` and `PATCH /admin/admins/:userId/permissions` require `admins.manage` (SUPER_ADMIN implicit). Creates `ADMIN` with hashed password; `admins.manage` is not assignable. ADMIN without that permission → 403.

---

## Phase 12 — Quality and delivery

**Phase status: Done** (2026-08-24)

### P12-T1 — Swagger / OpenAPI

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | Implemented routes |
| Deliverables | `/docs` with DTOs, bearer, errors; disabled in production by default |
| Acceptance | Production `SWAGGER_ENABLED=false` does not serve UI; mock-complete omitted from prod spec |

**Result:** `setupSwagger` in `app.setup.ts`. UI `/docs`, JSON `/docs-json`, bearer `bearer`, admin tag. Production enabled only if `SWAGGER_ENABLED=true` (then basic auth required). `shouldDocumentMockComplete` is false in production; path also stripped. `@ApiExcludeController` on `/security/sample`. Controllers tagged. e2e: `/docs` 200 in test; spec includes register + mock-complete; no `passwordHash` / `DATABASE_URL`; no security sample.

### P12-T2 — Tests

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | Phases actually implemented |
| Deliverables | Full unit/e2e for implemented phases; authz and negative cases |
| Acceptance | `npm test` and `npm run test:e2e` pass |

**Result:** `npm run lint` pass. `npm test` 34 suites / 63 tests. `npm run test:e2e` 10 suites / 60 tests. `npm run build` pass. Added swagger policy tests, schema PII test, health e2e OpenAPI assertions.

### P12-T3 — Security review

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P12-T2 |
| Deliverables | Checklist vs SECURITY.md; `npm audit` |
| Acceptance | No known high issues without written exception; no Aadhaar in schema |

**Result:** [SECURITY_REVIEW.md](SECURITY_REVIEW.md). No `aadhaar` column (schema comment + unit test). `npm audit`: 3 high, all `deepmerge-ts` via `prisma@7.9.1`. Written exception: do not `--force` to Prisma 6. Helmet CSP off only while Swagger is enabled.

### P12-T4 — Product README

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P1–P12 as implemented |
| Deliverables | `ham-backend/README.md` with PROJECT_PLAN.md §13 sections |
| Acceptance | New developer can run from README without secrets in git |

**Result:** README has all 15 §13 sections. `.env` remains gitignored. Run path: copy `.env.example`, `npm ci`, migrate, `start:dev`.

### P12-T5 — Deployment documentation

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | M11 hosting target |
| Deliverables | Env, migrate deploy, process, health checks |
| Acceptance | If M11 missing, document “hosting TBD” rather than inventing Kubernetes |

**Result:** [DEPLOYMENT.md](DEPLOYMENT.md). Hosting **TBD (M11)**. `npx prisma migrate deploy`, `npm run build`, `npm run start:prod` (`node dist/src/main.js`), `/health` `/ready`. No Kubernetes.

### P12-T6 — Final API review

| Field | Value |
| --- | --- |
| Status | **Done** |
| Dependencies | P12-T1 |
| Deliverables | Diff vs API_DESIGN.md; list intentional deviations |
| Acceptance | No accidental PII in examples; version prefix consistent |

**Result:** [API_REVIEW.md](API_REVIEW.md). Prefix `/api/v1` consistent; health unversioned. Extras: `GET /auth/session`, `GET /admin/session`, `GET /admin/permissions/check`, `GET /files/:fileId`, Phase 3 `POST /security/sample` (not in Swagger). Gap: `GET /welfare/:slug`. Extra codes: `NOT_ENABLED`, `INVALID_CREDENTIALS`, `INVALID_OR_EXPIRED_CODE`.

---

## Cross-cutting rules (every implementation task)

- Update this sheet’s Status to **Done** only after acceptance criteria are met.
- Run the relevant tests/lint/build for the changed phase.
- Explain briefly: what changed, what was validated, decisions/assumptions.
- **STOP** at the end of the requested scope.

---

## Current snapshot

| Phase | Status |
| --- | --- |
| 0 Discovery and architecture | **Done** |
| 1 Project foundation | **Done** |
| 2 Database | **Done** |
| 3 Security foundation | **Done** |
| 4 Authentication | **Done** |
| 5 Authorization and users | **Done** |
| 6 Jobs and applications | **Done** |
| 7 Onboarding and verification | **Done** |
| 8 HAM membership | **Done** |
| 9 Legal support | **Done** |
| 10 Payments | **Done** |
| 11 Admin APIs | **Done** |
| 12 Quality and delivery | **Done** |

**Next allowed action:** roadmap complete (Phases 0–12). Wait for an explicit further instruction. There is no Phase 13.
