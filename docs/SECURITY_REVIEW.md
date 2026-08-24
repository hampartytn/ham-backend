# ham-backend — Security review (Phase 12)

**Project name:** ham-backend  
**Date:** 2026-08-24  
**Against:** [SECURITY.md](SECURITY.md)

Related: [PROJECT_PLAN.md](PROJECT_PLAN.md) · [DEPLOYMENT.md](DEPLOYMENT.md) · [API_REVIEW.md](API_REVIEW.md)

This is an implementation checklist, not a claim that the system is unhackable. Production KYC, SMS, email, payments, object storage, and hosting remain blocked on M1–M14.

---

## 1. Goals

| SECURITY.md | Implementation |
| --- | --- |
| Secure by default | Global JWT guard; `@Public()` opt-in; production env fail-closed; Swagger off in production unless explicitly enabled |
| Least privilege | Roles + `RequirePermissions`; SUPER_ADMIN implicit permissions; ownership in services |
| Data minimization | No Aadhaar column; worker search without phone/DOB/identity numbers; payment DTOs reject card fields |
| Server-side enforcement | Guards + service checks; webhooks verify HMAC; payment amount from env not client |
| No secrets in git | `.env` gitignored; `.env.example` placeholders only |
| Safe errors and logs | Envelope `{ error: { code, message, details?, requestId } }`; Pino redact; no stack in production body |
| Identity / HAM high-risk | Mock IDV adapter; membership never auto-joined; withdraw `NOT_ENABLED` (M9) |

---

## 2. Transport and HTTP

| Control | Status |
| --- | --- |
| HTTPS | Documented for staging/production; terminated at proxy. **Hosting TBD (M11).** Application does not enable `trust proxy` by default. |
| Helmet | `helmet()` in `setupApp`. **Exception:** `contentSecurityPolicy` is `false` when Swagger is enabled so Swagger UI can load. Production should keep `SWAGGER_ENABLED` unset/false so default Helmet CSP remains. |
| CORS | Allowlist from `CORS_ORIGINS`. Production boot fails if empty or includes `*`. Credentials `false` (Bearer-only). |
| CSRF | Not required (Bearer-only). |
| Body size | JSON via Nest/Express defaults; uploads capped (`FILE_MAX_BYTES`, default 2 MiB) with MIME/magic-byte checks for profile images. |
| Trust proxy | Not enabled. Enable only behind a known proxy when M11 is set. |

---

## 3. Authentication

| Control | Status |
| --- | --- |
| Argon2id | `argon2`; hashes never returned; rehash on login when `needsRehash` |
| Access JWT | HS256, `sub` + `role`; secrets ≥ 32 chars; default TTL 15m |
| Refresh | Opaque token, SHA-256 `tokenHash`, rotation, family reuse revocation, logout revokes family |
| OTP | Hashed codes, TTL/attempts, generic verify errors; mock SMS (M4) |
| Login errors | `INVALID_CREDENTIALS` / `INVALID_OR_EXPIRED_CODE`; account status explicit after auth |
| Account status | `AccountStatusGuard`: deleted / SUSPENDED / BLOCKED rejected |
| Transport | `Authorization: Bearer`; refresh in JSON body. HttpOnly cookies not implemented. |

---

## 4. Authorization

APP_GUARD order: Throttler → `JwtAuthGuard` → `AccountStatusGuard` → `RolesGuard` → `PermissionsGuard`. Ownership and job/application state are enforced in services. Employer A cannot mutate employer B’s jobs. SUPER_ADMIN is the only role that can create admins / assign `admins.manage` (that permission is not assignable).

---

## 5. Input validation and mass assignment

Global `ValidationPipe`: `whitelist`, `forbidNonWhitelisted`, `transform`. Extra fields → `400 VALIDATION_ERROR`. Explicit DTOs; UUID pipes; E.164 phones; pagination max limit 50.

---

## 6. Output filtering

Responses do not include `passwordHash`, `tokenHash`, or `codeHash`. Refresh token only on dedicated auth responses. Verification returns `maskedIdentity`, not full numbers. Payment checkout has no PAN/CVV. Audit list redacts metadata via `redactSensitive`. Production exception filter omits stacks.

---

## 7. Logging and redaction

Pino redact paths include password, hashes, tokens, authorization, aadhaar, otp, secrets, card fields, `DATABASE_URL` (see `LOG_REDACT` and `buildPinoRedactPaths`). Auth routes should not log bodies. Audit metadata uses the same helper.

---

## 8. Errors

Stable envelope as in API_DESIGN.md. Unique violations → `409 CONFLICT`. Extra documented codes: `NOT_ENABLED`, `INVALID_CREDENTIALS`, `INVALID_OR_EXPIRED_CODE`.

---

## 9. Rate limiting and abuse

Global throttler (default 100 / 60s) plus named `auth` limiter on login/OTP/refresh/reset. File uploads: jpeg/png/webp, 2 MiB, magic bytes. CAPTCHA not in v1 (M12). Account lockout after failed passwords is recorded via `AuthEvent`; unknown phones stay non-enumerating.

---

## 10. Aadhaar / identity

| Must not | Check |
| --- | --- |
| Store full Aadhaar in User / logs / URLs / PKs | **Pass.** `prisma/schema.prisma` has no `aadhaar` column. Comment: “Do not store full Aadhaar”. Unit test `src/database/schema.pii.spec.ts`. |
| Use Aadhaar as user id | **Pass.** User id is UUID. |
| Couple HAM to verification success | **Pass.** Separate membership writes; tests assert no auto-join. |
| Real UIDAI branding / production KYC | **Pass.** Mock adapter only (M1). Mock-complete 404 in production. |

---

## 11. Payments

Server creates the order; amount from `PAYMENT_EMPLOYER_ACTIVATION_PAISE`. Webhook HMAC + idempotent `providerEventId`. No client “complete” route. Jobs remain ungated. Stub provider (M6).

---

## 12. Device integrity

`X-Device-Integrity` is not required. Sensitive operations still need authn/authz (M14).

---

## 13. Secrets and configuration

`.env` gitignored. `validateEnv` fail-closed in production. No hard-coded encryption keys.

---

## 14. Dependency and process security — `npm audit`

Run: `npm audit` (2026-08-24) on the locked tree with Prisma **7.9.1**.

### Written exception (high)

**Advisory:** GHSA-ggr8-5vv4-36mx — `deepmerge-ts` &lt; 8.0.0 (stack exhaustion on recursive merge).

**Chain:** `deepmerge-ts` ← `@prisma/config` ← **`prisma@7.9.1`** (dev CLI).

**Why not auto-fixed:** `npm audit fix --force` would install **prisma@6.x**, a breaking change. The stack is locked to Prisma **7.9.1** (PROJECT_PLAN D3). Application request handlers do not import `deepmerge-ts`. The CLI runs on operator machines / CI for generate and migrate, not on the public request path.

**Residual risk:** A crafted Prisma config merge in the CLI could exhaust stack. Operators should not pass untrusted Prisma config files. Revisit when Prisma 7 publishes a release that bumps `deepmerge-ts` without leaving 7.9.x compatibility.

**Rejected actions:** Do not `--force` to Prisma 6. Do not ignore the finding without this exception.

Swagger is disabled in production by default (SECURITY.md §14).

---

## 15. Admin and audit

High-risk admin actions write `AuditLog` (status, unpublish/close, legal-support, admin create/permissions). `GET /admin/audit-logs` requires `audit.read`; metadata redacted. Employees cannot read other users’ trails.

---

## 16. Security test cases

Covered in unit and e2e (auth, jobs, verification, membership, payments, admin, security sample headers): unauthenticated 401, wrong role 403, cross-org 403/404, suspended token, refresh reuse, duplicate application 409, mass-assignment rejected, verification does not create membership, join without verification rejected, production-mode errors without stack, Swagger spec without secrets.

---

## 17. Production blockers

Unchanged: M1–M14. Mocks and guards are implemented. Real KYC, SMS, email, payment gateway, object storage, hosting, CAPTCHA, malware scan, and device attestation are not.

---

## Review conclusion

No Aadhaar column. No known high-severity issue **without** a written exception: the Prisma CLI `deepmerge-ts` finding is recorded above. Helmet CSP is off only while Swagger is enabled; keep Swagger off in production.
