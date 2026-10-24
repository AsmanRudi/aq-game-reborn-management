# Database Design

PostgreSQL is the authoritative store. Primary keys are UUIDs unless a human-facing receipt/booking number is generated separately. All timestamps are `timestamptz` in UTC; local display zone is Asia/Jakarta. Amounts use integer IDR.

## Entities and relations
- **StaffUser** is the internal `User` model (`id`, `name`, normalized unique `email`, `passwordHash`, `role` ADMIN/CASHIER, `active`, timestamps): actor for operational records. A separate User model would duplicate staff identity.
- **Station** (`id`, unique `code`, `displayName?`, `consoleType` PS3/PS4, `deviceType` CONSOLE/PS_BOX, `setupConfirmed`, `active`, `maintenanceReason`, timestamps): one physical rental unit. `setupConfirmed` is readiness metadata, not an operational status. Always surface existing active sessions and confirmed bookings regardless of setup confirmation; only allow a new rental when setup is confirmed and the station is otherwise eligible. Derived operational state prioritizes active session, current confirmed booking, maintenance, then available.
- **Rate** is the canonical `PricingPackage` model for both hourly rates and time packages; a second pricing table would duplicate the same price/snapshot concepts. It stores (`id`, `key`, `version`, `name`, `consoleType?`, `deviceType` CONSOLE/PS_BOX, `billingMode`, `amount`, `durationMinutes?`, `minimumMinutes`, `roundingMinutes`, `effectiveFrom`, `effectiveTo?`, `active`). Amounts remain integer Rupiah. Rates must match the device type and console generation. A rate key/version is unique; published changes create new versions rather than rewriting snapshots.
- **Customer** (`id`, `name`, `phone?`, `notes?`, `memberNumber?`, `memberStatus`, timestamps): optional association to bookings/sessions; unique member number when present.
- **Booking** (`id`, unique `number`, `stationId`, `customerId?`, `rateId`, `rateSnapshot` JSON, `startsAt`, `endsAt`, `status`, `cancelReason?`, `createdById`, timestamps`): immutable historical pricing snapshot; station and creator FKs restricted from hard deletion.
- **RentalSession** (`id`, unique `number`, `stationId`, `bookingId?` unique nullable, `customerId?`, `rateId?`, `rateSnapshot` JSON, `startedAt`, `plannedEndAt?`, `endedAt?`, `status`, `createdById`, `stoppedById?`, `billedDurationMinutes?`, `totalAmount?`, timestamps`). At most one active session per station via partial unique index.
- **SessionAdjustment** (`id`, `sessionId`, `type` EXTENSION/ADJUSTMENT, `minutes?`, `amountDelta`, `reason`, `rateSnapshot?`, `createdById`, `createdAt`): append-only changes.
- **Invoice** (`id`, unique `number`, `sessionId` unique, `customerId?`, `subtotal`, `discount`, `total`, `status` UNPAID/PARTIAL/PAID/VOID, `issuedAt`, `pricingSnapshot` JSON`).
- **Payment** (`id`, `invoiceId`, unique idempotency key, `amount`, `method` CASH/QRIS_MANUAL, `status` CONFIRMED/REFUNDED/VOID, `reference?`, `recordedById`, `recordedAt`): no cascade deletes.
- **PaymentAdjustment** (`id`, `paymentId`, `amount`, `type` REFUND/VOID, `reason`, `approvedById`, `createdAt`): compensating financial record.
- **Expense** (`id`, `category`, `description`, `amount`, `occurredAt`, `recordedById`, `voidedAt?`, `voidReason?`): corrections are audited, retained.
- **RewardLedger** (`id`, `customerId`, `entryType`, `paidMinutes`, signed `rewardMinutes`, unique `idempotencyKey`, `sourceSessionId?`, `sourceInvoiceId?`, `recordedById?`, `reason?`, `createdAt`): append-only source for earned, redeemed, corrected, and reversed reward balances. This schema does not activate reward calculation or redemption.
- **Voucher** (`id`, unique `code`, `durationMinutes`, `status` ISSUED/REDEEMED/EXPIRED/VOID, `customerId?`, `issuedById?`, `redeemedBySessionId?`, `expiresAt?`, `redeemedAt?`, void metadata, timestamps): one auditable voucher record. Expiration, cancellation and combination rules remain unconfigured; no vouchers are issued by database setup.
- **AuditLog** (`id`, `actorId?`, `action`, `entityType`, `entityId`, `before?`, `after?`, `requestId?`, `createdAt`): append-only; no update/delete for application roles.

`Invoice` is the existing transaction/charge record; a parallel `Transaction` model is intentionally not introduced.

## Relationship outline
```text
StaffUser ──< Booking, RentalSession, Payment, Expense, AuditLog, Voucher
Station ──< Booking, RentalSession
Customer ──< Booking, RentalSession, Invoice, RewardLedger, Voucher
Rate ──< Booking, RentalSession (reference only; snapshots govern history)
Booking ──0..1 RentalSession
RentalSession ──1 Invoice ──< Payment ──< PaymentAdjustment
RentalSession ──< SessionAdjustment
RentalSession ──< Voucher (redemption reference)
```

## Integrity rules
- Check `amount >= 0`, positive payment/expense amounts, `endsAt > startsAt`, and valid billing intervals.
- Prevent overlapping CONFIRMED bookings for the same station using a PostgreSQL range exclusion constraint; prevent booking vs active session conflict in a locked serializable transaction. Maintenance also rejects creation/check-in.
- Partial unique index on `RentalSession(stationId) WHERE status='ACTIVE'`.
- Enforce booking transition and session transition in service code: booking CONFIRMED → CHECKED_IN/CANCELLED/NO_SHOW; session ACTIVE → COMPLETED. Terminal records are never reopened by ordinary cashier flow.
- Payment total cannot exceed invoice outstanding balance unless overpayment/refund policy is explicitly approved. Invoice status derives transactionally from confirmed payments and adjustments.
- Reports use `occurredAt`/`recordedAt` semantics documented per metric and local-date boundaries. Collected revenue counts confirmed payments net of refunds, not invoice totals.
- Audit and financial history are retained. Soft-void/compensating entries are used instead of deletion.
- Snapshot includes rate ID/version, pricing mode, unit amount, duration unit, minimum, rounding, discount and policy version.
- PS3/PS4 hourly and PS Box package values are validated as separate device types. PS Box package rows remain inactive until billing policies and station setup are approved.
- Station setup is explicitly unconfirmed until owner/admin verification. A confirmed status cannot be inferred from an empty schedule or from a seeded record.

## Seed safety and pending business decisions
- `npm run db` and `npm run db:seed` default to read-only planning. They report station/rate create-or-skip actions, current active tariffs, period risks, operational record counts, and prerequisites. Against a pre-migration schema the plan is explicitly marked incomplete; `--apply` refuses to write until required columns exist.
- Seed never creates staff credentials, sample customers, bookings, sessions, invoices, payments, or expenses. Existing station settings and every existing rate version are retained. Existing station/rate records are skipped only after identity/configuration checks; mismatches stop before writes.
- Seed never deactivates legacy tariffs and never activates target tariffs. New stations are created with `setupConfirmed=false`; PS3/PS4 hourly and PS Box package records are created inactive only when the owner explicitly requests apply and supplies a reviewed `AQ_RATE_EFFECTIVE_FROM` ISO-8601 instant.
- A future tariff transition must be an explicit audited operation at an approved instant `T`: retain the previous rate and all snapshots, end its effective period at `T` (exclusive), set the new version's start to `T`, and activate only the approved version in one transaction. Check all active rate periods first. This transition is not currently implemented or authorized; do not use seed to perform it.
- Migration defaults existing stations to `setupConfirmed=false`; this does not erase or close session/booking rows. Dashboard and station status must still show active sessions and confirmed bookings. Confirm setup only after physical verification using a future authenticated admin workflow.
- Authentication and role authorization are not implemented in the current API. Existing station/rate/session write routes must not be treated as safe for production. No station-confirmation or tariff-transition endpoint may be exposed until verified actor identity, admin-role checks, and audit writes are implemented.
- Still to confirm: rental billing rounding/minimum and overtime, package extension, how paid minutes are attributed for partially paid invoices, reward expiry and cancellation reversal, voucher expiry/void/reissue, reward-voucher combination, authentication/session design and staff credential provisioning, and which admin role may confirm station setup or activate prices.
