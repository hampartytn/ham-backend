# ham-backend — Security Plan

**Project name:** ham-backend  
**Status:** Planning complete  
**Date:** 2026-08-24

Related: [PROJECT_PLAN.md](PROJECT_PLAN.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [DATABASE_DESIGN.md](DATABASE_DESIGN.md) · [API_DESIGN.md](API_DESIGN.md)

Security is an architecture concern, not a final polish step. This document is the rule set for implementation.

---

## 1. Goals

- Secure by default
- Least privilege
- Data minimization
- Server-side enforcement of authn, authz, ownership, and business state
- No secrets in git
- Safe errors and logs
- Treat identity verification and HAM membership as high-risk

ham-backend does **not** claim that root/jailbreak detection, JWT, or HTTPS make the system unhackable. Controls reduce risk; they do not eliminate it.

---

## 2. Transport and HTTP

| Control | v1 rule |
| --- | --- |
| HTTPS | Required in staging and production. TLS terminated at the reverse proxy. Application assumes `X-Forwarded-Proto` only from a trusted proxy. |
| Helmet | Enable in `main.ts` (`helmet()` on Express). |
| CORS | Allowlist from `CORS_ORIGINS`. No `*` in production. Credentials only if cookie transport is later enabled. |
| CSRF | Not required for v1 Bearer-only API. If HttpOnly cookies are added later, add CSRF for cookie-authenticated browser calls. |
| Body size | Limit JSON body (for example 64 KB default; larger only on upload routes). |
| Trust proxy | Configure only behind a known reverse proxy. |

---

## 3. Authentication

### 3.1 Password hashing

- Algorithm: **Argon2id** via npm `argon2`.
- Never return `passwordHash`.
- Rehash on login if parameters change (`argon2.needsRehash`).
- Fallback if native bindings fail on a host: bcrypt, with a documented migration path. Do not silently store plaintext.

Recommended starting parameters (tune on production hardware so a hash is slow enough but login remains usable under throttle):

- `type`: argon2id
- `memoryCost`: 65536 (64 MiB) as a floor
- `timeCost`: 3
- `parallelism`: 1 for typical API concurrency (avoid starving the event loop with high `p` per request)

### 3.2 Access tokens

- JWT, signed with `JWT_ACCESS_SECRET` (min 32 random bytes; fail boot if weak).
- Payload: `sub` (user id), `role`, `jti` optional. **No** phone, email, Aadhaar, or permissions dump if it bloats and leaks.
- TTL: **15 minutes** (`JWT_ACCESS_EXPIRES_IN`).
- Algorithm: HS256 in v1 with a long secret. RS256 is a future option if multiple services must verify tokens; not needed for a monolith.

### 3.3 Refresh tokens

- Opaque random token (32+ bytes), **not** a JWT that is trusted without DB lookup.
- Store **SHA-256 hash** only (`tokenHash`).
- TTL: **14 days**.
- **Rotation:** each refresh issues a new token, marks old row revoked, links `replacedByTokenId`, same `familyId`.
- **Reuse detection:** presenting a revoked token in a still-valid family revokes **the entire family** and records `AuthEvent` type `REFRESH_REUSE`. User must log in again.
- Logout revokes the current family (or all families if “logout everywhere”).

### 3.4 OTP

- Cryptographically random numeric or alphanumeric code.
- Store hash only. TTL ~5 minutes. Max 5 attempts then consume/lock that challenge.
- One active challenge per `(phone, purpose)`; requesting a new OTP invalidates the previous unused challenge.
- Generic responses: do not reveal whether the phone is registered on LOGIN OTP request (same timing and message as “if this number is eligible, a code was sent”).
- REGISTER OTP may confirm creation without revealing other accounts.
- Production SMS: provider adapter. Development mock must **not** print OTPs in production log format; development-only logger field is acceptable when `NODE_ENV=development`.

### 3.5 Login error policy

Use generic messages:

- Password login failure: `INVALID_CREDENTIALS` (same for unknown phone and wrong password).
- OTP verify failure: `INVALID_OR_EXPIRED_CODE`.
- Do not reveal “user exists” vs “wrong password”.

Exceptions: after authentication, account status errors may be explicit (`ACCOUNT_SUSPENDED`, `ACCOUNT_BLOCKED`) so the user knows why they cannot proceed.

### 3.6 Account status

On every authenticated request (guard):

- Reject if `deletedAt` is set
- Reject `SUSPENDED` and `BLOCKED`
- `PENDING_PHONE` may only call OTP verify / limited auth routes

### 3.7 Transport to clients (v1)

- Header: `Authorization: Bearer <accessToken>`.
- Refresh token in JSON body to `POST /api/v1/auth/refresh` and `POST /api/v1/auth/logout`.
- **Web future:** HttpOnly, Secure, SameSite=Strict (or Lax if cross-site frontend/API split requires Lax), `__Host-` prefix if possible. Not implemented in v1.
- **Mobile:** platform-secure storage (iOS Keychain, Android Keystore). Never AsyncStorage for tokens. This is a client rule; the API still behaves as if the client is hostile.

The API must not depend on frontend security.

---

## 4. Authorization

Layered, in order:

1. `@Public()` or JWT
2. Account status
3. `@Roles(...)`
4. `@RequirePermissions(...)` for admin routes
5. Ownership in the service (load resource, compare `organizationId` / `userId`)
6. Business state (job published, etc.)

**Never** allow an employer to mutate another employer’s job because they share the `EMPLOYER` role.

SUPER_ADMIN is the only role that can create/disable ADMIN users and assign `admins.manage` capabilities.

---

## 5. Input validation and mass assignment

- Global `ValidationPipe`: `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`.
- Explicit DTOs per endpoint. No `Prisma.UserCreateInput` as body type.
- IDs: UUID format validation.
- Phone: E.164 pattern.
- Pagination: `page >= 1`, `1 <= limit <= 50`.
- Sort: enum of allowed fields only.
- Filters: allowlisted properties only.

---

## 6. Output filtering

Never return:

- `passwordHash`, `tokenHash`, `codeHash`
- Refresh tokens except in the dedicated auth response that the client must store (and never log)
- Encryption keys
- Full identity numbers
- Raw provider webhook bodies
- Internal audit metadata that includes IPs to non-admin clients
- Stack traces (`NODE_ENV=production`)

Mask identity as `maskedIdentity` only when needed for the owner or a permitted admin.

---

## 7. Logging and redaction

Pino redact paths (minimum):

`password`, `passwordHash`, `accessToken`, `refreshToken`, `authorization`, `cookie`, `otp`, `code`, `aadhaar`, `uid`, `secret`, `clientSecret`, `cardNumber`, `cvv`, `pan`, `DATABASE_URL`

Rules:

- Log `requestId`, method, path, status, duration, `userId` after auth.
- Do not log request bodies on auth routes.
- Do not log VerificationRequest metadata dumps.
- Audit log metadata must pass through the same redaction helper.

---

## 8. Error handling

Stable envelope (see API_DESIGN.md):

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [{ "field": "phone", "issue": "isE164" }],
    "requestId": "..."
  }
}
```

- Production: no stack in body. Stack in logs only.
- Database errors: map unique violations to `CONFLICT`; otherwise `INTERNAL_ERROR` without leaking SQL.
- Provider failures: `PROVIDER_UNAVAILABLE` with retry only where idempotent.

---

## 9. Rate limiting and abuse

Global: `@nestjs/throttler` (for example 100 requests / 60s / IP).

Stricter named limits on:

- `POST /auth/login`
- `POST /auth/otp/request`
- `POST /auth/otp/verify`
- `POST /auth/password/reset`
- `POST /auth/refresh`

Account lockout: after N failed password attempts in a window, delay or temporary lock. Record `AuthEvent`. Do not create a user-enumerating “locked” difference for unknown phones.

CAPTCHA: only if abuse requires it (M12). Not in v1 by default.

File uploads: MIME allowlist (jpeg/png/webp for profile), size cap (2 MiB default), magic-byte check, generated keys.

---

## 10. Sensitive data and Aadhaar / identity

Treat identity verification and political membership as legally sensitive.

### Must not

- Simulate official UIDAI Aadhaar verification as if it were production KYC
- Store full Aadhaar (or equivalent) in User, logs, URLs, analytics, or PKs
- Use Aadhaar as user id
- Couple HAM membership to verification success
- Ship a real provider integration before M1–M3 are confirmed

### Must

- Use `IdentityVerificationProvider` adapter
- Mock provider for development and tests
- Store provider reference + status + optional **masked** identifier
- If full identifier retention is ever legally required: dedicated encrypted vault, key management, Aadhaar Data Vault review — **out of default design**

UIDAI online eKYC is limited to authorized AUA/KUA/Sub-KUA entities. ham-backend is not assumed to be one. Production KYC is blocked until an authorized path exists.

HAM consent stores: timestamp, terms version, explicit action, IP/user-agent as evidence. Not biometric templates. Not Aadhaar.

DPDP Act and purpose limitation (M2) must be reviewed before production storage of verification and membership data.

---

## 11. Payments (when enabled)

- Server creates the order.
- Client receives only fields needed to open the checkout SDK.
- Webhook: verify signature, idempotent on `providerEventId`.
- Never trust client “payment successful”.
- Never store PAN/card/CVV/UPI secrets.
- v1: **do not gate job posting** on payment.

---

## 12. Device integrity

Root/jailbreak detection is a **mobile client** signal. Backend may later accept `X-Device-Integrity` and treat it as a risk input for sensitive actions (join HAM, start verification).

- Never rely solely on this header.
- Never claim the app is unhackable because of it.
- Sensitive operations remain protected by authn/authz even if a client is compromised.

v1: header ignored or logged as unknown; do not fail closed on missing attestation until a provider (M14) is chosen.

---

## 13. Secrets and configuration

- `.env` gitignored. `.env.example` has placeholders only.
- Validate env at boot. Production fail-closed on missing JWT secrets, `DATABASE_URL`, or example/default secrets.
- Separate secrets per environment.
- No encryption keys hard-coded.

---

## 14. Dependency and process security

- `npm ci` in CI.
- `npm audit` on a schedule; do not ignore high/critical without a written exception.
- Prisma parameterized queries.
- No `eval` of user input.
- Swagger disabled in production by default.

---

## 15. Admin and audit

High-risk actions **must** write `AuditLog`:

- User block/suspend/restore
- Role/permission changes
- Job unpublish/force close
- Legal-support create/update/delete
- Super-admin operations

Actors see only what their permission allows. Employees never receive other users’ audit trails.

---

## 16. Security test cases (required)

- Unauthenticated access to protected routes → 401
- Wrong role → 403
- Employer A token on employer B job → 403
- Suspended user with valid token → 403 `ACCOUNT_SUSPENDED`
- Refresh reuse → family revoked
- Duplicate job application → 409
- Mass-assignment of `role` or `accountStatus` on profile update → rejected
- Verification success does not create HAM membership
- Join HAM without verification → 409/403 per API_DESIGN
- Error body has no stack in production mode
- Auth logs contain no password or OTP code

---

## 17. Production blockers (legal / vendor)

See PROJECT_PLAN.md M1–M14. Security implementation of mocks and guards can proceed. Real KYC, real SMS, and production PII retention cannot proceed without those decisions.
