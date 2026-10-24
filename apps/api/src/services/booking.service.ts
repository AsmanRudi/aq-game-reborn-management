import { prisma } from '../db.js';
import { Booking, BookingStatus, Rate, Station, Prisma } from '@prisma/client';
import { AuthenticatedUser } from './auth.service.js';
import { isRateEffectiveAt } from './rate-period.service.js';
import { recordAuditEvent as recordAuditEventService } from './audit.service.js';

export interface CreateBookingInput {
  stationCode: string;
  customerName: string;
  customerPhone?: string | null;
  rateKey: string;
  startsAt: Date;
  notes?: string | null;
}

export interface UpdateBookingStatusInput {
  status: BookingStatus;
  reason?: string | null;
}

export interface BookingFilters {
  stationCode?: string;
  customerName?: string;
  rateKey?: string;
  status?: BookingStatus;
  startsAt?: Date;
  endsAt?: Date;
  limit?: number;
}

export class BookingServiceError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 400,
  ) {
    super(message);
    this.name = 'BookingServiceError';
  }
}

export async function getBookings({ actor, filters }: {
  actor: AuthenticatedUser;
  filters?: BookingFilters;
}): Promise<any[]> {
  const where: any = {};

  if (filters?.stationCode) {
    where.station = { code: filters.stationCode.toUpperCase() };
  }

  if (filters?.customerName) {
    where.customer = { name: { contains: filters.customerName, mode: 'insensitive' } };
  }

  if (filters?.rateKey) {
    where.rate = { key: filters.rateKey.toUpperCase() };
  }

  if (filters?.status) {
    where.status = filters.status;
  }

  if (filters?.startsAt) {
    where.startsAt = { gte: filters.startsAt };
  }

  if (filters?.endsAt) {
    where.endsAt = { lte: filters.endsAt };
  }

  const bookings = await prisma.booking.findMany({
    where,
    include: {
      station: true,
      customer: true,
      rate: true,
      createdBy: { select: { id: true, name: true, email: true } },
    },
    orderBy: { startsAt: 'asc' },
    take: filters?.limit || undefined,
  });

  return bookings.map(transformBookingToDto);
}

export async function getBookingById({ actor, id }: {
  actor: AuthenticatedUser;
  id: string;
}): Promise<any> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  const booking = await prisma.booking.findFirst({
    where: isUuid ? { OR: [{ id }, { number: id }] } : { number: id },
    include: {
      station: true,
      customer: true,
      rate: true,
      createdBy: { select: { id: true, name: true, email: true } },
      session: {
        include: {
          station: true,
          customer: true,
          rate: true,
          invoice: { include: { payments: true } },
        },
      },
    },
  });

  if (!booking) {
    throw new BookingServiceError('Booking tidak ditemukan.', 'BOOKING_NOT_FOUND', 404);
  }

  // Check authorization - admin can see all, others can only see their own bookings
  if (actor.role !== 'ADMIN' && booking.createdById !== actor.userId) {
    throw new BookingServiceError('Anda tidak memiliki akses untuk melihat booking ini.', 'FORBIDDEN', 403);
  }

  return transformBookingToDto(booking);
}

export async function createBooking({
  actor,
  data,
}: {
  actor: AuthenticatedUser;
  data: CreateBookingInput;
}): Promise<any> {
  // Validation: User must be CASHIER or ADMIN
  if (actor.role === 'CASHIER') {
    throw new BookingServiceError('Hanya ADMIN yang dapat membuat booking.', 'FORBIDDEN', 403);
  }

  const { stationCode, customerName, customerPhone, rateKey, startsAt, notes } = data;

  const [station, rate] = await Promise.all([
    prisma.station.findUnique({ where: { code: stationCode.toUpperCase() } }),
    prisma.rate.findFirst({ where: { key: rateKey.toUpperCase(), active: true } }),
  ]);

  if (!station) {
    throw new BookingServiceError(`Station '${stationCode}' tidak ditemukan.`, 'STATION_NOT_FOUND', 404);
  }

  if (!rate) {
    throw new BookingServiceError(`Tarif '${rateKey}' tidak ditemukan atau tidak aktif.`, 'RATE_NOT_FOUND', 404);
  }

  // Check if station accepts PS4 or PS3 based on rate
  if (rate.consoleType !== station.consoleType) {
    throw new BookingServiceError(
      `Station ${station.code} hanya melayani konsol ${station.consoleType}, tetapi tarif ${rateKey} adalah untuk ${rate.consoleType}.`,
      'DEVICE_MISMATCH',
      409,
    );
  }

  if (rate.deviceType !== station.deviceType) {
    throw new BookingServiceError(
      `Station ${station.code} adalah ${station.deviceType}, tetapi tarif ${rateKey} adalah untuk ${rate.deviceType}.`,
      'DEVICE_MISMATCH',
      409,
    );
  }

  // Check for existing confirmed booking on the station at the requested time
  const existingConfirmedBooking = await prisma.booking.findFirst({
    where: {
      stationId: station.id,
      status: 'CONFIRMED',
      startsAt: { lte: new Date(startsAt.getTime() + 24 * 60 * 60 * 1000) }, // Allow 24 hours buffer
    },
  });

  if (existingConfirmedBooking) {
    throw new BookingServiceError(
      `Station ${station.code} sudah memiliki booking yang dikonfirmasi pada waktu yang diminta (booking #${existingConfirmedBooking.number}).`,
      'STATION_OCCUPIED',
      409,
    );
  }

  // Calculate end time based on rate
  const endsAt = new Date(startsAt);
  if (rate.billingMode === 'HOURLY') {
    endsAt.setHours(endsAt.getHours() + 1);
  } else if (rate.billingMode === 'PACKAGE') {
    endsAt.setHours(endsAt.getHours() + rate.durationMinutes! / 60);
  }

  // Check if rate is effective at the requested start time
  if (!isRateEffectiveAt(rate, startsAt)) {
    throw new BookingServiceError(
      `Tarif ${rateKey} tidak aktif atau tidak berlaku pada waktu yang diminta (${startsAt.toISOString()}).`,
      'RATE_NOT_EFFECTIVE',
      409,
    );
  }

  // Create customer if doesn't exist
  let customer = await prisma.customer.findFirst({
    where: { name: customerName, phone: customerPhone || undefined },
  });

  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        name: customerName,
        phone: customerPhone || null,
        notes: notes || null,
      },
    });
  }

  // Generate unique booking number
  const today = new Date();
  const yearMonth = today.toISOString().slice(0, 7).replace('-', ''); // YYYYMM
  const count = await prisma.booking.count({
    where: { number: { startsWith: `BK-${yearMonth}-` } },
  });
  const bookingNumber = `BK-${yearMonth}-${String(count + 1).padStart(4, '0')}`;

  const booking = await prisma.$transaction(async (transaction) => {
    const createdBooking = await transaction.booking.create({
      data: {
        number: bookingNumber,
        station: { connect: { id: station.id } },
        customer: { connect: { id: customer.id } },
        rate: { connect: { id: rate.id } },
        rateSnapshot: {
          key: rate.key,
          version: rate.version,
          name: rate.name,
          consoleType: rate.consoleType,
          deviceType: rate.deviceType,
          billingMode: rate.billingMode,
          amount: rate.amount,
          durationMinutes: rate.durationMinutes,
          effectiveFrom: rate.effectiveFrom.toISOString(),
          effectiveTo: rate.effectiveTo?.toISOString() || null,
          active: rate.active,
        },
        startsAt,
        endsAt,
        status: 'CONFIRMED',
        createdBy: { connect: { id: actor.userId } },
      },
      include: {
        station: true,
        customer: true,
        rate: true,
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    await recordAuditEventService(transaction, actor, {
      action: 'BOOKING_CREATED',
      entityType: 'Booking',
      entityId: createdBooking.id,
      after: {
        number: createdBooking.number,
        stationCode: createdBooking.station.code,
        customerName: createdBooking.customer?.name ?? 'Pelanggan',
        rateKey: createdBooking.rate.key,
        startsAt: createdBooking.startsAt.toISOString(),
        endsAt: createdBooking.endsAt.toISOString(),
        status: createdBooking.status,
      },
    });

    return createdBooking;
  });

  return transformBookingToDto(booking);
}

export async function updateBookingStatus({
  actor,
  id,
  status,
  reason,
}: {
  actor: AuthenticatedUser;
  id: string;
  status: BookingStatus;
  reason?: string | null;
}): Promise<any> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  const booking = await prisma.booking.findFirst({
    where: isUuid ? { OR: [{ id }, { number: id }] } : { number: id },
    include: {
      station: true,
      customer: true,
      rate: true,
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });

  if (!booking) {
    throw new BookingServiceError('Booking tidak ditemukan.', 'BOOKING_NOT_FOUND', 404);
  }

  // Check authorization - admin can update any, others can only update their own bookings
  if (actor.role === 'CASHIER' && booking.createdById !== actor.userId) {
    throw new BookingServiceError('Anda tidak memiliki akses untuk memperbarui booking ini.', 'FORBIDDEN', 403);
  }

  // Validate status transition
  if (booking.status === 'CANCELLED' || booking.status === 'NO_SHOW') {
    throw new BookingServiceError(
      `Booking yang sudah ${booking.status.toLowerCase()} tidak dapat diubah statusnya lagi.`,
      'INVALID_STATUS_TRANSITION',
      409,
    );
  }

  if (status === 'CHECKED_IN' && booking.status !== 'CONFIRMED') {
    throw new BookingServiceError(
      'Hanya booking dengan status CONFIRMED yang dapat dicek-in.',
      'INVALID_STATUS_TRANSITION',
      409,
    );
  }

  if (status === 'CANCELLED' && booking.status === 'CHECKED_IN') {
    throw new BookingServiceError(
      'Booking yang sudah dicek-in tidak dapat dibatalkan.',
      'INVALID_STATUS_TRANSITION',
      409,
    );
  }

  if (status === 'NO_SHOW' && booking.status !== 'CONFIRMED') {
    throw new BookingServiceError(
      'Hanya booking dengan status CONFIRMED yang dapat ditandai sebagai no-show.',
      'INVALID_STATUS_TRANSITION',
      409,
    );
  }

  // Additional validation for CHECKED_IN
  if (status === 'CHECKED_IN') {
    const timeSinceStart = Date.now() - new Date(booking.startsAt).getTime();
    if (timeSinceStart > 2 * 60 * 60 * 1000) {
      // 2 hours after start
      throw new BookingServiceError(
        `Booking tidak dapat dicek-in karena sudah melewati waktu maksimum 2 jam sejak waktu start (${new Date(booking.startsAt).toLocaleString()}).`,
        'TIME_WINDOW_EXCEEDED',
        409,
      );
    }

    const existingSession = await prisma.rentalSession.findFirst({
      where: { bookingId: booking.id },
    });

    if (existingSession) {
      throw new BookingServiceError(
        `Booking sudah memiliki sesi rental aktif (ID: ${existingSession.number}).`,
        'SESSION_ALREADY_EXISTS',
        409,
      );
    }
  }

  // Record audit before update
  await recordAuditEventService(prisma, actor, {
    action: 'BOOKING_STATUS_CHANGED',
    entityType: 'Booking',
    entityId: booking.id,
    before: {
      number: booking.number,
      status: booking.status,
    },
    after: {
      number: booking.number,
      status,
      cancelReason: status === 'CANCELLED' ? reason : null,
    },
  });

  const updatedBooking = await prisma.booking.update({
    where: { id: booking.id },
    data: {
      status,
      cancelReason: status === 'CANCELLED' ? reason : null,
    },
    include: {
      station: true,
      customer: true,
      rate: true,
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });

  return transformBookingToDto(updatedBooking);
}

export async function startRentalSession({
  actor,
  bookingId,
}: {
  actor: AuthenticatedUser;
  bookingId: string;
}): Promise<any> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      station: true,
      customer: true,
      rate: true,
      session: true,
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });

  if (!booking) {
    throw new BookingServiceError('Booking tidak ditemukan.', 'BOOKING_NOT_FOUND', 404);
  }

  if (booking.status !== 'CONFIRMED') {
    throw new BookingServiceError(
      `Hanya booking dengan status CONFIRMED yang dapat dicek-in. Status saat ini: ${booking.status}.`,
      'INVALID_STATUS_TRANSITION',
      409,
    );
  }

  if (booking.session) {
    throw new BookingServiceError(
      `Booking sudah memiliki sesi rental (ID: ${booking.session.number}).`,
      'SESSION_ALREADY_EXISTS',
      409,
    );
  }

  // Check if station is available for rental
  const activeSession = await prisma.rentalSession.findFirst({
    where: {
      stationId: booking.stationId,
      status: 'ACTIVE',
    },
  });

  if (activeSession) {
    throw new BookingServiceError(
      `Station ${booking.station.code} saat ini memiliki sesi rental aktif (ID: ${activeSession.number}).`,
      'STATION_OCCUPIED',
      409,
    );
  }

  // Start the rental session
  const session = await prisma.$transaction(async (transaction) => {
    // Update booking status to CHECKED_IN
    const updatedBooking = await transaction.booking.update({
      where: { id: booking.id },
      data: { status: 'CHECKED_IN' },
    });

    // Create rental session
    const createdSession = await transaction.rentalSession.create({
      data: {
        number: `RS-${Date.now().toString().slice(-6)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
        station: { connect: { id: booking.stationId } },
        booking: { connect: { id: booking.id } },
        customer: booking.customerId ? { connect: { id: booking.customerId } } : undefined,
        rate: { connect: { id: booking.rateId } },
        rateSnapshot: booking.rateSnapshot as Prisma.InputJsonValue,
        startedAt: new Date(),
        createdBy: { connect: { id: actor.userId } },
      },
      include: {
        station: true,
        customer: true,
        rate: true,
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    // Record audit for booking status change
    await recordAuditEventService(transaction, actor, {
      action: 'BOOKING_CHECKED_IN',
      entityType: 'Booking',
      entityId: booking.id,
      before: { status: booking.status },
      after: { status: 'CHECKED_IN' },
    });

    // Record audit for session creation
    await recordAuditEventService(transaction, actor, {
      action: 'SESSION_CREATED',
      entityType: 'RentalSession',
      entityId: createdSession.id,
      after: {
        number: createdSession.number,
        stationCode: createdSession.station.code,
        bookingNumber: updatedBooking.number,
        startedAt: createdSession.startedAt.toISOString(),
        status: createdSession.status,
      },
    });

    return createdSession;
  });

  return session;
}

function transformBookingToDto(booking: any): any {
  return {
    id: booking.id,
    number: booking.number,
    stationCode: booking.station.code,
    stationDisplayName: booking.station.displayName || null,
    customerName: booking.customer.name,
    customerPhone: booking.customer.phone || null,
    rateKey: booking.rate.key,
    rateName: booking.rate.name,
    consoleType: booking.rate.consoleType || booking.station.consoleType,
    deviceType: booking.rate.deviceType,
    billingMode: booking.rate.billingMode,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    status: booking.status,
    cancelReason: booking.cancelReason || null,
    notes: booking.notes || null,
    createdAt: booking.createdAt,
    updatedAt: booking.updatedAt,
    customerId: booking.customerId || null,
    rateId: booking.rateId || null,
    session:
      booking.session && transformSessionToDto(booking.session),
    createdBy: {
      id: booking.createdBy.id,
      name: booking.createdBy.name,
      email: booking.createdBy.email,
    },
    station:
      booking.station && transformStationToDto(booking.station),
    customer:
      booking.customer && transformCustomerToDto(booking.customer),
    rate: booking.rate && transformRateToDto(booking.rate),
  };
}

function transformSessionToDto(session: any): any {
  return {
    id: session.id,
    number: session.number,
    stationCode: session.station.code,
    customerName: session.customer?.name || null,
    customerPhone: session.customer?.phone || null,
    rateKey: session.rate.key,
    rateName: session.rate.name,
    startedAt: session.startedAt,
    plannedEndAt: session.plannedEndAt || null,
    endedAt: session.endedAt || null,
    status: session.status,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

function transformStationToDto(station: any): any {
  return {
    id: station.id,
    code: station.code,
    consoleType: station.consoleType,
    deviceType: station.deviceType,
    displayName: station.displayName || null,
    active: station.active,
    maintenanceReason: station.maintenanceReason || null,
  };
}

function transformCustomerToDto(customer: any): any {
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone || null,
    notes: customer.notes || null,
  };
}

function transformRateToDto(rate: any): any {
  return {
    id: rate.id,
    key: rate.key,
    version: rate.version,
    name: rate.name,
    consoleType: rate.consoleType,
    deviceType: rate.deviceType,
    billingMode: rate.billingMode,
    amount: rate.amount,
    durationMinutes: rate.durationMinutes || null,
    minimumMinutes: rate.minimumMinutes,
    roundingMinutes: rate.roundingMinutes,
    effectiveFrom: rate.effectiveFrom,
    effectiveTo: rate.effectiveTo || null,
    active: rate.active,
  };
}