# Technical Design

## Stack
- Frontend: React + TypeScript + Vite; Tailwind CSS and shadcn/ui components.
- API: Node.js + Express + TypeScript.
- Persistence: PostgreSQL + Prisma ORM.
- Input: Zod at API boundaries. Tests: Vitest plus API integration tests against an isolated test database.

This is a new project, independent of the existing FoodApp. The requested stack is used directly; no existing FoodApp files or data are shared.

## Deployment shape
Single web client and versioned REST API (`/api/v1`) backed by PostgreSQL. Production serves static frontend assets separately or from the API process. Configure HTTPS, trusted proxy settings, CORS allowlist, request size limits, structured logs, health/readiness endpoints, and secret injection at deployment. No secret is compiled into Vite variables.

## Suggested layout
```text
aq-game-reborn-management/
  apps/web/              React client
  apps/api/              Express API
  packages/contracts/    shared Zod schemas and DTO types
  prisma/schema.prisma
  prisma/migrations/
  docs/
```

Use one repository npm workspace to share validated API contracts. Avoid a separate service architecture for this MVP.

## API surface (MVP)
- `POST /api/v1/auth/login`, `POST /auth/logout`, `GET /auth/me`
- `GET/POST/PATCH /stations`, `POST /stations/:id/maintenance`, `DELETE` is not offered; deactivate instead.
- `GET/POST/PATCH /rates`; version/effective date changes preserve old snapshots.
- `GET/POST/PATCH /bookings`, `POST /bookings/:id/check-in`, `POST /bookings/:id/cancel`.
- `GET/POST /sessions`, `POST /sessions/:id/extend`, `POST /sessions/:id/stop`.
- `GET/POST /customers`, `GET /customers/:id/history`.
- `GET /invoices`, `POST /invoices/:id/payments`, `POST /payments/:id/refund` (authorized reason required), `GET /receipts/:id`.
- `GET /reports/summary?from=&to=`, `GET /reports/transactions`, `GET /reports/expenses`, `POST /expenses`.
- `GET /audit`; admin-only backup/restore operations should be operational tooling, not ordinary cashier APIs.

## Correctness and security
- Store timestamps as UTC `timestamptz`; send ISO 8601 instants. Format and compute local calendar ranges with `Asia/Jakarta`.
- Currency is integer IDR (no floating point). Keep rate snapshot, pricing policy version, duration, rounding, and computed line totals on booking/session/invoice.
- Use a PostgreSQL transaction with station row locking/serializable isolation and a database exclusion constraint for overlapping confirmed booking ranges where practical. Recheck maintenance/active session in the same transaction.
- Session elapsed display derives from API `startedAt` and current server time estimate. Billing uses server `endedAt - startedAt`, with documented rounding and minimum.
- Zod validates params, query, body and environment. Central error mapping provides stable error code/message; avoid leaking stack traces in production.
- Hash passwords with Argon2id or bcrypt at an appropriately high cost; rate-limit login; use secure, HttpOnly, SameSite cookies with CSRF protection if cookie auth is selected. Never persist plaintext passwords or expose hashes.
- Role middleware plus service-level authorization for admin/cashier actions; deny by default.
- Append-only audit records and immutable financial records; corrections append compensating entries.
- Use idempotency keys for payment submission/booking creation retries. Add request IDs and redact PII/secrets from logs.

## Current authentication and operational continuity status (2026-10-15)
- The current API has no authentication middleware or login/logout/me routes. `SESSION_SECRET` is validated in configuration but is not proof of an authenticated actor. `StaffUser.passwordHash` and `role` are schema fields only; the current routes do not verify credentials or roles.
- Existing write routes are `POST/PATCH /stations`, `POST /stations/:codeOrId/maintenance`, `POST/PATCH /rates`, `POST /sessions`, and `POST /sessions/:id/stop`. No booking or payment mutation routes are currently mounted. These routes are unauthenticated and are not production-safe; do not add administrative operations or expose the API to untrusted networks until authentication, role checks, and audit attribution are implemented.
- Do not trust a role supplied by the client. The intended design is to authenticate a persisted `StaffUser`, resolve its role server-side, authorize each operation (ADMIN for station setup and rate changes; operational roles as approved for session work), and append `AuditLog` entries in the same transaction for administrative changes. Login/session issuance, credential provisioning, session revocation, CSRF policy, and audit actor requirements still need an approved implementation.
- `setupConfirmed` is readiness metadata, not live operational status. Existing sessions and confirmed bookings must remain visible and actionable even when it is false. Only new rental starts are rejected until setup confirmation.

## Tariff rollout
- Keep the currently active tariff versions unchanged while target versions are staged inactive. Decide the effective instant before any transition. At approved instant `T`, transactionally set the prior rate's `effectiveTo=T` and the new rate's `effectiveFrom=T`, then activate the approved version after checking there is no active period overlap.
- Keep rate snapshots on existing bookings, sessions, and invoices unchanged. A tariff transition affects only new rentals after `T`; it is not performed by migration or seed.
- Current code validates half-open effective periods (`effectiveFrom <= now < effectiveTo`) and refuses ambiguous active rates at session start. Administrative activation and audited transition remain unavailable until authentication and role authorization exist.

## MVP milestones
1. Repository scaffold, health endpoint, DB connection, Prisma schema/migration, environment validation.
2. Staff auth/roles, audit foundation, station/rate setup.
3. Booking and station dashboard with overlap integrity.
4. Session timer, extension, stop, price snapshots.
5. Checkout/payments/receipt and customer directory.
6. Expenses/reports/backup-runbook, accessibility and responsive polish.

## Operations
Keep `.env` local and ignored; commit only `.env.example`. Use reviewed additive migrations. Back up with encrypted `pg_dump` artifacts, retention and restore drills; verify target database identity before restore. Deployment checklist and exact commands belong in the project README before release.
