# ham-backend

Single NestJS REST API for the **HAM Job & Worker Welfare Platform** (Tamil Nadu). One process serves React Native, Next.js employee web, the employer portal, and admin. There are no per-client backends and no microservices.

Product name is **HAM**. This repository is **ham-backend**. Database name is **`ham_backend`**. Do not rename HAM membership (`HamMembership`).

Planning and contracts: [docs/README.md](docs/README.md).

---

## 1. Project overview

ham-backend is a modular monolith: versioned JSON over REST at `/api/v1`, with version-neutral health checks at `/health` and `/ready`.

Auth is phone + password and phone OTP. JWT access tokens plus rotating hashed refresh tokens. Roles: `EMPLOYEE`, `EMPLOYER`, `ADMIN`, `SUPER_ADMIN`. Admin routes also require a permission; `SUPER_ADMIN` has all permissions without rows.

Identity verification is an adapter with a **mock** provider only. HAM membership is a separate explicit consent path and is never auto-joined on verification. Employer payments exist as a stub and **do not gate job posting**. Full Aadhaar is never stored.

---

## 2. Architecture overview

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

Runtime order: Helmet → CORS allowlist → request id → Pino (redacted) → Throttler → JWT → account status → roles → permissions → ownership and business state in services.

Integrations (`src/integrations/`) wrap identity verification, SMS, email, payments, and file storage. Domain modules must not import vendor SDKs directly.

---

## 3. Technology stack and pinned versions

| Layer | Pin |
| --- | --- |
| Node.js | **24.19.0** (`.nvmrc`); engines `^22.12.0 \|\| >=24.0.0` |
| npm | 10+ |
| NestJS | 11.x (`@nestjs/core`, Express adapter) |
| TypeScript | 5.7.x, `strict` |
| Prisma | **7.9.1** + `@prisma/client` + `@prisma/adapter-pg` + `pg` |
| PostgreSQL | **18**, database `ham_backend` |
| API | REST `/api/v1` |
| Auth | `@nestjs/jwt` 11.x, Argon2id (`argon2`) |
| Validation | class-validator + class-transformer |
| Config | `@nestjs/config` 4.x |
| Rate limit | `@nestjs/throttler` 6.x |
| Health | `@nestjs/terminus` 11.x |
| OpenAPI | `@nestjs/swagger` 11.x |
| Security headers | `helmet` 8.x |
| Logging | `nestjs-pino` + pino redaction |
| Tests | Jest + Supertest |

Do not upgrade Prisma to 8 or downgrade to 6. Prisma 7 uses the `pg` driver adapter and `moduleFormat = "cjs"`.

---

## 4. Prerequisites

- Node.js **24 LTS** (recommended; `nvm use`) or **22.12+**
- npm **10+**
- PostgreSQL **18** (pgAdmin is optional)
- An empty database named `ham_backend` on that server

On Windows, if `node` is not on PATH, use the install directory (commonly `C:\nodejs`).

---

## 5. Environment setup

`.env` is gitignored. Never commit secrets.

```bash
cp .env.example .env
```

Edit `.env` and set at least:

- `DATABASE_URL` (see §6)
- `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` (each ≥ 32 random characters, different from each other and from the example placeholders)

Placeholders and the full variable list live in [`.env.example`](.env.example). Production fails closed if secrets are missing, too short, or equal to example values. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

---

## 6. Database setup

Do not invent host, port, user, or password. Copy them from the **PostgreSQL 18** server that will hold `ham_backend`.

1. In pgAdmin, select the PostgreSQL **18** server (not 17).
2. Right-click → **Properties** → **Connection**.
3. Copy **Host name/address**, **Port** (18 is commonly `5433` on this machine; 17 is often `5432`), and **Username**.
4. Use that server’s password. If it contains `@`, `:`, `/`, `#`, or `%`, URL-encode it (`@` → `%40`).
5. Create an empty database named `ham_backend` if it does not exist.
6. In `.env` (not git):

```
DATABASE_URL=postgresql://USERNAME:PASSWORD@HOST:PORT/ham_backend?schema=public
```

Example shape only: `postgresql://postgres:YOUR_PASSWORD@localhost:5433/ham_backend?schema=public`.

Do not paste the real password into docs, chat, or git.

---

## 7. Installation

From `ham-backend/`:

```bash
nvm use
npm ci
```

If native `argon2` fails to install, use Node 22.12+ or 24 LTS with official prebuilds. Do not store plaintext passwords.

`npm ci` / `npm install` on a development machine should use `NODE_ENV=development` so devDependencies (including Prisma CLI) install.

---

## 8. Migration instructions

Generate the Prisma client (also runs as part of `npm run build`):

```bash
npx prisma generate
```

Apply migrations to an existing database (typical for a shared or deployed `ham_backend`):

```bash
npx prisma migrate deploy
```

Create a new migration during development (do not reset a database that has real data):

```bash
npx prisma migrate dev
```

Optional catalog seed (skills, Tamil Nadu districts, welfare `COMING_SOON` placeholders). Dev admin is created only when `NODE_ENV=development` and `SEED_DEV_ADMIN=true`:

```bash
npx prisma db seed
```

---

## 9. Running the development server

```bash
npm run start:dev
```

Default listen port is `3000` (`PORT` in `.env`).

- Liveness: `GET /health` → `{ "status": "ok" }`
- Readiness: `GET /ready` (database ping)
- API: `http://localhost:3000/api/v1/...`
- Swagger UI: `http://localhost:3000/docs`

Production process: `npm run build` then `npm run start:prod`. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

---

## 10. Testing instructions

Tests load `.env` then override `NODE_ENV=test`. e2e uses the live Postgres in `DATABASE_URL` (same `ham_backend` database, isolated phone prefixes). Do not run `prisma migrate reset`.

```bash
npm run lint
npm test
npm run test:e2e
npm run build
```

e2e runs with `maxWorkers: 1` and `node --experimental-vm-modules`. Unit tests cover guards, hashing, tokens, OTP, pagination, redaction, verification, membership, payments, and schema PII rules. e2e covers health, security headers, auth, users, jobs, verification, membership, legal support, payments, admin, and Swagger.

---

## 11. API documentation

- UI: `GET /docs` (not under `/api/v1`)
- OpenAPI JSON: `GET /docs-json`
- Configurable path: `SWAGGER_PATH` (default `docs`)

**Development / test:** Swagger is on unless `SWAGGER_ENABLED=false`.

**Production:** Swagger is **off** unless `SWAGGER_ENABLED=true`. If enabled in production or staging, `SWAGGER_USER` and `SWAGGER_PASSWORD` are required (HTTP Basic on `/docs` and `/docs-json`).

`POST /api/v1/verification/mock/complete` is omitted from the **production** OpenAPI document. `POST /api/v1/security/sample` is excluded from Swagger (Phase 3 sample, not a product route).

Bearer scheme name: `bearer`. Admin operations are tagged `admin`.

Contract review: [docs/API_REVIEW.md](docs/API_REVIEW.md) vs [docs/API_DESIGN.md](docs/API_DESIGN.md).

---

## 12. Security notes

Authoritative rules: [docs/SECURITY.md](docs/SECURITY.md). Implementation review: [docs/SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md).

- Never commit `.env`, passwords, JWT secrets, or provider keys.
- Never store full Aadhaar (or equivalent) in the schema, logs, URLs, or analytics.
- Never return `passwordHash`, `tokenHash`, `codeHash`, card data, or raw webhook bodies.
- Worker/applicant payloads do not include phone, DOB, or identity numbers (M8 conservative default).
- Production CORS must be an explicit allowlist (no `*`).
- `npm audit` high findings require a written exception; see the security review (Prisma CLI / `deepmerge-ts`).

---

## 13. Project structure

```
ham-backend/
  docs/                 # planning + Phase 12 reviews
  prisma/               # schema, migrations, seed
  prisma.config.ts
  src/
    main.ts
    app.module.ts
    app.setup.ts        # Helmet, CORS, pipes, prefix, Swagger
    config/
    common/             # guards, filters, decorators, error codes
    database/           # PrismaService, pagination
    open-api/           # Swagger policy + setup
    modules/            # auth, users, employees, employers, jobs, ...
    integrations/       # identity, SMS, email, payment, storage
  test/                 # e2e
  .env.example
```

---

## 14. Known limitations

These are unanswered product/ops items (PROJECT_PLAN M1–M14). Foundation uses adapters and mocks. Production go-live of the related feature is blocked until they are decided.

| ID | Limitation |
| --- | --- |
| M1 | No authorized identity-verification provider. Mock only. |
| M2 | DPDP lawful basis / retention for identity and HAM data not confirmed. |
| M3 | Default remains: do not store full Aadhaar. |
| M4 | No production SMS vendor. OTP uses the mock adapter. |
| M5 | No production email vendor. |
| M6 | Payment provider is a stub (`PAYMENT_PROVIDER=stub`). |
| M7 | Object storage is local disk (`FILE_STORAGE_PROVIDER=local`). |
| M8 | Worker-search field allowlist unset; API returns no phone/DOB/identity numbers. |
| M9 | Membership legal copy / withdraw: `POST /membership/withdraw` returns `NOT_ENABLED`. |
| M10 | Production admin bootstrap is not in source (dev seed only with flags). |
| M11 | Hosting target unknown. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — **hosting TBD**. |
| M12 | No CAPTCHA vendor. |
| M13 | No malware scanning for uploads. |
| M14 | No device attestation provider. |

Also unimplemented vs API_DESIGN: `GET /api/v1/welfare/:slug` (seed has `WelfareContent`; no HTTP module).

---

## 15. Future improvements

Do not treat this list as committed scope.

- Authorized KYC (M1–M3), SMS (M4), email (M5), payment gateway (M6), object storage (M7)
- Worker-search privacy allowlist (M8)
- Membership withdraw and legal copy (M9)
- Production admin bootstrap process (M10)
- Hosting, TLS proxy, and process manager once M11 is known
- Welfare content HTTP if product wants the seeded slugs
- HttpOnly cookie refresh for web (SECURITY.md); CSRF then required
- CAPTCHA / malware scan / Play Integrity only after M12–M14
