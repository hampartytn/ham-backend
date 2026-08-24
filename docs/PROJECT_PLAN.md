# ham-backend — Project Plan

**Project name:** ham-backend  
**Platform:** HAM Job & Worker Welfare Platform  
**Document type:** Backend foundation plan  
**Status:** Planning complete (Phase 0 Done)  
**Date:** 2026-08-24  
**Scope of this phase:** Documentation only. No application code.

Related documents:

- [ARCHITECTURE.md](ARCHITECTURE.md)
- [DATABASE_DESIGN.md](DATABASE_DESIGN.md)
- [SECURITY.md](SECURITY.md)
- [API_DESIGN.md](API_DESIGN.md)
- [IMPLEMENTATION_CHECKLIST.md](IMPLEMENTATION_CHECKLIST.md)

---

## 1. Purpose

This document records environment discovery, technology decisions, product assumptions, missing requirements, risks, and the sequential implementation roadmap for **ham-backend**.

The backend is a **single REST API** that will serve:

- React Native mobile app (primarily employees/workers)
- Next.js web app for employees
- Employer portal
- Admin panel
- Future clients or services

Do not create separate backends per client. Do not introduce microservices in the initial version.

---

## 2. Product context

ham-backend supports a Tamil Nadu-focused Job and Worker Welfare Platform. It is not a traditional job portal. It combines:

1. Job discovery and applications for workers
2. Employer registration and job posting
3. Worker skill and availability discovery for employers (privacy-constrained)
4. Worker welfare services (future; placeholder in v1)
5. Location-based legal support discovery
6. Future insurance-related services (content/placeholder in v1)
7. Optional political party membership journey (“HAM”) requiring **explicit consent after identity verification**
8. Administrative management and moderation

Primary users: migrant and blue-collar workers, employers, administrators, and super administrators.

Frontends support Tamil, English, and Hindi. The backend stores a preferred language and localizes content where the content itself is localized (for example legal-support names/categories). Job posts are stored in the author’s language. v1 does not auto-translate.

The platform must remain usable for people with varying digital literacy: collect minimum data, keep errors generic and safe, and avoid exposing internal complexity.

---

## 3. Environment and compatibility discovery

Inspected on 2026-08-24 on the development machine.

| Tool | Installed | Assessment |
| --- | --- | --- |
| Node.js | **v22.23.2** (Maintenance LTS “Jod”) | Compatible. Meets NestJS 11 (`>= 20`) and Prisma 7.9.1 (`^20.19 \|\| ^22.12 \|\| >=24.0`). |
| npm | **10.9.8** | Compatible. Selected package manager. |
| pnpm | Not installed | Do not introduce unless later requested. |
| yarn | Not installed | Do not introduce unless later requested. |
| PostgreSQL | **18** (development database server, pgAdmin) and **17.10** (`psql` client / second local service) | Compatible. Development uses PostgreSQL **18**. Database name: `ham_backend`. |
| Existing ham-backend source | None | Greenfield. HAM workspace had no reusable backend/frontend code at planning time. |

### Runtime recommendation

| Option | Status (as of 2026-08-24) | Use |
| --- | --- | --- |
| Node.js **24 LTS (Krypton)** | Active LTS, EOL 2028-04-30 | **Recommended for production and CI** (longer support window). |
| Node.js **22.23.2** | Maintenance LTS, EOL 2027-04-30 | **Acceptable now.** Current machine is on this version. Phase 1 may proceed on Node 22. |
| Node.js 20 | EOL since 2026-03-24 | Do not use. |
| Node.js 26 | Current, not LTS until 2026-10-28 | Do not target for production. |

`package.json` engines (to set in Phase 1):

```json
"engines": {
  "node": "^22.12.0 || >=24.0.0",
  "npm": ">=10.0.0"
}
```

Do not add Docker/Postgres infrastructure. Use the existing PostgreSQL **18** server via `DATABASE_URL`. On this machine PostgreSQL 18 typically listens on port **5433** (17 on **5432**). Always copy host and port from the pgAdmin server where `ham_backend` was created.

---

## 4. Selected stack

Versions below are the **stable production-appropriate** pins verified on 2026-08-24. Patch updates within the same major may be taken at implementation time if they remain stable and compatible. Do not use beta, RC, nightly, experimental, or deprecated packages.

| Layer | Choice | Pin / range | Official basis |
| --- | --- | --- | --- |
| Language | TypeScript, strict | Nest CLI `--strict` | Nest first steps |
| Framework | NestJS | **11.2.1** (`@nestjs/core` latest stable; `engines.node: >= 20`) | [docs.nestjs.com/first-steps](https://docs.nestjs.com/first-steps), npm `@nestjs/core@11.2.1` |
| CLI | `@nestjs/cli` | **11.x** (latest 11.0.24 at planning) | npm |
| HTTP adapter | Express (default) | Nest 11 / Express 5 | Nest first steps |
| Database | PostgreSQL | **18** (local pgAdmin server; database `ham_backend`) | Product requirement |
| ORM | Prisma | **7.9.1** + `@prisma/client@7.9.1` + `@prisma/adapter-pg` + `pg` | npm `prisma@7.9.1`; [Prisma NestJS recipe](https://docs.nestjs.com/recipes/prisma); [Prisma 7 + Nest 11 guide](https://www.prisma.io/blog/nestjs-prisma-rest-api-7D056s1BmOL0) |
| API | REST JSON, URI versioning | `/api/v1` | Nest versioning docs |
| Auth tokens | JWT access + rotating refresh | `@nestjs/jwt` 11.x | Nest authentication docs |
| Password hashing | Argon2id | npm `argon2` | Nest hashing docs allow bcrypt or argon2; OWASP prefers Argon2id for new systems |
| Validation | DTO + class-validator + class-transformer | Nest `ValidationPipe` | [Nest validation](https://docs.nestjs.com/techniques/validation) |
| Config | `@nestjs/config` | **4.x** (Nest 11 companion) | Nest 11 migration guide |
| Rate limiting | `@nestjs/throttler` | **6.x** | Official Nest rate-limiting package |
| Health | `@nestjs/terminus` | **11.1.x** | npm `@nestjs/terminus@11.1.1` |
| API docs | `@nestjs/swagger` | **11.x** (11.4.6 at planning) | npm; peer `@nestjs/common ^11` |
| Security headers | `helmet` | latest stable 8.x at implementation | Nest Helmet docs |
| Logging | `nestjs-pino` + pino redaction | latest stable compatible with Nest 11 | Structured JSON requirement |
| Tests | Jest + Supertest | Nest CLI default | Nest testing |

Prisma 7 notes that must be followed at implementation:

- Rust-free client uses **driver adapters**. PostgreSQL requires `@prisma/adapter-pg`.
- Client is generated into the project (not only `node_modules`).
- `prisma.config.ts` is the Prisma 7 config file.
- Nest is CommonJS: Prisma generator must set `moduleFormat = "cjs"` so the generated client works with Nest.

---

## 5. Major technical decisions

Each decision includes why, alternatives, and trade-offs.

### D1. Single modular monolith

- **Decision:** One NestJS application, modular monolith.
- **Why:** One API contract for all clients; simpler operations, transactions, and authorization; no genuine scale requirement for microservices.
- **Alternatives:** Per-client backends; microservices per domain.
- **Trade-offs:** A large codebase in one repo. Mitigated by module boundaries. Splitting later is possible if a domain independently needs scale.

### D2. NestJS 11 + TypeScript strict + Express

- **Decision:** NestJS 11.2.1, `nest new ham-backend --strict`, Express adapter.
- **Why:** Latest stable Nest. Official Node `>= 20`. Express is default and has the widest Helmet, Swagger, and Passport coverage.
- **Alternatives:** Nest 10 (older); Fastify (higher throughput, more plugin/CSP friction with Swagger/Helmet).
- **Trade-offs:** Express 5 is not the fastest Node HTTP stack. Throughput is not the v1 bottleneck.

### D3. Prisma 7.9.1, not Prisma 8, not TypeORM

- **Decision:** Prisma 7.9.1 with PostgreSQL adapter.
- **Why:** Stable, type-safe, first-class migrations, official Nest recipe, Prisma 7 + Nest 11 production guide exists.
- **Alternatives considered:**
  - **Prisma 8:** Release Candidate as of 2026-08-24. Rejected (not stable).
  - **TypeORM:** Native Nest support, but weaker migration/type story for this team.
  - **Sequelize:** Less TypeScript-native.
  - **Drizzle:** Lean, but smaller Nest ecosystem and less official documentation.
- **Trade-offs:** Prisma 7 requires driver adapters and CJS generator config. Complex SQL (for example advanced geo) may need `$queryRaw` later. Acceptable.

### D4. REST `/api/v1`, not GraphQL

- **Decision:** REST JSON with Nest URI versioning, global prefix `api`, default version `1`. Health routes are version-neutral.
- **Why:** Product specification. Simple for mobile, web, employer, and admin clients.
- **Alternatives:** GraphQL; header versioning.
- **Trade-offs:** Some over/under-fetching. DTOs and pagination keep payloads bounded.

### D5. Phone as unique identifier; password login and OTP login in v1

- **Decision (confirmed 2026-08-24):** E.164 phone is the unique login identifier. Email is optional. v1 supports **phone + password** and **phone OTP** login.
- **Why:** Workers may lack email. OTP supports low digital-literacy and passwordless use. Password supports employers/admins and returning users.
- **Alternatives:** Password-only; OTP-only.
- **Trade-offs:** Two auth paths, OTP provider dependency, stricter rate limits. Mitigated by a messaging adapter (mock in development).

### D6. JWT access + hashed rotating refresh tokens; Bearer for all clients in v1

- **Decision:** Short-lived JWT access tokens. Opaque refresh tokens stored hashed server-side, rotated on every use, family revoked on reuse. Transport: `Authorization: Bearer` for all clients in v1.
- **Why:** One contract for React Native and web. Refresh rotation limits stolen-token lifetime. Server-side hash allows revocation.
- **Alternatives:** Sessions only; HttpOnly cookies for web + Bearer for mobile (dual transport).
- **Trade-offs:** XSS on web can steal Bearer tokens. Documented as a future web cookie option. Mobile must use platform-secure storage, never AsyncStorage, for tokens (client concern).

### D7. Argon2id for password hashing

- **Decision:** npm `argon2`, Argon2id.
- **Why:** Nest documents bcrypt or argon2. OWASP ranks Argon2id first for new systems. Memory-hard.
- **Alternatives:** bcrypt (Nest example); `@node-rs/argon2`; Node `crypto.argon2` (weaker password-hashing UX).
- **Trade-offs:** Native binary. If a target host cannot build/load `argon2`, documented fallback is bcrypt with a rehash-on-login path. Tune memory/time so login stays acceptable under throttling.

### D8. Super Admin role from day one; admin permissions for high-risk actions

- **Decision:** Roles `EMPLOYEE | EMPLOYER | ADMIN | SUPER_ADMIN`. ADMIN uses an explicit permission list. SUPER_ADMIN has all admin permissions plus `admins.manage`.
- **Why:** Spec recommends Super Admin for privileged operations. Avoid a generic RBAC engine.
- **Alternatives:** Single admin role; full Casbin/CASL matrix.
- **Trade-offs:** Permission list is code-defined. Sufficient for v1.

### D9. Identity verification adapter + mock only

- **Decision:** `IdentityVerificationProvider` interface. Development/test uses a mock. No real Aadhaar/eKYC in v1 implementation until legal and provider confirmation.
- **Why:** UIDAI online eKYC is restricted to authorized AUA/KUA/Sub-KUA entities. Simulating official Aadhaar verification is prohibited by the spec.
- **Alternatives:** Skip verification tables until a provider is chosen (rejected: onboarding flow needs the abstraction now).
- **Trade-offs:** Production identity verification is blocked on legal/provider work. Schema stores provider reference and masked result only.

### D10. HAM membership is separate from verification and never automatic

- **Decision:** `HamMembership` and `ConsentRecord` are independent of `VerificationRequest`. Join requires an explicit API action after verification.
- **Why:** Political affiliation has legal and privacy implications. Spec forbids auto-join.
- **Trade-offs:** Extra onboarding step. Correct.

### D11. Employer payment designed but does not gate job posting in v1

- **Decision (confirmed 2026-08-24):** Payment models, adapters, and webhook/idempotency design exist. Job publish is **not** gated on payment in v1. `Organization.activationStatus` exists for a future flag, default not required.
- **Why:** Business model is not confirmed. Spec forbids selecting a payment provider until requirements are confirmed.
- **Alternatives:** Gate publish on payment (rejected for v1).
- **Trade-offs:** Employers can post without paying until a later flag is enabled.

### D12. Structured logging with nestjs-pino; Swagger off or gated in production

- **Decision:** JSON logs, request IDs, redaction list. Swagger enabled in development; production uses `SWAGGER_ENABLED=false` by default, optional basic-auth gate if temporarily enabled.
- **Why:** Spec requires structured logs and protected docs.
- **Alternatives:** Nest built-in Logger (not JSON by default); always-on Swagger (unsafe).

### D13. Offset pagination for admin/employer lists; cursor for public job feed

- **Decision:** `page`/`limit` (default 20, max 50) for admin and employer lists. Cursor `(publishedAt, id)` for public job browse.
- **Why:** Admin lists need page numbers. Job feed can be deep and must stay stable.
- **Alternatives:** Cursor everywhere (worse for admin UIs); offset everywhere (slow/unstable deep job pages).

---

## 6. Confirmed product defaults (this planning session)

1. Auth: phone + password **and** phone OTP in v1.
2. Employer payment: design only; **do not gate job posting**.
3. Super Admin: included.
4. Identity verification: adapter + mock only.
5. Planning documents live in `ham-backend/docs/`.

---

## 7. Assumptions

These are implementation assumptions, not invented legal or commercial rules. They are listed so they can be challenged.

1. Phone numbers are stored in E.164. India `+91` is the primary country. Other country codes may be stored but are not a product focus.
2. Email uniqueness applies only when email is present (`UNIQUE` where not null).
3. Gender and date of birth are **optional** and are not collected at registration.
4. Preferred language is `ta | en | hi` on `User`.
5. Job posts are stored in the author’s language. No machine translation in v1.
6. Legal-support names/categories may have localized strings (`ta`/`en`/`hi`).
7. Worker-search response fields are minimized (skills, district, availability, display name). **Exact public field list is a missing requirement.**
8. Notifications, Redis, queues, Elasticsearch, and insurance claims are out of v1.
9. File storage starts as a local/dev adapter with an object-storage interface. Production bucket is not selected.
10. All timestamps are `timestamptz` in UTC. Clients display local time.
11. Tamil Nadu geography only: seeded districts/cities/areas. State is implicit (Tamil Nadu), not a global geo graph.
12. v1 access tokens are Bearer for all clients. Cookie transport is a documented future option, not implemented.
13. Membership withdrawal API is designed but implementation depends on legal confirmation (see missing requirements).
14. Development seed may create a local admin only when `NODE_ENV=development` and a local-only env flag is set. No production passwords in source.

---

## 8. Missing requirements and production blockers

Do not silently invent these. Implementation of the **foundation** can proceed with adapters and mocks. Production go-live of the related feature cannot.

| ID | Topic | Blocks |
| --- | --- | --- |
| M1 | Authorized identity-verification provider, UIDAI/KUA status, legal basis | Real verification |
| M2 | DPDP Act lawful basis, retention, and purpose limitation for identity and HAM data | Production PII handling |
| M3 | Whether any full Aadhaar (or equivalent) must ever be retained. Default: **do not store**. If legally required: encryption, key management, Aadhaar Data Vault review | Verification schema extras |
| M4 | SMS/OTP vendor | Production OTP |
| M5 | Email vendor | Production email |
| M6 | Payment gateway (for example Razorpay). Not required to ungate jobs in v1 | Production payments |
| M7 | Object storage (S3-compatible vs other) | Production uploads |
| M8 | Employer worker-search field allowlist and privacy policy | Worker search response shape |
| M9 | HAM membership legal copy, terms versions, and whether withdrawal is required in v1 | Membership copy and withdraw endpoint |
| M10 | Production admin bootstrap (no committed passwords) | Production ops |
| M11 | Hosting/deployment target | Phase 12 deployment doc details |
| M12 | CAPTCHA vendor, if abuse requires it | Auth abuse extras |
| M13 | Malware scanning for uploads | Production document uploads |
| M14 | Device attestation provider (Play Integrity / App Attest) | Risk-signal evaluation |

---

## 9. Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Native `argon2` fails on a Windows/CI host | Auth blocked | Document bcrypt fallback; CI uses prebuilds; pin Node 22/24 |
| Prisma 7 CJS/ESM mismatch with Nest | Build failure | `moduleFormat = "cjs"`; follow Nest Prisma recipe |
| Treating mock KYC as real Aadhaar | Legal/compliance | Mock only; no UIDAI branding; SECURITY.md rules |
| Auto-joining HAM after KYC | Legal/privacy | Separate consent write path; tests |
| Refresh token theft on web XSS | Account takeover | Short access TTL; rotation; future HttpOnly cookies |
| Unbounded list endpoints | DB load | Required pagination; max page size; indexes |
| Logging PII | Compliance incident | Pino redaction; code review checklist |
| Payment frontend “success” trusted | Fraud | Server verification + webhooks when payments exist |
| Admin over-privilege | Data abuse | Super Admin split; permission checks; audit log |

---

## 10. Non-goals (v1)

- Separate backends for mobile, web, employer, admin
- Microservices
- Full insurance claims
- Real Aadhaar/eKYC without authorized provider and legal confirmation
- Storing full Aadhaar as a user id, PK, log field, URL param, or analytics id
- Unnecessary AI features
- Full notification/push platform
- Premature scale for millions of users
- Popular-but-unneeded packages
- Complex infrastructure (Kubernetes, service mesh, extra databases) without a requirement
- Gating employer job posting on payment

---

## 11. Configuration plan (no secrets in repo)

Create `.env.example` in Phase 1 with placeholders only. Validate at startup. Production must fail if critical secrets are missing.

### How to build `DATABASE_URL` from pgAdmin

Do not invent host, port, user, or password. Copy them from the **PostgreSQL 18** server that contains `ham_backend`.

1. In pgAdmin, select the **PostgreSQL 18** server (not 17).
2. Right-click the server → **Properties** → **Connection**.
3. Read:
   - **Host name/address** (often `localhost`)
   - **Port** (PostgreSQL 18 on this machine is commonly `5433`)
   - **Username** (often `postgres`)
4. Use the password for that server (the one you set when installing PostgreSQL 18).
5. Database name is `ham_backend`.
6. Put this line in `ham-backend/.env` (not in git):

```
DATABASE_URL=postgresql://USERNAME:PASSWORD@HOST:PORT/ham_backend?schema=public
```

Example shape (placeholders only):

```
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5433/ham_backend?schema=public
```

If the password contains `@`, `:`, `/`, `#`, or `%`, URL-encode it (for example `@` → `%40`). Do not paste the real password into docs, chat, or git.

Full `.env.example` shape:

```
NODE_ENV=development
PORT=3000
API_PREFIX=api
API_VERSION=1

DATABASE_URL=postgresql://USER:PASSWORD@localhost:5433/ham_backend?schema=public

JWT_ACCESS_SECRET=replace-with-long-random
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_SECRET=replace-with-different-long-random
JWT_REFRESH_EXPIRES_IN=14d
JWT_REFRESH_COOKIE_ENABLED=false

CORS_ORIGINS=http://localhost:3001,http://localhost:3002

SWAGGER_ENABLED=true
SWAGGER_PATH=docs
SWAGGER_USER=
SWAGGER_PASSWORD=

LOG_LEVEL=info
LOG_REDACT=password,passwordHash,accessToken,refreshToken,authorization,aadhaar,otp,secret,cardNumber

THROTTLE_TTL_MS=60000
THROTTLE_LIMIT=100
THROTTLE_AUTH_TTL_MS=60000
THROTTLE_AUTH_LIMIT=10

IDENTITY_PROVIDER=mock
SMS_PROVIDER=mock
EMAIL_PROVIDER=stub
PAYMENT_PROVIDER=stub
FILE_STORAGE_PROVIDER=local
FILE_STORAGE_LOCAL_DIR=./storage
FILE_MAX_BYTES=2097152

SEED_DEV_ADMIN=false
SEED_DEV_ADMIN_PHONE=
SEED_DEV_ADMIN_PASSWORD=
```

Production must not boot if `JWT_*_SECRET` is missing, shorter than 32 characters, or equal to example values, or if `DATABASE_URL` is missing.

---

## 12. Testing strategy (from the start)

Unit tests (critical logic):

- Auth service (password verify, OTP consume, refresh rotation, reuse detection)
- Authorization guards (role, permission, ownership)
- Job application uniqueness and status transitions
- Membership consent (never auto-join)
- Payment state machine (when implemented)
- Verification status transitions

Integration/e2e:

- Register, password login, OTP login, refresh, logout
- Suspended account cannot access protected routes
- Employee apply; duplicate apply returns conflict
- Employer cannot edit another employer’s job
- Admin routes forbidden to employee/employer
- Unauthenticated access returns 401
- Validation errors are shaped consistently

Security/negative cases are required, not optional.

---

## 13. Final repository README outline (Phase 12)

When Phase 12 runs, the product README at `ham-backend/README.md` must include:

1. Project overview
2. Architecture overview (link ARCHITECTURE.md)
3. Technology stack and pinned versions
4. Prerequisites (Node 22.12+ or 24 LTS, npm 10+, PostgreSQL 18, pgAdmin optional)
5. Environment setup (copy `.env.example`)
6. Database setup (create empty DB in existing Postgres)
7. Installation (`npm ci`)
8. Migration instructions (`npx prisma migrate deploy` / `migrate dev`)
9. Running the development server
10. Testing instructions
11. API documentation (Swagger path; production disabled)
12. Security notes (link SECURITY.md; never commit secrets)
13. Project structure
14. Known limitations
15. Future improvements

This planning folder’s [README.md](README.md) is an index only, not the product README.

---

## 14. Implementation roadmap

See [IMPLEMENTATION_CHECKLIST.md](IMPLEMENTATION_CHECKLIST.md) for the sequential sheet.

| Phase | Name | Status |
| --- | --- | --- |
| 0 | Discovery and architecture | **Done** |
| 1 | Project foundation | **Done** |
| 2 | Database | NOT STARTED |
| 3 | Security foundation | NOT STARTED |
| 4 | Authentication | NOT STARTED |
| 5 | Authorization and users | NOT STARTED |
| 6 | Jobs and applications | NOT STARTED |
| 7 | Onboarding and verification | NOT STARTED |
| 8 | HAM membership | NOT STARTED |
| 9 | Legal support | NOT STARTED |
| 10 | Payments (schema/adapter; no job gating) | NOT STARTED |
| 11 | Admin APIs | NOT STARTED |
| 12 | Quality and delivery | NOT STARTED |

**Rule:** Implement only the requested phase or task. Do not automatically continue to the next phase.

---

## 15. Stop condition

Planning documents are complete.

Do **not** run `nest new`, install application packages, create Prisma schema, or implement Phase 1 until an explicit instruction such as:

- “Implement Phase 1”
- “Implement Step 3”
- “Continue with authentication”
- “Implement only the database foundation”
- “Update the plan”
