import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/services/password.service.js';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { BookingStatus, BillingMode, ConsoleType, StationDeviceType } from '@prisma/client';

const testDatabaseUrl = process.env.AQ_TEST_DATABASE_URL;
const hasDedicatedTestDatabase = Boolean(testDatabaseUrl);

let server: ReturnType<Express['listen']> | undefined;
let origin: string;
let prisma: PrismaClient;
let adminToken: string;
let adminUserId: string;
let appModule: { app: Express };

const fixtureId = Math.floor(Math.random() * 10000);
const stationCode = `TST-BK-PS4-${fixtureId}`;
const rateKey = `TST-BK-RATE-${fixtureId}`;
let createdBookingId: string | undefined;

// Skip integration tests if no dedicated test database is configured
const isIntegrationTest = hasDedicatedTestDatabase && testDatabaseUrl && testDatabaseUrl.includes('_test');

describe.skipIf(!isIntegrationTest)('Booking API (/api/v1/bookings) with auth', () => {
  beforeAll(async () => {
    if (!testDatabaseUrl) throw new Error('AQ_TEST_DATABASE_URL must point to a dedicated test database.');
    const parsedUrl = new URL(testDatabaseUrl);
    if (!parsedUrl.pathname.toLowerCase().endsWith('_test')) {
      throw new Error('Database integration tests require a database name ending in _test.');
    }
    process.env.DATABASE_URL = testDatabaseUrl;

    const database = await import('../src/db.js');
    prisma = database.prisma;
    appModule = await import('../src/app.js');

    // Start server first
    server = appModule.app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind to a TCP port');
    origin = `http://127.0.0.1:${address.port}`;

    // Clean up any existing data
    await prisma.booking.deleteMany({ where: {} });
    await prisma.station.deleteMany({ where: { code: { startsWith: 'TST-BK' } } });
    await prisma.rate.deleteMany({ where: { key: { startsWith: 'TST-BK' } } });

    // Create admin user and login
    const testPassword = 'TestPassword123!';
    const passwordHash = await hashPassword(testPassword);
    const admin = await prisma.staffUser.create({
      data: { name: 'Admin Booking Test', email: 'admin-booking-test@test.invalid', passwordHash, role: 'ADMIN', active: true },
    });
    adminUserId = admin.id;

    const loginRes = await fetch(`${origin}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: admin.email, password: testPassword }),
    });
    if (!loginRes.ok) throw new Error(`Login failed: ${loginRes.status}`);
    const loginBody = await loginRes.json() as { data: { token: string } };
    adminToken = loginBody.data.token;

    // Create test data
    await prisma.station.create({
      data: {
        code: stationCode,
        consoleType: ConsoleType.PS4,
        deviceType: StationDeviceType.CONSOLE,
        setupConfirmed: true,
        active: true,
      },
    });

    await prisma.rate.create({
      data: {
        key: rateKey,
        version: 1,
        name: 'Tarif Booking Tes',
        consoleType: ConsoleType.PS4,
        deviceType: StationDeviceType.CONSOLE,
        billingMode: BillingMode.HOURLY,
        amount: 8000,
        minimumMinutes: 60,
        roundingMinutes: 15,
        effectiveFrom: new Date(),
        active: true,
      },
    });
  }, 20_000);

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    }
    if (prisma) {
      await prisma.booking.deleteMany({ where: {} });
      await prisma.station.deleteMany({ where: { code: { startsWith: 'TST-BK' } } });
      await prisma.rate.deleteMany({ where: { key: { startsWith: 'TST-BK' } } });
      await prisma.authSession.deleteMany({ where: { staffUserId: adminUserId } });
      await prisma.auditLog.deleteMany({ where: { actorId: adminUserId } });
      await prisma.staffUser.deleteMany({ where: { id: adminUserId } });
      await prisma.$disconnect();
    }
  });

  const authHeaders = () => ({
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + adminToken,
  });

  it('POST /api/v1/bookings creates a new booking', async () => {
    const response = await fetch(origin + '/api/v1/bookings', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        stationCode,
        customerName: 'John Doe',
        customerPhone: '+62 812 3456 7890',
        rateKey,
        startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
        notes: 'Test booking',
      }),
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as { data: any; message: string };
    expect(body.data).toBeDefined();
    expect(body.data.number).toMatch(/^BK-\d{8}-\d{4}$/);
    expect(body.data.stationCode).toBe(stationCode);
    expect(body.data.customerName).toBe('John Doe');
    expect(body.data.rateKey).toBe(rateKey);
    expect(body.data.status).toBe('CONFIRMED');
    expect(body.data.startsAt).toBeDefined();

    createdBookingId = body.data.id;
  });

  it('GET /api/v1/bookings/:id retrieves the created booking', async () => {
    expect(createdBookingId).toBeDefined();
    const response = await fetch(origin + '/api/v1/bookings/' + createdBookingId, {
      headers: authHeaders(),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: any };
    expect(body.data.id).toBe(createdBookingId);
    expect(body.data.stationCode).toBe(stationCode);
    expect(body.data.customerName).toBe('John Doe');
  });

  it('POST /api/v1/bookings/:id/check-in checks in a confirmed booking', async () => {
    expect(createdBookingId).toBeDefined();
    const response = await fetch(origin + '/api/v1/bookings/' + createdBookingId + '/check-in', {
      method: 'POST',
      headers: authHeaders(),
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as { data: any; message: string };
    expect(body.data).toBeDefined();
    expect(body.data.bookingId).toBe(createdBookingId);
    expect(body.data.status).toBe('ACTIVE');
  });

  it('POST /api/v1/bookings/:id/cancel cancels a confirmed booking', async () => {
    // Create a new booking for cancellation test
    const newBookingRes = await fetch(origin + '/api/v1/bookings', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        stationCode,
        customerName: 'Jane Smith',
        customerPhone: '+62 812 3456 7891',
        rateKey,
        startsAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      }),
    });
    expect(newBookingRes.status).toBe(201);
    const newBooking = (await newBookingRes.json()) as { data: any };
    const bookingToCancelId = newBooking.data.id;

    const cancelRes = await fetch(origin + '/api/v1/bookings/' + bookingToCancelId + '/cancel', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ reason: 'Jadwal berubah' }),
    });

    expect(cancelRes.status).toBe(200);
    const cancelBody = (await cancelRes.json()) as { data: any; message: string };
    expect(cancelBody.data.id).toBe(bookingToCancelId);
    expect(cancelBody.data.status).toBe('CANCELLED');
    expect(cancelBody.data.cancelReason).toBe('Jadwal berubah');
  });

  it('GET /api/v1/bookings lists bookings with filters', async () => {
    const response = await fetch(origin + '/api/v1/bookings?status=CONFIRMED', {
      headers: authHeaders(),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: any[] };
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.some((b) => b.customerName === 'John Doe')).toBe(true);
  });
});