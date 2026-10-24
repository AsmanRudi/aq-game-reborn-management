# User Flows

## 1. Login and dashboard
1. Staff enters credentials; API validates, verifies password hash, and issues an expiring session/token.
2. UI loads station board and today's booking/session summary.
3. Each station displays one server-computed state: available, booked, active, or maintenance. API failure shows retryable error without presenting stale data as live.

## 2. Walk-in rental
1. Cashier optionally finds/creates customer; selects an available PS3/PS4 station and applicable hourly rate/package.
2. UI previews rate and billing policy. Cashier confirms start.
3. API transaction locks/checks station and overlapping reservations, creates session with `startedAt` from server clock and immutable rate snapshot, then returns session.
4. Dashboard timer renders `now - startedAt`; periodic refresh is display-only.
5. Cashier may add time: server checks availability against next booking, appends extension and price snapshot, then updates planned end.
6. Stop: cashier confirms; API records `endedAt`, computes charge with frozen pricing/rounding policy, creates invoice, and releases station atomically.
7. Cashier records cash or manual QRIS payment; balance and receipt show billed, paid, and remaining amounts.

## 3. Booking
1. Cashier selects date/time range, station or compatible station type, customer, and package/rate.
2. Availability API returns candidate stations; final create transaction rechecks overlap and maintenance state.
3. Confirmed booking stores time range and tariff snapshot. Conflicts return 409 and refresh availability.
4. At arrival, cashier checks in; transaction converts booking to active session while ensuring no other active session exists.
5. Cancellation requires reason, updates status (never deletes record), and writes audit event. Expired/no-show policy must be configured before automated expiry is enabled.

## 4. Payment and receipt
1. Cashier opens unpaid/part-paid invoice, enters amount and method.
2. For QRIS manual, cashier verifies payment externally and explicitly records confirmation; UI labels it manual.
3. API validates positive amount and outstanding balance (unless an authorized overpayment policy is adopted), creates immutable payment record, recalculates balance transactionally.
4. Receipt shows receipt number, station, time, duration, rate snapshot, billed amount, payments by method, balance, cashier, and local time.
5. Mistakes use refund/void/adjustment flow with reason and audit, not payment deletion.

## 5. Station maintenance and pricing
- Admin marks a free station as maintenance with reason; booking/session creation rejects it. Ending maintenance restores availability after overlap checks.
- Admin creates a new rate version with effective dates. Existing snapshots remain unchanged. Prevent overlapping active effective periods for the same rate key.

## 6. Reports and closeout
1. Admin/cashier chooses a local-date range and optional station/console/payment filters.
2. UI sends explicit range; API converts local day boundaries to UTC and aggregates only matching records.
3. Report separates billed, collected, outstanding, refunded/voided, cash, manual QRIS, and expenses.
4. Admin reviews audit trail and backup status; backup/restore actions require elevated permission and documented target checks.
