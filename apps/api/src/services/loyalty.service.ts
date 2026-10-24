import { Prisma, RewardLedgerEntryType, VoucherStatus } from '@prisma/client';
import { prisma } from '../db.js';
import type { AuthenticatedUser } from './auth.service.js';
import { recordAuditEvent } from './audit.service.js';

export class LoyaltyServiceError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'LoyaltyServiceError';
  }
}

export interface CustomerLoyaltySummary {
  customerId: string;
  totalPaidMinutes: number;
  totalRewardMinutesEarned: number;
  totalRewardMinutesRedeemed: number;
  currentBalanceMinutes: number;
  activeVouchersCount: number;
  vouchers: Array<{
    id: string;
    code: string;
    durationMinutes: number;
    status: VoucherStatus;
    expiresAt: Date | null;
    createdAt: Date;
  }>;
}

/**
 * Calculates and awards loyalty minutes for paid rental time.
 * Every 600 paid minutes (10 hours) generates 60 free minutes (1 hour) and an issued voucher.
 */
export async function recordPaidRentalReward(
  tx: Prisma.TransactionClient,
  params: {
    customerId: string;
    sessionId?: string;
    invoiceId?: string;
    paidMinutes: number;
    actor: AuthenticatedUser;
  }
) {
  if (params.paidMinutes <= 0) return null;

  const idempotencyKey = `REWARD-PAID-${params.sessionId || params.invoiceId || Date.now()}`;

  // Check if reward already recorded for this session/invoice
  const existing = await tx.rewardLedger.findUnique({
    where: { idempotencyKey },
  });
  if (existing) return existing;

  // 1. Calculate previous accumulated paid minutes
  const prevPaidLedgers = await tx.rewardLedger.aggregate({
    where: {
      customerId: params.customerId,
      entryType: RewardLedgerEntryType.PAID_MINUTES_EARNED,
    },
    _sum: { paidMinutes: true },
  });
  const prevTotalPaidMinutes = prevPaidLedgers._sum.paidMinutes ?? 0;
  const newTotalPaidMinutes = prevTotalPaidMinutes + params.paidMinutes;

  // 2. Record PAID_MINUTES_EARNED
  const paidEntry = await tx.rewardLedger.create({
    data: {
      customerId: params.customerId,
      entryType: RewardLedgerEntryType.PAID_MINUTES_EARNED,
      paidMinutes: params.paidMinutes,
      rewardMinutes: 0,
      idempotencyKey,
      sourceSessionId: params.sessionId,
      sourceInvoiceId: params.invoiceId,
      recordedById: params.actor.userId,
      reason: `Akumulasi waktu sewa berbayar: ${params.paidMinutes} menit`,
    },
  });

  // 3. Check if a new threshold of 600 minutes (10 hours) was crossed
  const prevRewardTier = Math.floor(prevTotalPaidMinutes / 600);
  const newRewardTier = Math.floor(newTotalPaidMinutes / 600);
  const vouchersToIssue = newRewardTier - prevRewardTier;

  if (vouchersToIssue > 0) {
    for (let i = 0; i < vouchersToIssue; i++) {
      const voucherCode = `VCH-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 days validity

      // Create Voucher
      const voucher = await tx.voucher.create({
        data: {
          code: voucherCode,
          durationMinutes: 60,
          status: VoucherStatus.ISSUED,
          customerId: params.customerId,
          issuedById: params.actor.userId,
          expiresAt,
        },
      });

      // Record FREE_MINUTES_EARNED in Ledger
      await tx.rewardLedger.create({
        data: {
          customerId: params.customerId,
          entryType: RewardLedgerEntryType.FREE_MINUTES_EARNED,
          paidMinutes: 0,
          rewardMinutes: 60,
          idempotencyKey: `REWARD-AWARD-${voucher.id}`,
          sourceSessionId: params.sessionId,
          sourceInvoiceId: params.invoiceId,
          recordedById: params.actor.userId,
          reason: `Hadiah loyalitas 10 jam sewa: Voucher 60 menit (${voucher.code})`,
        },
      });

      await recordAuditEvent(tx, params.actor, {
        action: 'LOYALTY_VOUCHER_ISSUED',
        entityType: 'Voucher',
        entityId: voucher.id,
        after: {
          code: voucher.code,
          customerId: params.customerId,
          durationMinutes: 60,
          expiresAt: expiresAt.toISOString(),
        },
      });
    }
  }

  return paidEntry;
}

/**
 * Redeems a 60-minute voucher for a session.
 */
export async function redeemVoucherForSession(
  tx: Prisma.TransactionClient,
  params: {
    voucherCode: string;
    sessionId: string;
    customerId?: string;
    actor: AuthenticatedUser;
  }
) {
  const normalizedCode = params.voucherCode.trim().toUpperCase();
  const voucher = await tx.voucher.findUnique({
    where: { code: normalizedCode },
  });

  if (!voucher) {
    throw new LoyaltyServiceError('VOUCHER_NOT_FOUND', `Voucher '${normalizedCode}' tidak ditemukan.`, 404);
  }

  if (voucher.status !== VoucherStatus.ISSUED) {
    throw new LoyaltyServiceError(
      'VOUCHER_ALREADY_USED',
      `Voucher '${normalizedCode}' sudah tidak berlaku (status: ${voucher.status}).`,
      409
    );
  }

  if (voucher.expiresAt && voucher.expiresAt < new Date()) {
    await tx.voucher.update({
      where: { id: voucher.id },
      data: { status: VoucherStatus.EXPIRED },
    });
    throw new LoyaltyServiceError(
      'VOUCHER_EXPIRED',
      `Voucher '${normalizedCode}' telah kedaluwarsa pada ${voucher.expiresAt.toLocaleDateString('id-ID')}.`,
      409
    );
  }

  if (voucher.customerId && params.customerId && voucher.customerId !== params.customerId) {
    throw new LoyaltyServiceError(
      'VOUCHER_CUSTOMER_MISMATCH',
      `Voucher '${normalizedCode}' terdaftar atas nama pelanggan lain.`,
      403
    );
  }

  // Update voucher to REDEEMED
  const updatedVoucher = await tx.voucher.update({
    where: { id: voucher.id },
    data: {
      status: VoucherStatus.REDEEMED,
      redeemedAt: new Date(),
      redeemedBySessionId: params.sessionId,
    },
  });

  // Record REWARD_REDEEMED in ledger
  if (voucher.customerId) {
    await tx.rewardLedger.create({
      data: {
        customerId: voucher.customerId,
        entryType: RewardLedgerEntryType.REWARD_REDEEMED,
        paidMinutes: 0,
        rewardMinutes: -voucher.durationMinutes,
        idempotencyKey: `REWARD-REDEEM-${voucher.id}-${params.sessionId}`,
        sourceSessionId: params.sessionId,
        recordedById: params.actor.userId,
        reason: `Penukaran voucher 1 jam (${voucher.code}) pada sesi rental`,
      },
    });
  }

  await recordAuditEvent(tx, params.actor, {
    action: 'VOUCHER_REDEEMED',
    entityType: 'Voucher',
    entityId: voucher.id,
    before: { status: voucher.status },
    after: {
      status: updatedVoucher.status,
      redeemedBySessionId: params.sessionId,
      redeemedAt: updatedVoucher.redeemedAt?.toISOString(),
    },
  });

  return updatedVoucher;
}

/**
 * Gets loyalty summary for a customer.
 */
export async function getCustomerLoyaltySummary(customerId: string): Promise<CustomerLoyaltySummary> {
  const [earnedSum, redeemedSum, paidSum, vouchers] = await Promise.all([
    prisma.rewardLedger.aggregate({
      where: { customerId, entryType: RewardLedgerEntryType.FREE_MINUTES_EARNED },
      _sum: { rewardMinutes: true },
    }),
    prisma.rewardLedger.aggregate({
      where: { customerId, entryType: RewardLedgerEntryType.REWARD_REDEEMED },
      _sum: { rewardMinutes: true },
    }),
    prisma.rewardLedger.aggregate({
      where: { customerId, entryType: RewardLedgerEntryType.PAID_MINUTES_EARNED },
      _sum: { paidMinutes: true },
    }),
    prisma.voucher.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const totalPaidMinutes = paidSum._sum.paidMinutes ?? 0;
  const totalRewardMinutesEarned = earnedSum._sum.rewardMinutes ?? 0;
  const totalRewardMinutesRedeemed = Math.abs(redeemedSum._sum.rewardMinutes ?? 0);
  const currentBalanceMinutes = Math.max(0, totalRewardMinutesEarned - totalRewardMinutesRedeemed);
  const activeVouchersCount = vouchers.filter((v) => v.status === VoucherStatus.ISSUED).length;

  return {
    customerId,
    totalPaidMinutes,
    totalRewardMinutesEarned,
    totalRewardMinutesRedeemed,
    currentBalanceMinutes,
    activeVouchersCount,
    vouchers: vouchers.map((v) => ({
      id: v.id,
      code: v.code,
      durationMinutes: v.durationMinutes,
      status: v.status,
      expiresAt: v.expiresAt,
      createdAt: v.createdAt,
    })),
  };
}

