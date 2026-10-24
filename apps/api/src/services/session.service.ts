import { BookingStatus, ConsoleType, InvoiceStatus, SessionStatus, StationDeviceType, Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { calculateSessionBill, RateSnapshot } from './billing.service.js';
import { selectEffectiveRate } from './rate-period.service.js';
import type { AuthenticatedUser } from './auth.service.js';
import { recordAuditEvent } from './audit.service.js';
import { recordPaidRentalReward } from './loyalty.service.js';

export interface StartSessionParams {
  actor: AuthenticatedUser;
  stationCode: string;
  rateKey?: string;
  customerName?: string;
  customerPhone?: string | null;
}

export interface StopSessionParams {
  discount?: number;
  notes?: string | null;
}

export class SessionServiceError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'SessionServiceError';
  }
}

export async function startRentalSession(params: StartSessionParams) {
  return await prisma.$transaction(async (tx) => {
    const startedAt = new Date();
    // 1. Look up station by code
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.stationCode);
    const station = await tx.station.findFirst({
      where: isUuid ? { OR: [{ id: params.stationCode }, { code: params.stationCode.toUpperCase() }] } : { code: params.stationCode.toUpperCase() },
      include: {
        sessions: {
          where: { status: SessionStatus.ACTIVE },
          take: 1,
        },
      },
    });

    if (!station) {
      throw new SessionServiceError('STATION_NOT_FOUND', `Station '${params.stationCode}' tidak ditemukan.`, 404);
    }

    if (!station.setupConfirmed) {
      throw new SessionServiceError(
        'STATION_UNCONFIRMED',
        `Konfigurasi station '${station.code}' belum dikonfirmasi dan belum dapat digunakan.`,
        409
      );
    }

    if (!station.active) {
      throw new SessionServiceError('STATION_INACTIVE', `Station '${station.code}' berstatus nonaktif.`, 409);
    }

    if (station.maintenanceReason) {
      throw new SessionServiceError('STATION_MAINTENANCE', `Station '${station.code}' sedang dalam pemeliharaan (${station.maintenanceReason}).`, 409);
    }

    // 2. Prevent overlapping / multiple active sessions for one station
    if (station.sessions.length > 0) {
      throw new SessionServiceError('STATION_OCCUPIED', `Station '${station.code}' sedang digunakan dalam sesi rental aktif lain.`, 409);
    }

    // 3. Find and snapshot Rate
    if (!params.rateKey && station.deviceType === StationDeviceType.PS_BOX) {
      throw new SessionServiceError(
        'RATE_REQUIRED',
        `Pilih paket PS Box yang aktif untuk station ${station.code}.`,
        400
      );
    }

    const requestedRateKey = params.rateKey ??
      (station.consoleType === ConsoleType.PS4 ? 'RATE-PS4-HOURLY' : 'RATE-PS3-HOURLY');
    const rateWhere = {
      active: true,
      consoleType: station.consoleType,
      deviceType: station.deviceType,
      billingMode: station.deviceType === StationDeviceType.PS_BOX ? 'PACKAGE' as const : 'HOURLY' as const,
      effectiveFrom: { lte: startedAt },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: startedAt } }],
    } satisfies Prisma.RateWhereInput;
    const candidateRates = await tx.rate.findMany({
      where: rateWhere,
      orderBy: { version: 'desc' },
    });
    const selection = selectEffectiveRate(candidateRates, requestedRateKey, startedAt);
    if (selection.conflict) {
      throw new SessionServiceError(
        'RATE_CONFIGURATION_CONFLICT',
        `Beberapa tarif aktif berlaku bersamaan untuk station ${station.code}; sesi baru ditolak sampai periode tarif ditinjau.`,
        409
      );
    }
    const rate = selection.rate;

    if (!rate) {
      throw new SessionServiceError('RATE_NOT_FOUND', `Paket tarif tidak ditemukan untuk stasiun ${station.code}.`, 404);
    }

    // 4. Find or create Customer
    let customerId: string | null = null;
    if (params.customerName && params.customerName.trim().length > 0) {
      const trimmedName = params.customerName.trim();
      let customer = await tx.customer.findFirst({
        where: { name: { equals: trimmedName, mode: 'insensitive' } },
      });

      if (!customer) {
        customer = await tx.customer.create({
          data: {
            name: trimmedName,
            phone: params.customerPhone || null,
          },
        });
      }
      customerId = customer.id;
    }

    // 5. Freeze immutable rate snapshot
    const rateSnapshot: RateSnapshot = {
      rateId: rate.id,
      key: rate.key,
      version: rate.version,
      name: rate.name,
      consoleType: rate.consoleType,
      billingMode: rate.billingMode as any,
      amount: rate.amount,
      durationMinutes: rate.durationMinutes,
      minimumMinutes: rate.minimumMinutes,
      roundingMinutes: rate.roundingMinutes,
    };

    const plannedEndAt =
      rate.billingMode === 'PACKAGE' && rate.durationMinutes
        ? new Date(startedAt.getTime() + rate.durationMinutes * 60000)
        : null;

    const sessionNumber = `SES-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`;

    const session = await tx.rentalSession.create({
      data: {
        number: sessionNumber,
        stationId: station.id,
        customerId,
        rateId: rate.id,
        rateSnapshot: rateSnapshot as any,
        startedAt,
        plannedEndAt,
        status: SessionStatus.ACTIVE,
        createdById: params.actor.userId,
      },
      include: {
        station: true,
        customer: true,
        rate: true,
      },
    });

    await recordAuditEvent(tx, params.actor, {
      action: 'RENTAL_SESSION_STARTED',
      entityType: 'RentalSession',
      entityId: session.id,
      after: {
        number: session.number,
        stationCode: station.code,
        rateKey: rate.key,
        rateVersion: rate.version,
        startedAt: startedAt.toISOString(),
      },
    });

    return session;
  });
}

export async function stopRentalSession(
  sessionId: string,
  params: StopSessionParams,
  actor: AuthenticatedUser,
) {
  return await prisma.$transaction(async (tx) => {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId);
    const session = await tx.rentalSession.findFirst({
      where: isUuid ? { OR: [{ id: sessionId }, { number: sessionId }] } : { number: sessionId },
      include: {
        station: true,
        customer: true,
        invoice: true,
      },
    });

    if (!session) {
      throw new SessionServiceError('SESSION_NOT_FOUND', `Sesi rental '${sessionId}' tidak ditemukan.`, 404);
    }

    if (session.status !== SessionStatus.ACTIVE) {
      throw new SessionServiceError('SESSION_ALREADY_COMPLETED', `Sesi rental '${session.number}' sudah selesai sebelumnya.`, 409);
    }

    const endedAt = new Date();
    const rateSnapshot = session.rateSnapshot as unknown as RateSnapshot;
    const bill = calculateSessionBill(session.startedAt, endedAt, rateSnapshot);

    const discount = params.discount ?? 0;
    const finalTotal = Math.max(0, bill.totalAmount - discount);

    // Update Session to COMPLETED
    const updatedSession = await tx.rentalSession.update({
      where: { id: session.id },
      data: {
        endedAt,
        billedDurationMinutes: bill.billedDurationMinutes,
        totalAmount: finalTotal,
        status: SessionStatus.COMPLETED,
        stoppedById: actor.userId,
      },
    });

    // Create Invoice atomically
    const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`;
    const invoice = await tx.invoice.create({
      data: {
        number: invoiceNumber,
        sessionId: session.id,
        customerId: session.customerId,
        subtotal: bill.subtotal,
        discount,
        total: finalTotal,
        status: InvoiceStatus.UNPAID,
        pricingSnapshot: {
          rateSnapshot,
          calculation: bill,
          notes: params.notes || null,
        } as any,
      },
    });

    // Record loyalty accumulation if customer is associated
    if (session.customerId && bill.billedDurationMinutes > 0) {
      await recordPaidRentalReward(tx, {
        customerId: session.customerId,
        sessionId: session.id,
        invoiceId: invoice.id,
        paidMinutes: bill.billedDurationMinutes,
        actor,
      });
    }

    await recordAuditEvent(tx, actor, {
      action: 'RENTAL_SESSION_STOPPED',
      entityType: 'RentalSession',
      entityId: session.id,
      before: {
        status: session.status,
        number: session.number,
      },
      after: {
        status: updatedSession.status,
        endedAt: endedAt.toISOString(),
        totalAmount: finalTotal,
        invoiceNumber: invoice.number,
      },
    });

    return {
      session: updatedSession,
      station: session.station,
      customer: session.customer,
      invoice,
      billing: bill,
    };
  });
}
