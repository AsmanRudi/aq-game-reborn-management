-- Additive foundation migration. Existing financial and operational rows are retained.
CREATE TYPE "StationDeviceType" AS ENUM ('CONSOLE', 'PS_BOX');

CREATE TYPE "RewardLedgerEntryType" AS ENUM (
    'PAID_MINUTES_EARNED',
    'FREE_MINUTES_EARNED',
    'REWARD_REDEEMED',
    'CORRECTION',
    'REVERSAL'
);

CREATE TYPE "VoucherStatus" AS ENUM ('ISSUED', 'REDEEMED', 'EXPIRED', 'VOID');

ALTER TABLE "Station"
    ADD COLUMN "displayName" TEXT,
    ADD COLUMN "deviceType" "StationDeviceType" NOT NULL DEFAULT 'CONSOLE',
    ADD COLUMN "setupConfirmed" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Rate"
    ADD COLUMN "deviceType" "StationDeviceType" NOT NULL DEFAULT 'CONSOLE';

CREATE TABLE "RewardLedger" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "entryType" "RewardLedgerEntryType" NOT NULL,
    "paidMinutes" INTEGER NOT NULL DEFAULT 0,
    "rewardMinutes" INTEGER NOT NULL DEFAULT 0,
    "idempotencyKey" TEXT NOT NULL,
    "reason" TEXT,
    "sourceSessionId" UUID,
    "sourceInvoiceId" UUID,
    "recordedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RewardLedger_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Voucher" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "status" "VoucherStatus" NOT NULL DEFAULT 'ISSUED',
    "customerId" UUID,
    "issuedById" UUID,
    "redeemedBySessionId" UUID,
    "expiresAt" TIMESTAMPTZ(3),
    "redeemedAt" TIMESTAMPTZ(3),
    "voidedAt" TIMESTAMPTZ(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Voucher_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RewardLedger_idempotencyKey_key" ON "RewardLedger"("idempotencyKey");
CREATE INDEX "RewardLedger_customerId_createdAt_idx" ON "RewardLedger"("customerId", "createdAt");
CREATE INDEX "RewardLedger_sourceSessionId_idx" ON "RewardLedger"("sourceSessionId");
CREATE INDEX "RewardLedger_sourceInvoiceId_idx" ON "RewardLedger"("sourceInvoiceId");

CREATE UNIQUE INDEX "Voucher_code_key" ON "Voucher"("code");
CREATE INDEX "Voucher_status_expiresAt_idx" ON "Voucher"("status", "expiresAt");
CREATE INDEX "Voucher_customerId_createdAt_idx" ON "Voucher"("customerId", "createdAt");
CREATE INDEX "Voucher_redeemedBySessionId_idx" ON "Voucher"("redeemedBySessionId");

ALTER TABLE "RewardLedger"
    ADD CONSTRAINT "RewardLedger_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "RewardLedger_sourceSessionId_fkey"
    FOREIGN KEY ("sourceSessionId") REFERENCES "RentalSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "RewardLedger_sourceInvoiceId_fkey"
    FOREIGN KEY ("sourceInvoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "RewardLedger_recordedById_fkey"
    FOREIGN KEY ("recordedById") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Voucher"
    ADD CONSTRAINT "Voucher_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "Voucher_issuedById_fkey"
    FOREIGN KEY ("issuedById") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "Voucher_redeemedBySessionId_fkey"
    FOREIGN KEY ("redeemedBySessionId") REFERENCES "RentalSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
