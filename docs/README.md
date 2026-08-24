# ham-backend documents

This folder is the authoritative set for **ham-backend**, the single NestJS API for the HAM Job & Worker Welfare Platform.

| Document | Purpose |
| --- | --- |
| [PROJECT_PLAN.md](PROJECT_PLAN.md) | Context, stack, decisions, assumptions, missing requirements (M1–M14), README outline |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Modular monolith, modules, adapters, authorization, folder structure |
| [DATABASE_DESIGN.md](DATABASE_DESIGN.md) | Schema, constraints, indexes, state machines, delete rules |
| [SECURITY.md](SECURITY.md) | Authentication, tokens, PII, Aadhaar, logging, abuse controls |
| [API_DESIGN.md](API_DESIGN.md) | Versioned REST catalog with auth, ownership, DTOs, and errors |
| [IMPLEMENTATION_CHECKLIST.md](IMPLEMENTATION_CHECKLIST.md) | Sequential implementation sheet (Phases 0–12) |
| [SECURITY_REVIEW.md](SECURITY_REVIEW.md) | Phase 12 checklist vs SECURITY.md; `npm audit` exception |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Env, `migrate deploy`, process, health; **hosting TBD (M11)** |
| [API_REVIEW.md](API_REVIEW.md) | Phase 12 diff vs API_DESIGN.md; extras and gaps |

Product README (how to run the API): [../README.md](../README.md).
