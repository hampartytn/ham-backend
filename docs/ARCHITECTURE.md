# ham-backend — Architecture

**Project name:** ham-backend  
**Status:** Planning complete  
**Date:** 2026-08-24

Related: [PROJECT_PLAN.md](PROJECT_PLAN.md) · [DATABASE_DESIGN.md](DATABASE_DESIGN.md) · [SECURITY.md](SECURITY.md) · [API_DESIGN.md](API_DESIGN.md) · [IMPLEMENTATION_CHECKLIST.md](IMPLEMENTATION_CHECKLIST.md)

---

## 1. Architectural style

**Modular monolith.** One NestJS process, one PostgreSQL database, one versioned REST API.

This is the correct starting architecture: shared transactions, a single authorization model, and one contract for React Native, Next.js employee web, employer portal, and admin panel.

Do not split into microservices unless a domain independently requires different scale, isolation, or release cadence. v1 has no such requirement.

### Principles

1. Modular monolith
2. Separation of concerns
3. Thin controllers
4. Business logic in services
5. Database access isolated (`PrismaService`; repositories only when a module would otherwise leak Prisma models to controllers)
6. DTO-based input boundaries
7. Do not expose database models as API contracts
8. Role-based authorization plus ownership plus business-state checks
9. Principle of least privilege
10. No duplicated business logic
11. One source of truth for critical state
12. Configuration through environment variables
13. No secrets in source control
14. Secure by default
15. Consistent error contracts
16. Pagination for large lists
17. Idempotency for payments and external webhooks
18. Extensibility without premature overengineering

---

## 2. System context

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ React Native │  │ Next.js      │  │ Employer     │  │ Admin panel  │
│ (employees)  │  │ (employees)  │  │ portal       │  │              │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       │                 │                 │                 │
       └────────────┬────┴────────┬────────┴────────┬────────┘
                    │ HTTPS JSON  │
                    ▼             ▼
              ┌─────────────────────────┐
              │      ham-backend        │
              │  NestJS 11 modular API  │
              │  /api/v1  +  /health    │
              └───────────┬─────────────┘
                          │
          ┌───────────────┼────────────────┐
          ▼               ▼                ▼
   ┌────────────┐  ┌─────────────┐  ┌──────────────┐
   │ PostgreSQL │  │ Adapters    │  │ Local/object │
   │ (existing) │  │ IDV, SMS,   │  │ file storage │
   │            │  │ email, pay  │  │              │
   └────────────┘  └─────────────┘  └──────────────┘
```

All clients use the same authentication contract in v1: `Authorization: Bearer <accessToken>`. Refresh is a separate POST body (or header), not a cookie. Cookie transport is a future web option documented in SECURITY.md.

---

## 3. Runtime topology

```
Request
  → Helmet
  → CORS allowlist
  → Request ID middleware
  → Pino HTTP logger (redacted)
  → Throttler
  → Global prefix `api` + URI version `v1`
  → ValidationPipe (whitelist, forbidNonWhitelisted, transform)
  → Auth guard (JWT unless @Public)
  → Roles / permissions / ownership / business-state guards
  → Controller (thin)
  → Service (use-case rules)
  → PrismaService or adapter
  → Exception filter → stable error envelope
```

Health routes (`/health`, `/ready`) are version-neutral and sit outside `/api/v1`. They must not expose secrets, connection strings, or dependency versions beyond what operators need.

---

## 4. Module map

Create a module when its phase starts. Do not create empty decorative folders in Phase 1.

| Module | Responsibility | Phase |
| --- | --- | --- |
| `config` | Env schema, fail-closed production boot | 1 |
| `health` | Liveness and readiness | 1 |
| `database` | `PrismaService`, pagination helpers | 2 |
| `common` | Filters, guards, interceptors, pipes, decorators | 1–3 |
| `audit` | Append-only audit writer used by admin and sensitive flows | 3 / 11 |
| `auth` | Register, password login, OTP login, refresh, logout, password reset | 4 |
| `users` | User entity services, account status | 5 |
| `employees` | Employee profile, availability | 5 |
| `employers` | Employer profile | 5 |
| `organizations` | Company record, activation fields | 5 |
| `skills` | Skill catalog, employee-skill links | 5–6 |
| `jobs` | Job CRUD, browse, search, filter | 6 |
| `applications` | Apply, list, status, uniqueness | 6 |
| `verification` | Verification requests, adapter orchestration | 7 |
| `membership` | HAM info, explicit join, consent | 8 |
| `legal-support` | Directory search and admin management | 9 |
| `payments` | Orders, status, webhook, idempotency (no job gating) | 10 |
| `admin` | User/job moderation, metrics | 11 |
| `notifications` | Optional; models only unless later requested | later |

Integrations live under `src/integrations/` and are imported by domain modules. Domain modules must not import vendor SDKs directly.

| Adapter | Interface | v1 implementation |
| --- | --- | --- |
| Identity verification | `IdentityVerificationProvider` | `MockIdentityVerificationProvider` |
| SMS/OTP | `SmsProvider` | `MockSmsProvider` (logs OTP in development only, never in production logs) |
| Email | `EmailProvider` | `StubEmailProvider` |
| Payment | `PaymentProvider` | `StubPaymentProvider` |
| File storage | `FileStorageProvider` | `LocalFileStorageProvider` |

---

## 5. Planned folder structure

```
ham-backend/
  docs/                          # this planning set
  prisma/
    schema.prisma
    migrations/
    seed.ts
  prisma.config.ts
  src/
    main.ts
    app.module.ts
    config/
      env.validation.ts
      configuration.ts
    common/
      constants/
      decorators/                # @Public, @Roles, @CurrentUser, @RequirePermissions
      filters/                   # HttpExceptionFilter
      guards/                    # JwtAuth, Roles, Permissions, AccountStatus
      interceptors/              # Transform / request-id if not middleware
      middleware/
      pipes/
      utils/                     # masking, phone normalize, redaction
      types/
    database/
      prisma.module.ts
      prisma.service.ts
      pagination.ts
    modules/
      auth/
      users/
      employees/
      employers/
      organizations/
      jobs/
      applications/
      skills/
      verification/
      membership/
      legal-support/
      payments/
      admin/
      audit/
      health/
    integrations/
      identity-verification/
      payment/
      messaging/
      email/
      storage/
  test/
    jest-e2e.json
    app.e2e-spec.ts
```

Each domain module typically contains:

- `*.module.ts`
- `*.controller.ts` (HTTP only)
- `*.service.ts` (rules)
- `dto/`
- `*.constants.ts` if needed
- `*.spec.ts`

Do not return Prisma models from controllers. Map to response DTOs.

---

## 6. Layering rules

### Controllers

- Parse HTTP, apply guards, call one service method, map to a response DTO.
- No Prisma, no password hashing, no provider SDKs.

### Services

- Own business rules and state machines.
- Call Prisma and adapters.
- Throw Nest HTTP exceptions with stable error codes (see API_DESIGN.md).

### Prisma

- All queries go through `PrismaService`.
- Parameterized by construction. Raw SQL only with bound parameters and a comment explaining why.

### DTOs

- Input DTOs use class-validator.
- Response DTOs are explicit classes for Swagger and to prevent leaking hashes, tokens, and provider payloads.

---

## 7. Identity and authorization model

### Roles

| Role | Typical client | Notes |
| --- | --- | --- |
| `EMPLOYEE` | Mobile, employee web | Worker |
| `EMPLOYER` | Employer portal | Must own organization/jobs |
| `ADMIN` | Admin panel | Requires assigned permissions for high-risk actions |
| `SUPER_ADMIN` | Admin panel | Manages admins and high-risk settings |

A user has exactly one primary role in v1 (`User.role`). Do not implement multi-role users in v1. If a person needs two hats, that is two accounts until a later requirement says otherwise.

### Permission keys (ADMIN)

Stored as rows assigned to an admin user. SUPER_ADMIN implicitly has all.

- `users.read`
- `users.block`
- `jobs.moderate`
- `legal.manage`
- `metrics.read`
- `audit.read`
- `admins.manage` (SUPER_ADMIN only)

### Four-layer check (every protected action)

1. **Authentication:** valid access token.
2. **Account state:** not `SUSPENDED`, `BLOCKED`, or soft-deleted.
3. **Role / permission:** role allowed, and admin permission present when required.
4. **Ownership:** for example employer `job.organizationId` matches the caller’s organization.
5. **Business state:** for example cannot apply to a `CLOSED` or `DRAFT` job; cannot join HAM without verified identity; cannot auto-join.

Frontend role checks are irrelevant to the API.

---

## 8. Authentication architecture

See SECURITY.md for token lifetimes, hashing, and client storage.

```
Register (phone, role, preferredLanguage, optional email, optional password)
  → User PENDING_PHONE
  → OTP challenge (purpose REGISTER)
  → Verify OTP
  → User ACTIVE (onboarding still incomplete)
  → Optional set password if not set at register
  → Issue access + refresh

Login password: phone + password → tokens
Login OTP: request OTP (purpose LOGIN) → verify OTP → tokens
Refresh: present refresh → rotate → new pair; reuse of old token revokes family
Logout: revoke current refresh family (or all sessions if requested)
```

Password hashing: Argon2id. OTP codes: hashed at rest, short TTL, attempt counter, single use.

---

## 9. Business flows

### 9.1 Employee registration and onboarding

1. Client sends preferred language (`ta` | `en` | `hi`).
2. Register with minimum data: phone, role `EMPLOYEE`, language; email optional; password optional if the user will use OTP login.
3. Phone OTP verification moves account out of `PENDING_PHONE`.
4. User may use the app with incomplete profile. Pending actions: profile photo, skills, availability, identity verification.
5. Identity verification starts through the adapter (mock in v1). Success stores provider reference + masked result. **Never stores full Aadhaar.**
6. After verified identity, client shows HAM information. User must call join (explicit consent) or skip. Verification success **must not** create membership.
7. Consent row stores timestamp, terms version, action (`JOINED` | `DECLINED` | later `WITHDRAWN` if legally required), and request metadata without secrets.

### 9.2 Employee job flow

1. Browse/search jobs (published, not deleted, filters on district/skill/type).
2. View job detail.
3. Apply once per job (`UNIQUE(employeeId, jobId)`).
4. Track own application status.
5. Update skills and availability.

### 9.3 Employer flow

1. Register as `EMPLOYER` (same auth primitives).
2. Complete organization profile.
3. Payment/activation records exist but **do not block job publish in v1**.
4. Create/edit/publish/close **own** jobs only.
5. Review applicants for own jobs; permitted status updates only.
6. Worker search returns privacy-allowlisted fields only (exact list is missing requirement M8).

Never trust a frontend “payment successful” flag.

### 9.4 Legal support flow

1. Employee selects district/city/area.
2. API returns providers covering that geography, filtered by category and approval status.
3. Response distinguishes `PLATFORM_VERIFIED` vs `PUBLIC_LISTING`.
4. Admin manages the directory.

### 9.5 Insurance and welfare

v1 exposes a small content/status API (`coming_soon` or equivalent). No claims system.

### 9.6 Admin flow

- List/filter users; view permitted details (no hashes, no full identity numbers).
- Block/suspend/restore with audit.
- Moderate jobs (unpublish, close).
- Manage legal-support listings.
- Read basic metrics.
- Read audit logs if permitted.

High-risk actions write `AuditLog`.

---

## 10. State machines

Full field lists are in DATABASE_DESIGN.md. Summary:

**User.accountStatus:** `PENDING_PHONE` → `ACTIVE` → `SUSPENDED` | `BLOCKED`. Soft-delete sets `deletedAt` and blocks login.

**User.onboardingStatus (employee):** `REGISTERED` → `PHONE_VERIFIED` → `PROFILE_INCOMPLETE` → `IDENTITY_PENDING` | `IDENTITY_VERIFIED` → `MEMBERSHIP_DECIDED`. These flags are derived from related tables where possible; persist a summary column only if it avoids expensive joins. Prefer deriving: phone verified, profile completeness, latest verification, membership decision.

**Job.status:** `DRAFT` → `PUBLISHED` → `CLOSED` | `UNPUBLISHED` (moderation). Cannot apply unless `PUBLISHED`.

**JobApplication.status:** `SUBMITTED` → `VIEWED` | `SHORTLISTED` | `REJECTED` | `WITHDRAWN` | `HIRED`. Employer can only change applicants on owned jobs. Employee can withdraw own application. History table records each change.

**VerificationRequest.status:** `PENDING` → `IN_PROGRESS` → `SUCCEEDED` | `FAILED` | `CANCELLED`.

**HamMembership.status:** `NONE` (no row) | `JOINED` | `DECLINED` | `WITHDRAWN` (if enabled). Created only from explicit consent.

**Payment.status (not gating jobs):** `CREATED` → `PENDING` → `SUCCEEDED` | `FAILED` | `CANCELLED`. Webhook is the source of truth.

---

## 11. Localization

- `User.preferredLanguage`: `ta` | `en` | `hi`.
- `Accept-Language` may be read as a hint when the user is anonymous (job browse). Authenticated requests prefer `User.preferredLanguage`.
- Localized entities (legal support names/categories, skills, geo catalogs, welfare content) store a JSON locale map (`names` / `titles` / `bodies`). Adding a language is a new key, not a new column. Jobs stay single-language author text.
- Error `message` may be a stable English string plus `code`. Clients localize by `code`. Do not build a server-side i18n catalog for every error in v1.

---

## 12. Files and uploads

Profile images and later organization documents use `FileStorageProvider`.

- Validate size and magic bytes server-side. Do not trust client MIME or filename.
- Generate object keys. Never use user filenames.
- Private by default. Public profile images may use a separate prefix or signed URLs.
- Malware scanning is a production gap (M13), not a v1 blocker for small profile images if types/sizes are tightly limited.

---

## 13. Observability and operations

- Liveness: process up.
- Readiness: PostgreSQL ping via Prisma/pg.
- Structured logs with `requestId`.
- Error monitoring: integration point only (for example Sentry DSN env). Do not add the SDK until an operator chooses a vendor.
- Environments: development, test, staging, production. Separate databases and JWT secrets.
- Migrations: Prisma Migrate. Expand-then-contract for breaking changes. No destructive production migrate without backup.

---

## 14. Testing architecture

- Unit: services and pure policy functions with mocked Prisma/adapters.
- e2e: Nest testing module + real test database (or transactional rollback). Never point e2e at production.
- Seed data for tests is distinct from development seed.

---

## 15. Future split points (do not build now)

If scale later requires it, candidate extractable modules are: notifications, payments, and identity verification. Extraction requires the adapter boundaries already planned. Do not extract in v1.
