# ham-backend — Deployment

**Project name:** ham-backend  
**Date:** 2026-08-24  
**Hosting target:** **TBD** (PROJECT_PLAN **M11** is unanswered)

Related: [README.md](../README.md) · [PROJECT_PLAN.md](PROJECT_PLAN.md) · [SECURITY.md](SECURITY.md) · [SECURITY_REVIEW.md](SECURITY_REVIEW.md)

This document describes how to configure, migrate, build, and run the **existing** NestJS process. It does **not** invent a platform. Do not assume Kubernetes, Docker Swarm, ECS, or a specific PaaS until M11 is decided.

---

## 1. Hosting TBD (M11)

Until a hosting target is chosen, treat production as:

1. Node.js **24 LTS** (or 22.12+) on a host you control
2. PostgreSQL **18** with database `ham_backend`
3. TLS terminated at a reverse proxy in front of the Node process (SECURITY.md §2)
4. One long-running `node` process from `npm run start:prod`

Do not copy a Kubernetes manifest, Helm chart, or cloud-vendor tutorial into this repo as if it were the product’s deployment.

---

## 2. Environment

Copy [`.env.example`](../.env.example) to a secret store or a gitignored `.env` on the host. Never commit real values.

Required for production boot (`src/config/env.validation.ts`):

| Variable | Rule |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | PostgreSQL 18 URL to `ham_backend`. Not the example placeholder. |
| `JWT_ACCESS_SECRET` | ≥ 32 characters, not the example string |
| `JWT_REFRESH_SECRET` | ≥ 32 characters, different from access secret and example |
| `CORS_ORIGINS` | Explicit allowlist. Must not be empty and must not include `*` |

Strongly set in production:

| Variable | Production default / note |
| --- | --- |
| `SWAGGER_ENABLED` | Omit or `false`. UI is **off** unless this is exactly `true`. |
| `SWAGGER_USER` / `SWAGGER_PASSWORD` | Required **only if** Swagger is enabled |
| `IDENTITY_PROVIDER` | Keep `mock` until M1 is decided. Mock complete 404s when `NODE_ENV=production`. |
| `PAYMENT_PROVIDER` | `stub` until M6. May return `NOT_ENABLED`. |
| `SMS_PROVIDER` / `EMAIL_PROVIDER` | mock/stub until M4/M5 |
| `FILE_STORAGE_PROVIDER` | `local` until M7; ensure the directory is writable and backed up |
| `SEED_DEV_ADMIN` | `false`. No production passwords in env files checked into git. |

Webhook secrets (`IDENTITY_WEBHOOK_SECRET`, `PAYMENT_WEBHOOK_SECRET`) must be long random values shared with the provider, not the `.env.example` placeholders.

---

## 3. Database migrations

The application does not auto-migrate on boot. Apply Prisma migrations **before** (or as a release step immediately before) starting the new process:

```bash
npx prisma generate
npx prisma migrate deploy
```

`migrate deploy` applies existing migrations in `prisma/migrations/` and does not prompt. Do **not** run `prisma migrate reset` against a database that holds real data.

`npx prisma migrate dev` is for local development only.

---

## 4. Build and process

From `ham-backend/` with production Node and `npm ci` (include a production install that still has Prisma CLI available for `migrate deploy`, or run generate/migrate in a build image that has devDependencies):

```bash
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build
npm run start:prod
```

`start:prod` is `node dist/src/main.js` after `nest build` (TypeScript emits under `dist/src/` because the project `outDir` is `dist` without a `src` `rootDir`). Bind `PORT` (default `3000`) on localhost and put TLS on the proxy.

Use a process manager of your choice (systemd, NSSM, PM2, the host’s native service) once M11 is known. This repo does not ship a unit file.

Graceful shutdown and replica count are hosting concerns; the API is a single modular monolith and does not require a service mesh.

---

## 5. Health checks

Configure the proxy or host probe against the **unversioned** paths (not under `/api/v1`):

| Probe | Path | Expect |
| --- | --- | --- |
| Liveness | `GET /health` | `200` `{ "status": "ok" }` |
| Readiness | `GET /ready` | `200` when PostgreSQL ping succeeds; `503` when it does not |

Do not put `DATABASE_URL`, JWT material, or internal hostnames in health bodies. Responses must not include secrets.

Trust `X-Forwarded-Proto` / `X-Forwarded-For` only after the process is behind a **known** reverse proxy (`trust proxy` is not enabled by default).

---

## 6. Swagger in deployed environments

Default in `NODE_ENV=production`: Swagger is **not** served (`SWAGGER_ENABLED` must be `true` to turn it on).

If temporarily enabled in staging or production:

- Set `SWAGGER_USER` and `SWAGGER_PASSWORD`
- Basic auth gates `/docs` and `/docs-json`
- Helmet `contentSecurityPolicy` is turned off for the whole app while Swagger UI is on (needed for the UI). Prefer leaving Swagger off in production.
- Mock-complete is omitted from the production OpenAPI document even if the UI is on

---

## 7. What this document does not specify

Because M11 is missing:

- Cloud provider, region, VM vs container vs PaaS
- Kubernetes, Helm, or ingress objects
- Managed Postgres vs self-hosted (beyond “PostgreSQL 18, database `ham_backend`”)
- CI/CD vendor, blue/green, or secret-manager product names
