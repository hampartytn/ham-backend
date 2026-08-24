# ham-backend — API review (Phase 12)

**Project name:** ham-backend  
**Date:** 2026-08-24  
**Against:** [API_DESIGN.md](API_DESIGN.md)

Related: [SECURITY_REVIEW.md](SECURITY_REVIEW.md) · [README.md](../README.md)

This is a diff of the implemented NestJS surface vs the planning catalog. Intentional extras and known gaps are listed so they are not treated as accidents. No welfare HTTP was added in Phase 12.

---

## 1. Version prefix

| Surface | Path | Matches API_DESIGN |
| --- | --- | --- |
| Product API | `/api/v1/...` | Yes (`API_PREFIX=api`, URI version `1`) |
| Health | `/health`, `/ready` | Yes (version-neutral, not under `/api/v1`) |
| OpenAPI UI | `/docs` | Yes (not under `/api/v1`; `SWAGGER_PATH`) |
| OpenAPI JSON | `/docs-json` | Nest Swagger default companion to `/docs` |

No second unversioned product API. Clients use `{origin}/api/v1`.

---

## 2. Catalog implemented as specified

Auth (`/auth/register`, OTP, login, refresh, logout, password set/reset), `/me`, employee profile/skills/image, jobs browse + applications, employer profile/org/jobs/applicants/worker search, skills + skill-categories, geo, verification start/me/webhook/mock, membership get/info/join/decline/withdraw, legal-support categories/providers, payments initiate/get/webhook, admin users/jobs/legal-support/metrics/audit-logs/admins.

Pagination: offset max 50; public job feed is cursor-based. Error envelope `{ error: { code, message, details?, requestId } }`. Extra DTO fields → `VALIDATION_ERROR`.

---

## 3. Intentional extras (not in API_DESIGN.md)

These exist to support clients and Phase 3 security wiring. They are not accidental PII leaks.

| Method | Path | Why |
| --- | --- | --- |
| GET | `/api/v1/auth/session` | Current access-token session for the caller |
| GET | `/api/v1/admin/session` | Admin session + implicit permissions |
| GET | `/api/v1/admin/permissions/check` | Permission probe for admin UI |
| GET | `/api/v1/files/:fileId` | Authenticated download of stored profile/org files (upload is multipart on profile routes) |
| POST | `/api/v1/security/sample` | Phase 3 Helmet/validation sample. **Excluded from Swagger** (`@ApiExcludeController`). Not a product feature. |

---

## 4. Known gap (not implemented)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/v1/welfare/:slug` | API_DESIGN §15. `WelfareContent` is seeded (`COMING_SOON`). There is no welfare HTTP module. Documented limitation; not added in Phase 12. |

---

## 5. Error codes vs API_DESIGN table

API_DESIGN §1 lists: `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `ACCOUNT_SUSPENDED`, `ACCOUNT_BLOCKED`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `PROVIDER_UNAVAILABLE`, `INTERNAL_ERROR`.

Implemented extras (stable, used by clients):

| Code | Use |
| --- | --- |
| `INVALID_CREDENTIALS` | Password login (SECURITY.md generic failure) |
| `INVALID_OR_EXPIRED_CODE` | OTP verify |
| `NOT_ENABLED` | Membership withdraw (M9); payment stub disabled / non-stub provider (M6) |

---

## 6. Swagger / examples — PII

- Bearer scheme `bearer`; admin tag `admin`.
- Production: Swagger off unless `SWAGGER_ENABLED=true` plus basic auth.
- `POST /verification/mock/complete` is omitted from the **production** OpenAPI document (decorator + path delete). Runtime already 404s that route in production.
- `POST /security/sample` is not in the spec.
- Spec JSON must not contain `DATABASE_URL`, live JWT secrets, `passwordHash`, or card numbers. e2e asserts no `passwordHash` / `DATABASE_URL` / `CorrectHorse`.
- Worker-search and applicant payloads still omit phone, DOB, and identity numbers (M8 default). Admin user detail **does** include phone (API_DESIGN / Phase 11).

Do not paste live tokens or full identity numbers into Swagger “Try it out” in shared environments.

---

## 7. Behaviour notes (intentional vs plan)

| Topic | Implementation |
| --- | --- |
| Job posting vs payment | Ungated (D11). Organization `activationStatus` is not flipped by the stub. |
| Mock verification | Development/test only; production 404. |
| Membership withdraw | `409 NOT_ENABLED` until M9. |
| Payments | Stub; amount from env; no card storage. |

---

## 8. Conclusion

Version prefix is consistent. Extras are listed. The welfare GET is an explicit gap. OpenAPI examples are not a vehicle for secrets or full Aadhaar. No accidental PII fields were added to Swagger as sample values.
