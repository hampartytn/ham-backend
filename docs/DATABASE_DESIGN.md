# ham-backend — Database Design

**Project name:** ham-backend  
**Database:** PostgreSQL **18** (local pgAdmin-managed server)  
**Database name:** `ham_backend`  
**ORM:** Prisma 7.9.1  
**Status:** Planning complete  
**Date:** 2026-08-24

Related: [PROJECT_PLAN.md](PROJECT_PLAN.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [SECURITY.md](SECURITY.md) · [API_DESIGN.md](API_DESIGN.md)

This document is the schema plan. Connection is only via `DATABASE_URL` (see PROJECT_PLAN.md §11). Do not commit secrets.

**Development instance**

| Item | Value |
| --- | --- |
| Server | PostgreSQL 18 in pgAdmin |
| Database | `ham_backend` (empty until migrate) |
| Typical local port | `5433` (confirm in server Properties → Connection; PostgreSQL 17 on this machine is often `5432`) |
| URL | `postgresql://USERNAME:PASSWORD@HOST:PORT/ham_backend?schema=public` |

---

## 1. Conventions

| Rule | Choice |
| --- | --- |
| Primary keys | UUIDv7 (`uuid(7)` in Prisma if available; otherwise UUID). Time-sortable for pagination. Never use Aadhaar, phone, or email as PK. |
| Time | `timestamptz`, stored UTC, named `createdAt` / `updatedAt` |
| Soft delete | `deletedAt timestamptz NULL` on User, Organization, Job, SupportProvider, FileObject |
| Hard delete | RefreshToken, OtpChallenge (after TTL), expired webhook leftovers per retention |
| Money | `amount` integer in **paise** (INR). `currency` default `INR` |
| Phone | E.164 text, e.g. `+9198XXXXXXXX` |
| Enums | PostgreSQL enums via Prisma enums |
| Naming | PascalCase models, camelCase fields in Prisma; map to snake_case columns |
| Catalog copy | JSON locale map (`names` / `titles` / `bodies`), e.g. `{ "en": "...", "ta": "..." }`. Do not add `name_xx` columns. User.preferredLanguage remains `ta \| en \| hi` until product expands it. |

Referential integrity: foreign keys with explicit `onDelete`. Default: `Restrict` for ownership graphs; `Cascade` only for dependent children that cannot exist alone (JobSkill, EmployeeSkill, ApplicationStatusHistory). Soft-deleted parents remain; queries must filter `deletedAt IS NULL`.

---

## 2. Entity relationship overview

```
User 1──1 EmployeeProfile ──< EmployeeSkill >── Skill ── Category
User 1──1 EmployerProfile ──1 Organization ──< Job ──< JobSkill
User 1──< RefreshToken
User 1──< OtpChallenge
User 1──< AuthEvent
User 1──< AdminUserPermission >── (permission key)
EmployeeProfile 1──< JobApplication >── Job
JobApplication 1──< ApplicationStatusHistory
User 1──< VerificationRequest
User 1──1 HamMembership
User 1──< ConsentRecord
District 1──< City 1──< Area
SupportProvider ──< GeoCoverage >── Area/City/District
Organization 1──< Payment
Payment ── WebhookEvent (by providerEventId unique)
User 1──< AuditLog (as actor)
FileObject ── referenced by profile/org image keys
WelfareContent (standalone catalog)
```

---

## 3. Enums

```
Role                 EMPLOYEE | EMPLOYER | ADMIN | SUPER_ADMIN
AccountStatus        PENDING_PHONE | ACTIVE | SUSPENDED | BLOCKED
PreferredLanguage    ta | en | hi
Gender               MALE | FEMALE | OTHER | PREFER_NOT_TO_SAY   (optional field)
AvailabilityStatus   AVAILABLE | NOT_AVAILABLE | AVAILABLE_FROM
JobStatus            DRAFT | PUBLISHED | UNPUBLISHED | CLOSED
JobType              FULL_TIME | PART_TIME | CONTRACT | DAILY_WAGE | OTHER
ApplicationStatus    SUBMITTED | VIEWED | SHORTLISTED | REJECTED | WITHDRAWN | HIRED
VerificationStatus   PENDING | IN_PROGRESS | SUCCEEDED | FAILED | CANCELLED
MembershipStatus     JOINED | DECLINED | WITHDRAWN
ConsentAction        JOINED | DECLINED | WITHDRAWN
OtpPurpose           REGISTER | LOGIN | PASSWORD_RESET | PHONE_CHANGE
PaymentStatus        CREATED | PENDING | SUCCEEDED | FAILED | CANCELLED
ActivationStatus     NOT_REQUIRED | REQUIRED | PENDING | ACTIVE   (default NOT_REQUIRED in v1)
EmployerMembershipStatus INACTIVE | ACTIVE   (paid Employer HAM Membership; independent of verificationState)
ListingTrust         PLATFORM_VERIFIED | PUBLIC_LISTING
FileVisibility       PRIVATE | PUBLIC
AuditActorType       USER | SYSTEM
```

---

## 4. Tables

Columns marked **API-never** must never appear in JSON responses.

### 4.1 User

Identity record. Minimal PII.

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| id | uuid | PK | |
| role | Role | NOT NULL | v1 single role |
| phone | text | NOT NULL, UNIQUE | E.164 |
| phoneVerifiedAt | timestamptz | NULL | Set on successful REGISTER OTP |
| email | text | NULL, UNIQUE where not null | Optional |
| emailVerifiedAt | timestamptz | NULL | Unused until email provider exists |
| passwordHash | text | NULL | **API-never**. Null if OTP-only user |
| accountStatus | AccountStatus | NOT NULL, default PENDING_PHONE | |
| preferredLanguage | PreferredLanguage | NOT NULL | |
| lastLoginAt | timestamptz | NULL | |
| createdAt | timestamptz | NOT NULL | |
| updatedAt | timestamptz | NOT NULL | |
| deletedAt | timestamptz | NULL | Soft delete |

**Indexes**

- `User_phone_key` UNIQUE — login lookup. **Purpose:** one account per phone.
- `User_email_key` UNIQUE (NULL allowed) — prevent duplicate emails.
- `User_accountStatus_idx` — admin filters.
- `User_role_idx` — admin filters.
- `User_deletedAt_idx` — partial `WHERE deletedAt IS NULL` if supported; else include in composite admin queries.

**Delete:** soft. Unique phone/email remain occupied so a deleted number cannot be silently re-registered without an admin restore policy (document restore as a later admin feature).

---

### 4.2 RefreshToken

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| id | uuid | PK | |
| userId | uuid | FK User, ON DELETE CASCADE | |
| tokenHash | text | NOT NULL, UNIQUE | SHA-256 of the opaque token. **API-never** |
| familyId | uuid | NOT NULL | Rotation family |
| createdAt | timestamptz | NOT NULL | |
| expiresAt | timestamptz | NOT NULL | |
| revokedAt | timestamptz | NULL | |
| replacedByTokenId | uuid | NULL, FK self | |
| createdByIp | text | NULL | Truncated / hashed if policy requires |
| userAgent | text | NULL | Truncated |

**Indexes**

- `RefreshToken_tokenHash_key` UNIQUE — lookup on refresh. **Purpose:** O(1) rotation.
- `RefreshToken_userId_idx` — logout-all.
- `RefreshToken_familyId_idx` — reuse detection (revoke family).
- `RefreshToken_expiresAt_idx` — purge job.

**Delete:** hard. Logout sets `revokedAt`. Periodic purge of expired rows.

---

### 4.3 OtpChallenge

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| id | uuid | PK | |
| phone | text | NOT NULL | May not have a user yet |
| userId | uuid | NULL, FK User | |
| purpose | OtpPurpose | NOT NULL | |
| codeHash | text | NOT NULL | **API-never** |
| attempts | int | NOT NULL, default 0 | |
| maxAttempts | int | NOT NULL, default 5 | |
| expiresAt | timestamptz | NOT NULL | ~5 minutes |
| consumedAt | timestamptz | NULL | |
| createdAt | timestamptz | NOT NULL | |

**Indexes**

- `OtpChallenge_phone_purpose_createdAt_idx` — latest challenge lookup.
- `OtpChallenge_expiresAt_idx` — purge.

**Delete:** hard after expiry/consumption retention (for example 24 hours).

---

### 4.4 AuthEvent

Security telemetry. No secrets.

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| id | uuid | PK | |
| userId | uuid | NULL, FK User SET NULL | |
| phone | text | NULL | Do not log OTP codes |
| type | text | NOT NULL | LOGIN_SUCCESS, LOGIN_FAILURE, REFRESH, REFRESH_REUSE, LOGOUT, OTP_REQUEST, OTP_FAILURE |
| ip | text | NULL | |
| userAgent | text | NULL | |
| createdAt | timestamptz | NOT NULL | |

**Indexes:** `AuthEvent_userId_createdAt_idx`, `AuthEvent_createdAt_idx`.

Do not store passwords, tokens, or OTP codes here.

---

### 4.5 AdminUserPermission

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| id | uuid | PK | |
| userId | uuid | FK User CASCADE | Must be ADMIN |
| permission | text | NOT NULL | See ARCHITECTURE.md |
| createdAt | timestamptz | NOT NULL | |
| createdByUserId | uuid | NULL, FK User | |

**Unique:** `(userId, permission)`.

SUPER_ADMIN does not need rows; guards treat that role as all permissions.

---

### 4.6 EmployeeProfile

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| id | uuid | PK | |
| userId | uuid | UNIQUE FK User CASCADE | |
| fullName | text | NULL | Collected after register |
| dateOfBirth | date | NULL | Optional; collect only if product later requires |
| gender | Gender | NULL | Optional |
| profileImageFileId | uuid | NULL, FK FileObject | |
| districtId | uuid | NULL, FK District | |
| cityId | uuid | NULL, FK City | |
| areaId | uuid | NULL, FK Area | |
| availabilityStatus | AvailabilityStatus | NOT NULL, default AVAILABLE | |
| availableFrom | date | NULL | When AVAILABLE_FROM |
| bio | text | NULL | Short; length-limited in DTO |
| createdAt / updatedAt | timestamptz | NOT NULL | |

**Indexes:** `EmployeeProfile_userId_key`; `EmployeeProfile_districtId_idx` for worker search; `EmployeeProfile_availabilityStatus_idx`.

**Profile completeness (derived, not stored unless proven expensive):** fullName present, at least one skill, district present. Do not add a stale `isComplete` boolean unless listing performance requires it; if added, keep it updated in the same transaction as profile/skill writes.

Do not add “just in case” PII (father’s name, caste, religion, exact address, Aadhaar).

---

### 4.7 EmployerProfile

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| id | uuid | PK | |
| userId | uuid | UNIQUE FK User CASCADE | |
| fullName | text | NULL | Contact person |
| organizationId | uuid | NULL, FK Organization | Set when org is created |
| createdAt / updatedAt | timestamptz | NOT NULL | |

---

### 4.8 Organization

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| id | uuid | PK | |
| name | text | NOT NULL | |
| description | text | NULL | |
| contactPhone | text | NULL | |
| contactEmail | text | NULL | |
| districtId | uuid | NULL, FK District | |
| cityId | uuid | NULL, FK City | |
| verificationState | text | NOT NULL, default UNVERIFIED | UNVERIFIED \| PENDING \| VERIFIED \| REJECTED |
| activationStatus | ActivationStatus | NOT NULL, default NOT_REQUIRED | v1 does **not** gate jobs |
| membershipStatus | EmployerMembershipStatus | NOT NULL, default INACTIVE | Paid Employer HAM Membership. Independent of `verificationState`. Payment success does **not** set organization VERIFIED. |
| membershipActivatedAt | timestamptz | NULL | Set when membership becomes ACTIVE |
| logoFileId | uuid | NULL, FK FileObject | |
| createdAt / updatedAt / deletedAt | timestamptz | | Soft delete |

**Indexes:** `Organization_name_idx` (admin search); `Organization_activationStatus_idx` (future gating queries).

---

### 4.9 SkillCategory and Skill

| SkillCategory | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| code | text UNIQUE | Stable key `construction`, `hospitality` |
| names | jsonb | Locale map. v1 seeds `en`/`ta`/`hi`. Extra languages are extra keys. |
| createdAt | timestamptz | |

| Skill | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| categoryId | uuid FK Category RESTRICT | |
| code | text UNIQUE | |
| names | jsonb | Locale map |
| isActive | boolean default true | |
| createdAt | timestamptz | |

Seeded in development/production migrations, not invented ad hoc by clients. Employees select from catalog; v1 does not allow free-text skills (avoids duplicate dirty data). If product later needs custom skills, add a moderated `pending` skill table.

**Indexes:** `Skill_categoryId_idx`; `Skill_isActive_idx`.

---

### 4.10 EmployeeSkill

| Column | Type | Constraints |
| --- | --- | --- |
| employeeProfileId | uuid | FK EmployeeProfile CASCADE |
| skillId | uuid | FK Skill RESTRICT |
| yearsExperience | int | NULL, >= 0 |
| createdAt | timestamptz | |

**PK / unique:** `(employeeProfileId, skillId)`.

---

### 4.11 Job

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| id | uuid | PK | |
| organizationId | uuid | FK Organization RESTRICT | Ownership |
| createdByUserId | uuid | FK User RESTRICT | Employer user |
| title | text | NOT NULL | Author language |
| description | text | NOT NULL | |
| jobType | JobType | NOT NULL | |
| status | JobStatus | NOT NULL, default DRAFT | |
| districtId | uuid | FK District RESTRICT | |
| cityId | uuid | NULL FK City | |
| areaId | uuid | NULL FK Area | |
| vacancies | int | NOT NULL, default 1, >= 1 | |
| wageMinPaise | int | NULL | Optional range |
| wageMaxPaise | int | NULL | Must be >= min if both set (app check) |
| wagePeriod | text | NULL | DAY \| MONTH \| PIECE |
| publishedAt | timestamptz | NULL | Set on first publish |
| closedAt | timestamptz | NULL | |
| createdAt / updatedAt / deletedAt | timestamptz | | Soft delete |

**Indexes (purpose)**

- `Job_organizationId_idx` — employer “my jobs”.
- `Job_status_publishedAt_id_idx` on `(status, publishedAt DESC, id DESC)` — public feed cursor pagination.
- `Job_districtId_status_idx` — geo filter.
- `Job_deletedAt` filtered in all public queries.

No trigram/GIN in v1. Search is `ILIKE` on title plus indexed filters (district, status, skill via JobSkill). Add `pg_trgm` only if measured slow.

---

### 4.12 JobSkill

| Column | Type | Constraints |
| --- | --- | --- |
| jobId | uuid | FK Job CASCADE |
| skillId | uuid | FK Skill RESTRICT |

**PK:** `(jobId, skillId)`.  
**Index:** `JobSkill_skillId_idx` — filter jobs by skill.

---

### 4.13 JobApplication

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| id | uuid | PK | |
| jobId | uuid | FK Job RESTRICT | |
| employeeProfileId | uuid | FK EmployeeProfile RESTRICT | |
| status | ApplicationStatus | NOT NULL, default SUBMITTED | |
| coverNote | text | NULL | Length-limited |
| createdAt / updatedAt | timestamptz | NOT NULL | |

**Unique:** `(employeeProfileId, jobId)` — **one application per employee per job**. This is the real duplicate guard; Idempotency-Key is optional extra.

**Indexes:** `JobApplication_jobId_createdAt_idx` (employer inbox); `JobApplication_employeeProfileId_createdAt_idx` (employee history); `JobApplication_status_idx` if admin/employer filter by status is common.

---

### 4.14 ApplicationStatusHistory

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| id | uuid | PK | |
| applicationId | uuid | FK JobApplication CASCADE | |
| fromStatus | ApplicationStatus | NULL | Null on create |
| toStatus | ApplicationStatus | NOT NULL | |
| actorUserId | uuid | FK User RESTRICT | |
| note | text | NULL | No PII dumps |
| createdAt | timestamptz | NOT NULL | |

**Index:** `ApplicationStatusHistory_applicationId_createdAt_idx`.

---

### 4.15 VerificationRequest

Abstraction-friendly identity verification. **No full Aadhaar column.**

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| id | uuid | PK | |
| userId | uuid | FK User RESTRICT | |
| provider | text | NOT NULL | `mock` until M1 |
| providerRef | text | NULL | Provider’s id |
| status | VerificationStatus | NOT NULL | |
| maskedIdentity | text | NULL | e.g. `XXXX-XXXX-1234` only if provider returns a mask |
| failureCode | text | NULL | Safe code, not raw provider body |
| startedAt / completedAt | timestamptz | | |
| createdAt / updatedAt | timestamptz | | |
| metadata | jsonb | NULL | Non-sensitive flags only. **Never** full ID numbers, photos of IDs, or raw KYC payloads |

**Indexes:** `VerificationRequest_userId_createdAt_idx`; `VerificationRequest_provider_providerRef_key` UNIQUE where providerRef not null.

If law later requires retaining a full identifier (M3): that must be a dedicated encrypted vault table, not a column here. Default remains: **do not store**.

---

### 4.16 HamMembership

Kept separate from verification.

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| id | uuid | PK | |
| userId | uuid | UNIQUE FK User RESTRICT | One membership row per user |
| status | MembershipStatus | NOT NULL | |
| joinedAt | timestamptz | NULL | |
| withdrawnAt | timestamptz | NULL | |
| createdAt / updatedAt | timestamptz | | |

A row is created only when the user submits an explicit membership action (join or decline). Verification success must not insert this row.

---

### 4.17 ConsentRecord

Legal evidence of HAM choice.

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| id | uuid | PK | |
| userId | uuid | FK User RESTRICT | |
| membershipId | uuid | NULL FK HamMembership | |
| action | ConsentAction | NOT NULL | |
| termsVersion | text | NOT NULL | e.g. `ham-membership-2026-08` |
| occurredAt | timestamptz | NOT NULL | |
| ip | text | NULL | |
| userAgent | text | NULL | Truncated |
| createdAt | timestamptz | NOT NULL | |

**Index:** `ConsentRecord_userId_occurredAt_idx`.

Do not store passwords, tokens, Aadhaar, or full form screenshots.

---

### 4.18 Geography (Tamil Nadu only)

No `State` table. State is implicit: Tamil Nadu.

| District | City | Area |
| --- | --- | --- |
| id uuid PK | id uuid PK | id uuid PK |
| code unique | districtId FK | cityId FK |
| names jsonb | code unique per district | code unique per city |
| isActive | names jsonb | names jsonb |
| | isActive | isActive |

**Indexes:** `City_districtId_idx`; `Area_cityId_idx`.

Seed official TN districts. Cities/areas can start as a practical subset and grow via admin, not a global geo product.

---

### 4.19 SupportProviderCategory and SupportProvider

| Category | Notes |
| --- | --- |
| id, code unique, names jsonb, isActive | Advocate, labour helpline, etc. |

| SupportProvider | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| categoryId | uuid FK | |
| name | text | |
| description | text NULL | |
| trustLevel | ListingTrust | PLATFORM_VERIFIED vs PUBLIC_LISTING |
| approvalStatus | text | DRAFT \| APPROVED \| REJECTED |
| phone | text NULL | Access: employees authenticated; do not list on public unauthenticated APIs if policy says so (v1: authenticated employees only) |
| email | text NULL | |
| addressText | text NULL | Not a precise home address of a private person unless that is the official office |
| createdAt / updatedAt / deletedAt | | Soft delete |

---

### 4.20 GeoCoverage

Provider covers district and optionally city/area.

| Column | Type |
| --- | --- |
| id | uuid PK |
| providerId | uuid FK SupportProvider CASCADE |
| districtId | uuid FK District |
| cityId | uuid NULL FK City |
| areaId | uuid NULL FK Area |

**Unique:** `(providerId, districtId, cityId, areaId)` with NULLs handled (Prisma: use a sentinel or partial unique indexes). PostgreSQL unique treats NULLs as distinct; use `COALESCE` generated columns or require district always and treat null city as “whole district”.

**Recommended rule:** `districtId` required. `cityId` null means entire district. `areaId` null means entire city (or district if city also null). Unique `(providerId, districtId, COALESCE(cityId, '0000...'), COALESCE(areaId, '0000...'))` via generated columns.

**Index:** `(districtId, cityId, areaId)` for lookup by user location.

---

### 4.21 Payment and WebhookEvent

Designed for future use. **Not used to gate jobs in v1.**

| Payment | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| organizationId | uuid FK | |
| userId | uuid FK | Who initiated |
| provider | text | stub until M6 |
| providerOrderId | text NULL UNIQUE(provider, providerOrderId) | |
| amountPaise | int NOT NULL | |
| currency | text NOT NULL default INR | |
| status | PaymentStatus | |
| purpose | text | e.g. EMPLOYER_ACTIVATION, MEMBERSHIP, EMPLOYER_MEMBERSHIP |
| idempotencyKey | text NULL UNIQUE | Client/server initiate |
| createdAt / updatedAt | | |

| WebhookEvent | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| provider | text | |
| providerEventId | text | UNIQUE(provider, providerEventId) **idempotency** |
| paymentId | uuid NULL FK | |
| processedAt | timestamptz | |
| payloadFingerprint | text | Hash of body, not raw PAN |
| createdAt | timestamptz | |

Never store card numbers, CVV, UPI PINs, or bank passwords.

---

### 4.22 FileObject

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| ownerUserId | uuid FK User | |
| storageKey | text UNIQUE | Generated, not user filename |
| detectedMime | text | Server-detected |
| byteSize | int | |
| visibility | FileVisibility | default PRIVATE |
| createdAt / deletedAt | | Soft delete |

No blobs in PostgreSQL.

---

### 4.23 WelfareContent

Placeholder for insurance/welfare UI.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| slug | text UNIQUE | `insurance`, `welfare` |
| status | text | COMING_SOON \| PUBLISHED |
| titles | jsonb | Locale map |
| bodies | jsonb | Locale map; `{}` if empty |
| updatedAt | timestamptz | |

No claims tables in v1.

---

### 4.24 Notification (optional, not implemented in v1)

Documented so the schema is not redesigned later. **Do not migrate in v1 unless requested.**

- `Notification` (id, userId, type, title, body, data jsonb safe, createdAt)
- `NotificationRead` (notificationId, userId, readAt) or `readAt` on the row if one-to-one

---

### 4.25 AuditLog

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| actorType | AuditActorType | |
| actorUserId | uuid NULL FK User SET NULL | |
| action | text | e.g. `user.block`, `job.unpublish` |
| targetType | text | `User`, `Job`, … |
| targetId | uuid NULL | |
| metadata | jsonb | Redacted; no tokens, passwords, Aadhaar |
| ip | text NULL | |
| createdAt | timestamptz | |

**Indexes:** `AuditLog_actorUserId_createdAt_idx`; `AuditLog_targetType_targetId_idx`; `AuditLog_createdAt_idx`.

Append-only. No updates. No deletes in v1 (retention policy is a later ops decision).

---

## 5. Integrity rules (application + DB)

1. One application per employee per job — unique constraint.
2. Unique phone; unique email if present.
3. Employer edits jobs only where `job.organizationId` matches their `EmployerProfile.organizationId`.
4. Employee profile exists for `role=EMPLOYEE`; employer profile for `EMPLOYER`. Enforce in service on register.
5. ADMIN permission rows only if `role=ADMIN`.
6. HAM membership insert requires a `ConsentRecord` in the same transaction with action JOINED or DECLINED.
7. Verification SUCCEEDED must not write HamMembership.
8. Job apply allowed only if job `status=PUBLISHED` and `deletedAt` is null and employee account ACTIVE.
9. Wage max >= wage min when both present (service validation).
10. OTP consume is single-use (`consumedAt`) and attempt-limited.

---

## 6. Pagination and sorting indexes

| Use case | Strategy | Index |
| --- | --- | --- |
| Public job feed | Cursor `publishedAt,id` | `(status, publishedAt DESC, id DESC)` |
| Employer my jobs | Offset page/limit | `organizationId` + `createdAt DESC` |
| Employer applicants | Offset | `(jobId, createdAt DESC)` |
| Employee applications | Offset | `(employeeProfileId, createdAt DESC)` |
| Admin users | Offset | `(createdAt DESC)` plus status/role filters |
| Legal support by area | Offset | GeoCoverage lookup indexes |
| Worker search | Offset | `districtId` + `availabilityStatus`; join EmployeeSkill |

Whitelist sort fields in DTOs. Never pass client field names into Prisma `orderBy` without a map.

---

## 7. Soft-delete vs hard-delete

| Entity | Policy | Why |
| --- | --- | --- |
| User, Organization, Job, SupportProvider, FileObject | Soft | Audit, restore, unique-phone occupancy |
| JobApplication | Hard not used; keep rows, status WITHDRAWN | History |
| RefreshToken, OtpChallenge | Hard / purge | Secrets-adjacent |
| AuditLog, ConsentRecord | Keep | Legal evidence |
| WebhookEvent | Keep for idempotency; purge after long retention | Replay protection |

All list queries on soft-deleted entities **must** filter `deletedAt IS NULL` unless an admin “include deleted” permission is used.

---

## 8. Seed plan (Phase 2)

Development seed only:

- Skill categories and skills (practical TN worker skills: construction, driving, hospitality, domestic, manufacturing, agriculture, logistics — exact list at implementation, keep small).
- Tamil Nadu districts (official list). Practical subset of cities/areas.
- WelfareContent rows with `COMING_SOON`.
- Optional local admin when `SEED_DEV_ADMIN=true` **and** `NODE_ENV=development`. Password from env, hashed with Argon2id. Never commit the password.

Production seed: catalog data (skills, districts) via migrations or a controlled seed. No admin users from git.

---

## 9. Migration safety

- Prisma Migrate for all schema changes.
- Additive migrations preferred.
- Enum expansions: add values before using them in code.
- Never `prisma migrate reset` against shared/staging/production.
- Backup before destructive production changes.
- Expand-then-contract for renames.

---

## 10. Prisma 7 implementation notes (Phase 2)

- `prisma.config.ts` holds datasource URL from env.
- Generator output in-repo; `moduleFormat = "cjs"`.
- `PrismaService` constructs `PrismaClient` with `PrismaPg` adapter and `DATABASE_URL`.
- Do not put `DATABASE_URL` in `schema.prisma` as a committed secret; Prisma 7 reads URL from config/env.

---

## 11. Open schema items (do not invent silently)

- Exact worker-search fields (M8).
- Whether membership withdrawal is in v1 (M9) — `WITHDRAWN` exists on the enum so the column does not need a breaking change.
- Notification tables deferred.
- Encrypted identity vault deferred unless M3 requires it.
- Product UI locales remain `ta | en | hi` until product expands `PreferredLanguage`. Catalog JSON may already hold additional keys.
