# ham-backend — API Design

**Project name:** ham-backend  
**Style:** REST JSON  
**Version:** `/api/v1`  
**Status:** Planning complete  
**Date:** 2026-08-24

Related: [PROJECT_PLAN.md](PROJECT_PLAN.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [DATABASE_DESIGN.md](DATABASE_DESIGN.md) · [SECURITY.md](SECURITY.md)

This is the v1 contract plan. Do not implement until the matching phase is requested.

---

## 1. Conventions

| Topic | Rule |
| --- | --- |
| Base URL | `{origin}/api/v1` |
| Global prefix | `api` |
| Nest URI versioning | default `1` → path segment `v1` |
| Health | Version-neutral `/health`, `/ready` (not under `/api/v1`) |
| Content-Type | `application/json` except multipart upload |
| Auth | `Authorization: Bearer <accessToken>` unless marked Public |
| Time | ISO-8601 UTC strings |
| IDs | UUID strings |
| Phone | E.164 |
| Language | `ta` \| `en` \| `hi` |

### Pagination

**Offset** (admin, employer lists, employee applications):

```
?page=1&limit=20
```

Defaults: `page=1`, `limit=20`, `max=50`.

Response wrapper:

```json
{
  "data": [],
  "meta": { "page": 1, "limit": 20, "total": 0 }
}
```

**Cursor** (public job feed):

```
?cursor=<opaque>&limit=20
```

Response:

```json
{
  "data": [],
  "meta": { "nextCursor": "string|null", "limit": 20 }
}
```

Cursor is opaque to clients (server encodes `publishedAt|id`). Sort whitelist only.

### Error envelope

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [{ "field": "phone", "issue": "isE164" }],
    "requestId": "uuid"
  }
}
```

| HTTP | code |
| --- | --- |
| 400 | `VALIDATION_ERROR` |
| 401 | `UNAUTHORIZED` |
| 403 | `FORBIDDEN`, `ACCOUNT_SUSPENDED`, `ACCOUNT_BLOCKED` |
| 404 | `NOT_FOUND` |
| 409 | `CONFLICT` |
| 429 | `RATE_LIMITED` |
| 502/503 | `PROVIDER_UNAVAILABLE` |
| 500 | `INTERNAL_ERROR` |

Never return password hashes, refresh token hashes, encryption keys, full identity numbers, raw provider payloads, or stack traces in production.

### Auth response (login, register-complete, refresh, OTP verify)

```json
{
  "data": {
    "accessToken": "jwt",
    "refreshToken": "opaque",
    "expiresIn": 900,
    "tokenType": "Bearer",
    "user": { "id": "uuid", "role": "EMPLOYEE", "phone": "+91...", "preferredLanguage": "ta", "accountStatus": "ACTIVE" }
  }
}
```

`refreshToken` appears only here. Clients store it securely. Subsequent responses never echo it.

---

## 2. Public fields that must never leak

Strip from all responses: `passwordHash`, `tokenHash`, `codeHash`, `deletedAt` (except admin if permitted), verification `metadata` raw, payment PAN, webhook raw bodies.

User `phone` is returned to the owner and to admins. Worker-search **must not** return phone until M8 says otherwise (default: no phone in search).

---

## 3. Health

### GET /health

- **Auth:** Public  
- **Role:** none  
- **Ownership:** n/a  
- **Request:** none  
- **Response:** `{ "status": "ok" }`  
- **Errors:** 503 if process should not receive traffic (optional; liveness is usually always 200)

### GET /ready

- **Auth:** Public  
- **Role:** none  
- **Request:** none  
- **Response:** `{ "status": "ok", "checks": { "database": "up" } }`  
- **Errors:** 503 if database ping fails  
- **Note:** Do not include `DATABASE_URL`, versions of secrets, or internal hostnames.

---

## 4. Authentication — `/api/v1/auth`

Stricter rate limits. Generic credential errors.

### POST /api/v1/auth/register

- **Auth:** Public  
- **Role:** none  
- **Request DTO:** `phone` (E.164), `role` (`EMPLOYEE` \| `EMPLOYER` only — never ADMIN/SUPER_ADMIN), `preferredLanguage`, `email?`, `password?` (required later if they want password login; min length 10, not only numeric)  
- **Response:** `{ data: { userId, phone, accountStatus: "PENDING_PHONE" } }` — **do not** issue tokens until phone verified  
- **Errors:** 400 validation; 409 if phone already registered (`CONFLICT` generic: “Unable to register with this phone” to reduce enumeration if desired; product may use explicit conflict — **prefer generic** for register if the phone exists)  
- **Ownership:** n/a  

Admin/Super Admin accounts are never created through this endpoint.

### POST /api/v1/auth/otp/request

- **Auth:** Public  
- **Request DTO:** `phone`, `purpose` (`REGISTER` \| `LOGIN` \| `PASSWORD_RESET`)  
- **Response:** `{ data: { expiresIn: 300 } }` same shape whether or not the phone is eligible for LOGIN  
- **Errors:** 400; 429  
- **Rules:** REGISTER only if pending/new; LOGIN/PASSWORD_RESET only if user exists — still return the same success body  

### POST /api/v1/auth/otp/verify

- **Auth:** Public  
- **Request DTO:** `phone`, `purpose`, `code`  
- **Response:** For REGISTER/LOGIN: auth token pair. For PASSWORD_RESET: `{ data: { resetToken } }` short-lived, single-use (not a full session)  
- **Errors:** 400/401 `INVALID_OR_EXPIRED_CODE`; 429  

### POST /api/v1/auth/login

- **Auth:** Public  
- **Request DTO:** `phone`, `password`  
- **Response:** auth token pair  
- **Errors:** 401 `INVALID_CREDENTIALS`; 403 suspended/blocked; 429  

### POST /api/v1/auth/refresh

- **Auth:** Public (refresh token in body)  
- **Request DTO:** `refreshToken`  
- **Response:** new auth token pair  
- **Errors:** 401; reuse → 401 and family revoked  

### POST /api/v1/auth/logout

- **Auth:** Bearer **or** refresh body  
- **Request DTO:** `refreshToken?`, `allDevices?` boolean  
- **Response:** `{ data: { success: true } }`  
- **Errors:** 401 if neither valid access nor refresh  

### POST /api/v1/auth/password/set

- **Auth:** Bearer  
- **Role:** any authenticated  
- **Ownership:** self  
- **Request DTO:** `password`, `currentPassword?` (required if passwordHash already set)  
- **Response:** `{ data: { success: true } }`  
- **Errors:** 400; 401  

### POST /api/v1/auth/password/reset

- **Auth:** Public  
- **Request DTO:** `phone`, `resetToken` (from OTP verify PASSWORD_RESET), `newPassword`  
- **Response:** `{ data: { success: true } }` — does not auto-login (user logs in after)  
- **Errors:** 401 invalid reset token  

---

## 5. Current user — `/api/v1/me`

### GET /api/v1/me

- **Auth:** Bearer  
- **Role:** any  
- **Ownership:** self  
- **Response:** user + role-specific profile summary (no hashes). Includes onboarding flags derived from profile/verification/membership  
- **Errors:** 401, 403 status  

### PATCH /api/v1/me

- **Auth:** Bearer  
- **Request DTO:** `preferredLanguage?`, `email?` (not `role`, not `accountStatus`, not `phone` here)  
- **Phone change:** not in v1 unless a dedicated OTP flow is added later  
- **Errors:** 400, 409 email taken  

---

## 6. Employee profile — `/api/v1/employee`

All require **Bearer + EMPLOYEE**. Ownership: caller’s `EmployeeProfile`.

### GET /api/v1/employee/profile

- **Response:** profile DTO (fullName, optional dob/gender, location ids, availability, image URL/id, skills)

### PATCH /api/v1/employee/profile

- **Request DTO:** `fullName?`, `dateOfBirth?`, `gender?`, `districtId?`, `cityId?`, `areaId?`, `availabilityStatus?`, `availableFrom?`, `bio?`  
- **Forbidden fields:** userId, role  
- **Errors:** 400 (unknown district)

### PUT /api/v1/employee/skills

- **Request DTO:** `{ skills: [{ skillId, yearsExperience? }] }` replaces the set  
- **Errors:** 400 unknown skillId  

### GET /api/v1/employee/skills

- **Response:** list of catalog skills with names in preferred language  

### POST /api/v1/employee/profile/image

- **Content-Type:** multipart  
- **Request:** file field `file`  
- **Response:** `{ data: { fileId, url } }` (signed or public URL per visibility)  
- **Errors:** 400 invalid type/size  

---

## 7. Jobs (employee browse) — `/api/v1/jobs`

### GET /api/v1/jobs

- **Auth:** Bearer (employees; employers may also browse)  
- **Role:** EMPLOYEE, EMPLOYER, ADMIN, SUPER_ADMIN  
- **Pagination:** **cursor**  
- **Query:** `districtId?`, `cityId?`, `skillId?`, `jobType?`, `cursor?`, `limit?`  
- **Sort:** `publishedAt DESC, id DESC` only  
- **Response:** job summary list (no other employers’ internal notes — none exist)  
- **Filter:** `status=PUBLISHED` and `deletedAt` null only  
- **Errors:** 400 invalid filter  

### GET /api/v1/jobs/:jobId

- **Auth:** Bearer  
- **Response:** job detail + organization public name + required skills  
- **Errors:** 404 if not published (employees). Admin may see unpublished via admin API, not this route  

---

## 8. Applications — `/api/v1/applications`

### POST /api/v1/applications

- **Auth:** Bearer + EMPLOYEE  
- **Ownership:** employee is self  
- **Request DTO:** `jobId`, `coverNote?`  
- **Response:** application DTO `SUBMITTED`  
- **Errors:** 404 job; 409 already applied; 409 job not published  
- **Idempotency:** unique `(employeeProfileId, jobId)` is the guard. Optional `Idempotency-Key` header may be added later  

### GET /api/v1/applications

- **Auth:** Bearer + EMPLOYEE  
- **Pagination:** offset  
- **Query:** `status?`  
- **Response:** caller’s applications only  

### GET /api/v1/applications/:applicationId

- **Auth:** Bearer + EMPLOYEE  
- **Ownership:** application.employeeProfile.userId === caller  
- **Errors:** 404 (do not leak existence of others’ applications)

### POST /api/v1/applications/:applicationId/withdraw

- **Auth:** Bearer + EMPLOYEE  
- **Ownership:** self  
- **Business state:** not already `HIRED` (or allow withdraw until HIRED — **v1: allow withdraw unless HIRED**)  
- **Errors:** 409 illegal state  

---

## 9. Employer organization and jobs

### GET /api/v1/employer/profile

- **Auth:** Bearer + EMPLOYER  
- **Response:** employer profile + organization (if any)

### PATCH /api/v1/employer/profile

- **Request DTO:** `fullName?`

### PUT /api/v1/employer/organization

- **Auth:** Bearer + EMPLOYER  
- **Request DTO:** `name`, `description?`, `contactPhone?`, `contactEmail?`, `districtId?`, `cityId?`  
- **Ownership:** create-or-update caller’s organization only  
- **Response:** organization DTO (`activationStatus` included for future UI; v1 does not block). Also includes `membershipStatus` and `membershipActivatedAt`. Paid membership does **not** set `verificationState` to VERIFIED and does **not** gate job posting.

### GET /api/v1/employer/membership

- **Auth:** Bearer + EMPLOYER  
- **Response:** `{ status, canPay, profileComplete, paymentStatus, activatedAt, verificationState, plan }`  
- `status` is `INACTIVE` \| `ACTIVE` (Employer HAM Membership). Independent of organization `verificationState`.  
- `plan.amountPaise` is server-catalog (seed `employer-ham-membership`). Client must not treat a hardcoded ₹99 as source of truth.  
- `canPay` is true only when the company profile checklist is complete, the plan is active, membership is not ACTIVE, and Razorpay is configured.  
- **Payment:** does **not** verify the organization. Job posting remains ungated (D11).

### POST /api/v1/employer/jobs

- **Auth:** Bearer + EMPLOYER  
- **Ownership:** job.organizationId = caller’s org (must have organization)  
- **Request DTO:** `title`, `description`, `jobType`, `districtId`, `cityId?`, `areaId?`, `vacancies`, `wageMinPaise?`, `wageMaxPaise?`, `wagePeriod?`, `skillIds[]`, `status?` (`DRAFT` default)  
- **Errors:** 400; 409 if no organization  
- **Payment:** **not required** in v1  

### GET /api/v1/employer/jobs

- **Pagination:** offset  
- **Query:** `status?`  
- **Ownership:** own org only  

### GET /api/v1/employer/jobs/:jobId

- **Ownership:** own org; 404 otherwise  

### PATCH /api/v1/employer/jobs/:jobId

- **Ownership:** own org  
- **Business state:** cannot edit `CLOSED` except no-op; `PUBLISHED` may update limited fields (title/description/vacancies) — v1 allows edit while not CLOSED  
- **Forbidden:** changing `organizationId`

### POST /api/v1/employer/jobs/:jobId/publish

- **Ownership:** own org  
- **State:** DRAFT or UNPUBLISHED → PUBLISHED; set `publishedAt` if null  

### POST /api/v1/employer/jobs/:jobId/close

- **Ownership:** own org  
- **State:** → CLOSED, set `closedAt`

### GET /api/v1/employer/jobs/:jobId/applications

- **Auth:** Bearer + EMPLOYER  
- **Ownership:** job owned  
- **Pagination:** offset  
- **Query:** `status?`  
- **Response:** applicants with **privacy-allowlisted** employee fields (default: display name, skills, district, availability, application status). **No phone, no DOB, no identity numbers** until M8 expands this.

### PATCH /api/v1/employer/jobs/:jobId/applications/:applicationId

- **Request DTO:** `status` (`VIEWED` \| `SHORTLISTED` \| `REJECTED` \| `HIRED`)  
- **Ownership:** job owned  
- **Cannot set WITHDRAWN** (employee-only)  
- **Writes** ApplicationStatusHistory  

---

## 10. Worker search (employer)

### GET /api/v1/employer/workers

- **Auth:** Bearer + EMPLOYER  
- **Pagination:** offset  
- **Query:** `districtId?`, `skillId?`, `availabilityStatus?`  
- **Response:** allowlisted worker cards only (see default in §9).  
- **Missing requirement M8:** exact fields TBD; implement the conservative default.  
- **Errors:** 400  

Do not return blocked/suspended/deleted users. Do not return unverified identity as a verified badge unless verification SUCCEEDED (optional badge `identityVerified: boolean` is allowed).

---

## 11. Skills catalog

### GET /api/v1/skills

- **Auth:** Bearer  
- **Query:** `categoryId?`  
- **Response:** active skills with names in preferred language  
- **Pagination:** optional offset if catalog grows; v1 may return full list if seeded size is small (<200)

### GET /api/v1/skill-categories

- **Auth:** Bearer  
- **Response:** categories with localized names  

---

## 12. Verification — `/api/v1/verification`

Mock provider only in v1.

### POST /api/v1/verification/start

- **Auth:** Bearer + EMPLOYEE (employers may be out of scope unless later required)  
- **Ownership:** self  
- **Request DTO:** empty or `{ returnUrl? }` for future providers  
- **Response:** `{ data: { verificationId, status, provider: "mock", nextStep } }`  
- **Errors:** 409 if already SUCCEEDED; 502 provider  

### GET /api/v1/verification/me

- **Auth:** Bearer  
- **Response:** latest request status + `maskedIdentity` if any. No metadata dump  

### POST /api/v1/verification/webhooks/:provider

- **Auth:** Public + **signature verification** (mock shared secret in env)  
- **Idempotency:** provider event id  
- **Response:** 200 `{ received: true }`  
- **Errors:** 401 bad signature  
- **Must not** trust unsigned bodies  

Mock helper (development only, never production):

### POST /api/v1/verification/mock/complete

- **Auth:** Bearer + EMPLOYEE  
- **Enabled:** `IDENTITY_PROVIDER=mock` and `NODE_ENV!==production`  
- **Request DTO:** `{ verificationId, result: "SUCCEEDED" | "FAILED" }`  
- **Response:** updated status  
- **Forbidden in production build** even if env is mis-set: guard on `NODE_ENV`

---

## 13. HAM membership — `/api/v1/membership`

### GET /api/v1/membership

- **Auth:** Bearer + EMPLOYEE  
- **Response:** `{ status, canJoin, termsVersion, identityVerified }`  
- **canJoin:** true only if latest verification SUCCEEDED and status is not JOINED  

### GET /api/v1/membership/info

- **Auth:** Bearer + EMPLOYEE  
- **Response:** static benefits copy keys + `termsVersion` (clients localize). No legal invention of political claims — copy is a missing requirement (M9); API returns versioned identifiers and placeholder text from config/Welfare-like content if needed  

### POST /api/v1/membership/join

- **Auth:** Bearer + EMPLOYEE  
- **Ownership:** self  
- **Request DTO:** `{ termsVersion, accepted: true }` (`accepted` must be `true`)  
- **Business state:** identity verified; not already JOINED  
- **Side effects:** ConsentRecord + HamMembership JOINED in one transaction  
- **Errors:** 400 accepted false; 409 not verified; 409 already joined  
- **Never** called automatically from verification webhook  

### POST /api/v1/membership/decline

- **Auth:** Bearer + EMPLOYEE  
- **Request DTO:** `{ termsVersion }`  
- **Side effects:** ConsentRecord DECLINED; HamMembership DECLINED  
- **Allowed** after verification; user can use the app without joining  

### POST /api/v1/membership/withdraw

- **Auth:** Bearer + EMPLOYEE  
- **Status:** **designed; implement only if M9 confirms**  
- **Request DTO:** `{ termsVersion }`  
- **If disabled:** 404 or 409 `NOT_ENABLED`  
- **If enabled:** status WITHDRAWN + consent row  

---

## 14. Legal support — `/api/v1/legal-support`

Authenticated employees (and admins). Not public anonymous in v1 (contact data).

### GET /api/v1/legal-support/categories

- **Auth:** Bearer  
- **Response:** localized categories  

### GET /api/v1/legal-support/providers

- **Auth:** Bearer + EMPLOYEE (ADMIN may use admin routes)  
- **Pagination:** offset  
- **Query:** `districtId` required (or cityId/areaId), `categoryId?`  
- **Response:** providers covering that geo, `trustLevel` distinguished, contact fields for authenticated employees  
- **Filter:** `approvalStatus=APPROVED`, not deleted  

### GET /api/v1/legal-support/providers/:id

- **Auth:** Bearer + EMPLOYEE  
- **Errors:** 404  

---

## 15. Welfare / insurance placeholder

### GET /api/v1/welfare/:slug

- **Auth:** Bearer  
- **Response:** `{ slug, status: "COMING_SOON", title, body }` localized  
- **Errors:** 404 unknown slug  
- **No** claims endpoints  

---

## 16. Geography

### GET /api/v1/geo/districts

- **Auth:** Bearer  
- **Response:** TN districts localized  

### GET /api/v1/geo/districts/:districtId/cities

- **Auth:** Bearer  

### GET /api/v1/geo/cities/:cityId/areas

- **Auth:** Bearer  

---

## 17. Payments — `/api/v1/payments`

v1: Razorpay for membership products; stub remains for `EMPLOYER_ACTIVATION`. **Job posting is not gated.** Employer membership payment does **not** set organization `verificationState` to VERIFIED.

### POST /api/v1/payments/initiate

- **Auth:** Bearer + EMPLOYER or EMPLOYEE  
- **Request DTO:**  
  - `{ purpose: "EMPLOYER_ACTIVATION", amountPaise? }` — stub scaffold; amount from `PAYMENT_EMPLOYER_ACTIVATION_PAISE`; may return `409 NOT_ENABLED`  
  - `{ purpose: "EMPLOYER_MEMBERSHIP", planId }` — Employer HAM Membership. Amount from `MembershipPlan` `employer-ham-membership`. Requires complete company profile. `409` if already ACTIVE, incomplete profile, or Razorpay not enabled.  
  - `{ purpose: "MEMBERSHIP", planId, termsVersion, accepted: true }` — employee membership only  
- Client `amountPaise` is ignored.  
- **Response:** `{ paymentId, status, providerPayload }` — Razorpay payload includes `keyId`, `orderId`, `amountPaise`, `currency`, `checkoutMode`  
- **Errors:** 403 wrong role; 409 `NOT_ENABLED` / incomplete profile / already active / no org; 502 provider  

### POST /api/v1/payments/confirm

- **Auth:** Bearer + EMPLOYEE or EMPLOYER  
- **Request DTO:** `{ razorpay_order_id, razorpay_payment_id, razorpay_signature }`  
- Verifies Razorpay checkout HMAC. Employee path activates `HamMembership`. Employer path sets `Organization.membershipStatus = ACTIVE` and does **not** change `verificationState` or `activationStatus`.  
- **Response:** `{ paymentId, status, membershipStatus }`  

### GET /api/v1/payments/:paymentId

- **Ownership:** caller’s org/user  
- **Response:** status, amount, currency. No raw provider dump  

### POST /api/v1/payments/webhooks/:provider

- **Auth:** signature  
- **Idempotency:** `providerEventId`  
- **Response:** 200 received  

---

## 18. Admin — `/api/v1/admin`

All: Bearer + `ADMIN` or `SUPER_ADMIN` + permission as listed. Stronger audit on mutations.

### GET /api/v1/admin/users

- **Permission:** `users.read`  
- **Pagination:** offset  
- **Query:** `role?`, `accountStatus?`, `q?` (phone/email hash-safe: search exact phone or email, not partial Aadhaar)  
- **Response:** user list without hashes. Phone visible to admin.

### GET /api/v1/admin/users/:userId

- **Permission:** `users.read`  
- **Response:** user + profile + verification **status** + masked identity. No full ID. No passwordHash.

### POST /api/v1/admin/users/:userId/status

- **Permission:** `users.block`  
- **Request DTO:** `{ accountStatus: "ACTIVE" | "SUSPENDED" | "BLOCKED", reason? }`  
- **Cannot** use this to create SUPER_ADMIN  
- **Audit:** required  
- **Errors:** 403 if target is SUPER_ADMIN and actor is not SUPER_ADMIN  

### GET /api/v1/admin/jobs

- **Permission:** `jobs.moderate`  
- **Pagination:** offset  
- **Query:** `status?`, `organizationId?`

### POST /api/v1/admin/jobs/:jobId/unpublish

- **Permission:** `jobs.moderate`  
- **State:** PUBLISHED → UNPUBLISHED  
- **Audit:** required  

### POST /api/v1/admin/jobs/:jobId/close

- **Permission:** `jobs.moderate`  
- **Audit:** required  

### GET /api/v1/admin/legal-support/providers

- **Permission:** `legal.manage`  
- **Pagination:** offset including non-approved  

### POST /api/v1/admin/legal-support/providers

- **Permission:** `legal.manage`  
- **Request DTO:** name, categoryId, trustLevel, contacts, coverage[]  
- **Audit:** required  

### PATCH /api/v1/admin/legal-support/providers/:id

- **Permission:** `legal.manage`  
- **Audit:** required  

### POST /api/v1/admin/legal-support/providers/:id/approve

- **Permission:** `legal.manage`  
- **Audit:** required  

### GET /api/v1/admin/metrics

- **Permission:** `metrics.read`  
- **Response:** counts only: users by role/status, jobs by status, applications last 7/30 days. No PII lists  

### GET /api/v1/admin/audit-logs

- **Permission:** `audit.read`  
- **Pagination:** offset  
- **Query:** `actorUserId?`, `action?`, `targetType?`, `from?`, `to?`  
- **Response:** redacted metadata  

### POST /api/v1/admin/admins

- **Permission:** `admins.manage` (SUPER_ADMIN only)  
- **Request DTO:** `phone`, `password`, `permissions[]`  
- **Creates** ADMIN user  
- **Audit:** required  
- **Never** in public Swagger without auth  

### PATCH /api/v1/admin/admins/:userId/permissions

- **Permission:** `admins.manage`  
- **Audit:** required  

---

## 19. Swagger / OpenAPI

- Path: `/docs` (configurable `SWAGGER_PATH`)
- Include DTO schemas, bearer auth, error examples, role notes
- `SWAGGER_ENABLED=false` in production by default
- If temporarily enabled in staging: HTTP basic from env
- Admin endpoints tagged `admin`; do not expose mock-complete in production spec

---

## 20. Endpoint checklist by phase

| Phase | Endpoints |
| --- | --- |
| 1 | `/health`, `/ready` |
| 4 | all `/auth/*` |
| 5 | `/me`, employee profile, employer profile/org, skills catalog, geo |
| 6 | jobs browse, applications, employer jobs, applicants, worker search |
| 7 | verification start/me/webhook/mock |
| 8 | membership |
| 9 | legal-support |
| 10 | payments (optional `NOT_ENABLED`) |
| 11 | `/admin/*` |
| 12 | Swagger polish, final review |

---

## 21. Client notes

- React Native, Next.js, employer portal, admin: **one** contract.
- Preferred language: stored on user; list endpoints use it for catalog names.
- `Accept-Language` may influence anonymous-capable routes if any are added later; v1 job browse is authenticated.
