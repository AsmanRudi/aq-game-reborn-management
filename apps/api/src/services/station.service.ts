import { BookingStatus, SessionStatus, Station, StationDeviceType } from '@prisma/client';
import { prisma } from '../db.js';

export interface StationDto {
  id: string;
  code: string;
  consoleType: string;
  deviceType: StationDeviceType;
  type: string;
  status: 'Tersedia' | 'Aktif' | 'Dipesan' | 'Maintenance';
  className: 'available' | 'active' | 'booked' | 'maintenance';
  setupConfirmed: boolean;
  canStartRental: boolean;
  customer?: string | null;
  elapsed?: string | null;
  active: boolean;
  maintenanceReason?: string | null;
  currentSessionId?: string | null;
  currentBookingNumber?: string | null;
  currentBookingId?: string | null;
}

interface StationStatusInput {
  id: string;
  code: string;
  consoleType: string;
  deviceType: StationDeviceType;
  displayName: string | null;
  setupConfirmed: boolean;
  active: boolean;
  maintenanceReason: string | null;
  updatedAt: Date;
  sessions?: Array<{
    id: string;
    status: SessionStatus;
    startedAt: Date;
    customer: { name: string } | null;
  }>;
  bookings?: Array<{
    id: string;
    number: string;
    status: BookingStatus;
    startsAt: Date;
    customer: { name: string } | null;
  }>;
}

function formatElapsed(startedAt: Date): string {
  const diffMs = Math.max(0, Date.now() - startedAt.getTime());
  const totalSeconds = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function formatTimeHHmm(date: Date): string {
  return new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Jakarta',
  }).format(date);
}

export function computeStationStatus(station: StationStatusInput): StationDto {
  const consoleName = station.consoleType === 'PS4' ? 'PlayStation 4' : 'PlayStation 3';
  const consoleDisplay = station.deviceType === StationDeviceType.PS_BOX
    ? `PS Box ${consoleName}`
    : `${consoleName} · 2 controller`;

  const base = {
    id: station.code,
    code: station.code,
    consoleType: station.consoleType,
    deviceType: station.deviceType,
    type: station.displayName || consoleDisplay,
    setupConfirmed: station.setupConfirmed,
    active: station.active,
  };

  const activeSession = station.sessions?.find((session) => session.status === SessionStatus.ACTIVE);
  if (activeSession) {
    return {
      ...base,
      status: 'Aktif',
      className: 'active',
      customer: activeSession.customer?.name || 'Pelanggan',
      elapsed: formatElapsed(new Date(activeSession.startedAt)),
      canStartRental: false,
      maintenanceReason: station.maintenanceReason,
      currentSessionId: activeSession.id,
    };
  }

  const confirmedBooking = station.bookings?.find((booking) => booking.status === BookingStatus.CONFIRMED);
  if (confirmedBooking) {
    const bookingTimeStr = formatTimeHHmm(new Date(confirmedBooking.startsAt));
    return {
      ...base,
      status: 'Dipesan',
      className: 'booked',
      customer: confirmedBooking.customer?.name || `Booking ${bookingTimeStr}`,
      elapsed: `Mulai ${bookingTimeStr}`,
      canStartRental: false,
      maintenanceReason: station.maintenanceReason,
      currentBookingNumber: confirmedBooking.number,
      currentBookingId: confirmedBooking.id,
    };
  }

  if (!station.active || station.maintenanceReason) {
    return {
      ...base,
      status: 'Maintenance',
      className: 'maintenance',
      customer: station.maintenanceReason || 'Perbaikan',
      elapsed: 'Sejak ' + formatTimeHHmm(station.updatedAt),
      maintenanceReason: station.maintenanceReason,
      canStartRental: false,
    };
  }

  return {
    ...base,
    status: 'Tersedia',
    className: 'available',
    customer: null,
    elapsed: null,
    canStartRental: station.setupConfirmed,
    maintenanceReason: station.maintenanceReason,
  };
}

export async function getAllStationsWithState(): Promise<StationDto[]> {
  const stations = await prisma.station.findMany({
    orderBy: { code: 'asc' },
    include: {
      sessions: {
        where: { status: SessionStatus.ACTIVE },
        include: { customer: true },
        take: 1,
      },
      bookings: {
        where: {
          status: BookingStatus.CONFIRMED,
          endsAt: { gte: new Date() },
        },
        include: { customer: true },
        orderBy: { startsAt: 'asc' },
        take: 1,
      },
    },
  });

  return stations.map(computeStationStatus);
}
