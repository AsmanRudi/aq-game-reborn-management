# Test Plan and Acceptance

## Test layers
- **Unit (Vitest):** duration calculation, rounding/minimum, rate selection and snapshot, report aggregation, timezone boundary conversion, status transitions, Zod validation, authorization policy.
- **API integration:** Express routes against isolated PostgreSQL test database; migrations applied to disposable database only. Verify transaction rollback and stable error responses.
- **Concurrency:** parallel booking/session requests to the same station and overlapping time range; exactly one request succeeds.
- **UI/component:** login errors, dashboard state legend, empty/loading/error states, confirmation dialogs, receipt and responsive layouts.
- **End-to-end smoke:** login, create customer, book/check-in, extend, stop, pay cash/manual QRIS, inspect receipt and reconcile report.
- **Operations:** backup artifact creation, isolated restore drill, post-restore row counts and health check.

## Core scenarios
1. Login with valid/invalid credentials; inactive user denied; password hash never appears in response.
2. Admin endpoint denied to cashier; unauthenticated call denied; expired session handled safely.
3. Station readiness is independent from operational state; active session and confirmed booking remain visible for unconfirmed station, and a session remains stoppable.
4. Rate effective-date selection at half-open boundaries; overlapping active pricing periods are rejected; edits do not affect historical booking/session snapshots.
5. Booking rejects end <= start, maintenance station, and overlapping booking; allows adjacent non-overlapping interval.
6. Concurrent booking and concurrent walk-in session race has one winner; DB state has no duplicate active station session.
7. Start time comes from server; timer refresh/reconnect does not affect billing. Stop after a known interval produces expected rounded charge.
8. Extension rechecks next booking and appends price/time adjustment; rejected extension leaves prior session unchanged.
9. Booking check-in atomically creates one session; cancellation requires reason and preserves booking history.
10. Cash and manual QRIS payments update balance atomically; duplicate idempotency key does not double charge; QRIS is labelled manually recorded.
11. Payment over outstanding balance rejected per policy; refunds/voids preserve original payment and require reason/authorization.
12. Reports across Asia/Jakarta midnight include exact intended rows; unpaid invoices are not counted as collected; refunds and expenses are separate.
13. Audit event exists for rate, station, booking cancellation, session stop, payment/refund, expense and staff role changes; secrets are absent.
14. Backup/restore runbook tested on disposable target and rejects production target without explicit reviewed procedure.

## Release acceptance
- All critical unit/API/concurrency scenarios pass in CI against the reviewed schema.
- No unresolved TypeScript, lint, build, migration, or test failure is represented as passing.
- Manual UI check on desktop, tablet, and narrow mobile confirms readable controls and visible station status distinctions.
- Cashier can complete a walk-in flow within a small number of clear steps; financial totals reconcile to ledger records.
- `.env.example`, migration instructions, backup/restore and deployment notes are complete; production deployment remains a separately approved action.
