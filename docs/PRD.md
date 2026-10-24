# Product Requirements — AQ GAME REBORN MANAGEMENT

**Status:** MVP specification, 15 October 2026  
**Business:** Rental PS3/PS4, Bungus Teluk Kabung, Padang, Sumatera Barat.

## Problem and outcome
Replace informal station/time/payment tracking with one operational record. A cashier should identify free and occupied stations quickly, start/extend/stop a rental without billing drift, and close the cashier shift with traceable totals. Admins need controlled configuration and reports without losing historical financial records.

## Users and access
- **Admin/pemilik:** all operational capabilities; manage staff, stations, tariffs/packages, booking policy, expenses, reports, audit review, and backup/restore operations.
- **Kasir:** dashboard, customer lookup/create, booking, rental lifecycle, payments/receipts, and operational reports allowed by policy. Cannot change access roles/tariffs, alter audit history, or run restore.
- **Pelanggan/member:** MVP is an internal cashier-managed record, not a customer portal. Membership stores identity/contact and optional discount eligibility; discount application must be explicit and auditable.

## MVP scope
1. Admin and cashier login, logout, session expiry, role authorization.
2. Live station board for PS3/PS4 with available, booked, active, and maintenance states.
3. Station and tariff/package CRUD with effective dates and immutable price snapshots.
4. Booking create/update/cancel and server-side overlap rejection.
5. Start/extend/stop rental sessions; server timestamps define billing duration.
6. Checkout, partial/full payment policy, cash/manual QRIS record, receipt, refund/void adjustment trail.
7. Customer/member directory and rental/payment history.
8. Date-filtered transaction/revenue/expense reports with payment-status definitions.
9. Append-only audit events and documented database backup/restore procedures.

## Out of scope for MVP
Automatic QRIS gateway settlement, TV control, WhatsApp notifications, customer self-service portal, multi-branch tenancy, inventory/accounting integration, and automated membership points. These require separate requirements and verified integrations.

## Functional requirements
- **Auth:** only seeded/admin-provisioned staff can access. Passwords are hashed; login errors do not disclose whether an account exists.
- **Station:** each station has a unique code, console generation (PS3/PS4), status, active flag, and optional notes. Maintenance blocks booking and sessions.
- **Pricing:** rates support hourly and package rules, currency IDR, effective interval and active flag. On booking/session creation, copy the applicable rule and amount into a snapshot.
- **Booking:** station, customer, expected start/end, status, notes, creator. Reject interval overlap for same station across confirmed bookings and active sessions; allow cancellation only with reason and audit.
- **Session:** start and end timestamps are server-owned. Extensions append a time/price adjustment record. Billable duration is derived from actual timestamps and frozen tariff snapshot with explicit rounding/minimum-charge rules.
- **Payment:** capture amount, method (`CASH`/`QRIS_MANUAL`), status, reference/notes, cashier and timestamp. QRIS is manually confirmed by cashier. Support outstanding balance and correction trail.
- **Reports:** date range uses Asia/Jakarta calendar boundaries converted to UTC. Show gross billed, paid, outstanding, refunds/voids, and expenses separately; do not call unpaid invoices revenue received.
- **Audit:** record actor, action, entity, entity ID, timestamp, request correlation ID, and safe before/after summary for sensitive changes. Never store password/token/payment secrets.
- **UX:** Indonesian, responsive desktop/tablet/mobile, electric-blue gaming visual system, visible station status legend, loading/empty/error states, confirmation for stop/cancel/refund/maintenance.

## Acceptance criteria
- Cashier can distinguish four station states from the dashboard without opening station detail.
- Two concurrent booking/session requests for overlapping station intervals cannot both succeed.
- Refreshing/reopening the dashboard does not reset elapsed session time; invoice duration matches server timestamps and documented rounding.
- Changing a tariff does not change historical booking/session charges.
- Unauthorized role requests return 403 and do not mutate data.
- Report totals reconcile to payment/refund/expense records for the selected local-date range and expose unpaid balance separately.
- Routine cashier flows cannot permanently delete bookings, sessions, payments, or audit entries.
- Manual QRIS is clearly labelled as cashier-recorded, with no claim of automatic verification.
- Backup and restore instructions include verification and safe environment checks.

## Risks and decisions to validate
- Confirm rounding (per-minute vs block), minimum charge, extension behavior, grace period, booking deposit/no-show policy, cancellation window, tax treatment, and whether packages include multiple players/controllers.
- Concurrent scheduling needs a database-level strategy (PostgreSQL exclusion constraint or serializable/locked station transaction), not only a preflight query.
- Restore is high impact: separate admin permission, explicit target environment verification, and tested backup artifacts are required.
