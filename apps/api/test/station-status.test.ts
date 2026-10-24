import { StationDeviceType } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { computeStationStatus } from '../src/services/station.service.js';

describe('computeStationStatus', () => {
  it('keeps station readiness separate from operational status', () => {
    const status = computeStationStatus({
      id: 'box-1',
      code: 'BOX-PS3-01',
      consoleType: 'PS3',
      deviceType: StationDeviceType.PS_BOX,
      displayName: 'PS Box PlayStation 3',
      setupConfirmed: false,
      active: true,
      maintenanceReason: null,
      updatedAt: new Date('2026-10-15T00:00:00.000Z'),
      sessions: [],
      bookings: [],
    });

    expect(status.status).toBe('Tersedia');
    expect(status.setupConfirmed).toBe(false);
    expect(status.canStartRental).toBe(false);
    expect(status.type).toBe('PS Box PlayStation 3');
  });

  it('keeps PS4-02 active and exposes its session even while setup is unconfirmed', () => {
    const startedAt = new Date(Date.now() - 5 * 60 * 1000);
    const status = computeStationStatus({
      id: 'ps4-02',
      code: 'PS4-02',
      consoleType: 'PS4',
      deviceType: StationDeviceType.CONSOLE,
      displayName: null,
      setupConfirmed: false,
      active: true,
      maintenanceReason: null,
      updatedAt: new Date(),
      sessions: [{
        id: 'session-ps4-02',
        status: 'ACTIVE',
        startedAt,
        customer: { name: 'Pelanggan aktif' },
      }],
      bookings: [],
    });

    expect(status.status).toBe('Aktif');
    expect(status.className).toBe('active');
    expect(status.setupConfirmed).toBe(false);
    expect(status.canStartRental).toBe(false);
    expect(status.currentSessionId).toBe('session-ps4-02');
    expect(status.customer).toBe('Pelanggan aktif');
  });

  it('keeps PS3-01 confirmed booking visible while setup is unconfirmed', () => {
    const startsAt = new Date('2026-10-15T11:30:00.000Z');
    const status = computeStationStatus({
      id: 'ps3-01',
      code: 'PS3-01',
      consoleType: 'PS3',
      deviceType: StationDeviceType.CONSOLE,
      displayName: null,
      setupConfirmed: false,
      active: true,
      maintenanceReason: null,
      updatedAt: new Date(),
      sessions: [],
      bookings: [{
        id: 'booking-ps3-01',
        number: 'BKG-PS3-01',
        status: 'CONFIRMED',
        startsAt,
        customer: { name: 'Pelanggan booking' },
      }],
    });

    expect(status.status).toBe('Dipesan');
    expect(status.className).toBe('booked');
    expect(status.setupConfirmed).toBe(false);
    expect(status.canStartRental).toBe(false);
    expect(status.currentBookingId).toBe('booking-ps3-01');
    expect(status.currentBookingNumber).toBe('BKG-PS3-01');
    expect(status.customer).toBe('Pelanggan booking');
  });

  it('shows a confirmed PS Box using its distinct device type', () => {
    const status = computeStationStatus({
      id: 'box-ps4',
      code: 'BOX-PS4-01',
      consoleType: 'PS4',
      deviceType: StationDeviceType.PS_BOX,
      displayName: null,
      setupConfirmed: true,
      active: true,
      maintenanceReason: null,
      updatedAt: new Date('2026-10-15T00:00:00.000Z'),
      sessions: [],
      bookings: [],
    });

    expect(status.status).toBe('Tersedia');
    expect(status.canStartRental).toBe(true);
    expect(status.type).toBe('PS Box PlayStation 4');
  });
});
