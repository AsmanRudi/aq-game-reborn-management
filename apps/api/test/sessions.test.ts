import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/services/password.service.js';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { BillingMode, ConsoleType, StationDeviceType } from '@prisma/client';

const testDatabaseUrl = process.env.AQ_TEST_DATABASE_URL;
const hasDedicatedTestDatabase = Boolean(testDatabaseUrl);

let server: ReturnType<Express['listen']> | undefined;
let origin: string;
const fixtureId = Math.floor(Math.random() * 10000);
const stationCode = `TST-PS4-${fixtureId}`;
const maintenanceStationCode = `TST-MNT-${fixtureId}`;
const unconfirmedStationCode = `TST-UNC-${fixtureId}`;
const boxStationCode = `TST-BOX3-${fixtureId}`;
const rateKey = `TST-RATE-${fixtureId}`;
const ps3RateKey = `TST-RATE3-${fixtureId}`;
let createdSessionId: string | undefined;
let adminToken: string;
let adminUserId: string;
let appModule: { app: Express };
let prisma: PrismaClient;

// Skip integration tests if no dedicated test database is configured
const isIntegrationTest = hasDedicatedTestDatabase && testDatabaseUrl.includes('_test');

describe.skipIf(!isIntegrationTest)('Rental Sessions API (/api/v1/sessions) with auth', () => {
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
    origin = 'http://127.0.0.1:' + address.port;

    // Create admin user and login
    const testPassword = 'TestPassword123!';
    const passwordHash = await hashPassword(testPassword);
    const admin = await prisma.staffUser.create({
      data: { name: 'Admin Test', email: 'admin-sessions-test@test.invalid', passwordHash, role: 'ADMIN', active: true },
    });
    adminUserId = admin.id;

    const loginRes = await fetch(origin + '/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: admin.email, password: testPassword }),
    });
    const loginBody = await loginRes.json() as { data: { token: string } };
    adminToken = loginBody.data.token;

    // Setup test data (stations and rates)
    await prisma.station.createMany({
      data: [
        {
          code: stationCode,
          consoleType: ConsoleType.PS4,
          deviceType: StationDeviceType.CONSOLE,
          setupConfirmed: true,
        },
        {
          code: maintenanceStationCode,
          consoleType: ConsoleType.PS3,
          deviceType: StationDeviceType.CONSOLE,
          setupConfirmed: true,
          maintenanceReason: 'Uji perbaikan',
        },
        {
          code: unconfirmedStationCode,
          consoleType: ConsoleType.PS4,
          deviceType: StationDeviceType.CONSOLE,
        },
        {
          code: boxStationCode,
          consoleType: ConsoleType.PS3,
          deviceType: StationDeviceType.PS_BOX,
          setupConfirmed: true,
        },
      ],
    });
    await prisma.rate.create({
      data: {
        key: rateKey,
        version: 1,
        name: 'Tarif uji PS4',
        consoleType: ConsoleType.PS4,
        deviceType: StationDeviceType.CONSOLE,
        billingMode: BillingMode.HOURLY,
        amount: 8000,
        durationMinutes: null,
        minimumMinutes: 60,
        roundingMinutes: 15,
        effectiveFrom: new Date(),
        active: true,
      },
    });
    await prisma.rate.create({
      data: {
        key: ps3RateKey,
        version: 1,
        name: 'Tarif uji PS3',
        consoleType: ConsoleType.PS3,
        deviceType: StationDeviceType.CONSOLE,
        billingMode: BillingMode.HOURLY,
        amount: 6000,
        durationMinutes: null,
        minimumMinutes: 60,
        roundingMinutes: 15,
        effectiveFrom: new Date(),
        active: true,
      },
    });
  }, 20_000);

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
    if (prisma) {
      const testSession = createdSessionId
        ? await prisma.rentalSession.findUnique({ where: { id: createdSessionId }, include: { invoice: true } })
        : null;
      if (testSession?.invoice) {
        await prisma.invoice.delete({ where: { id: testSession.invoice.id } });
      }
      if (testSession) {
        await prisma.rentalSession.delete({ where: { id: testSession.id } });
      }
      await prisma.station.deleteMany({ where: { code: { in: [stationCode, maintenanceStationCode, unconfirmedStationCode, boxStationCode] } } });
      await prisma.rate.deleteMany({ where: { key: { in: [rateKey, ps3RateKey] } } });
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

  it('POST /api/v1/sessions starts a new rental session on an available station', async () => {
    const response = await fetch(origin + '/api/v1/sessions', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        stationCode,
        rateKey,
        customerName: '',
      }),
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as { data: any; message: string };
    expect(body.data.status).toBe('ACTIVE');
    expect(body.data.station.code).toBe(stationCode);
    expect(body.data.customer).toBeNull();
    expect(body.data.rateSnapshot).toBeDefined();
    expect(body.data.rateSnapshot.key).toBe(rateKey);
    expect(body.data.rateSnapshot.amount).toBe(8000);

    createdSessionId = body.data.id;
  });

  it('POST /api/v1/sessions rejects starting a duplicate active session on the same station', async () => {
    const response = await fetch(origin + '/api/v1/sessions', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        stationCode,
        rateKey,
        customerName: '',
      }),
    });

    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('STATION_OCCUPIED');
    expect(body.error.message).toContain('sedang digunakan');
  });

  it('POST /api/v1/sessions rejects starting session on a station under maintenance', async () => {
    const response = await fetch(origin + '/api/v1/sessions', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        stationCode: maintenanceStationCode,
        customerName: '',
      }),
    });

    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('STATION_MAINTENANCE');
    expect(body.error.message).toContain('pemeliharaan');
  });

  it('POST /api/v1/sessions rejects stations that have not been owner-confirmed', async () => {
    const response = await fetch(origin + '/api/v1/sessions', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ stationCode: unconfirmedStationCode, customerName: '' }),
    });

    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('STATION_UNCONFIRMED');
  });

  it('POST /api/v1/sessions does not apply a console rate to a PS Box station', async () => {
    const response = await fetch(origin + '/api/v1/sessions', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ stationCode: boxStationCode, rateKey: ps3RateKey, customerName: '' }),
    });

    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('RATE_NOT_FOUND');
  });

  it('GET /api/v1/sessions lists sessions filtered by status', async () => {
    expect(createdSessionId).toBeDefined();
    const response = await fetch(origin + '/api/v1/sessions?status=ACTIVE', {
      headers: authHeaders(),
    });
    expect(response.status).toBe(200);

    const body = (await response.json()) as { data: any[] };
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.some((s) => s.id === createdSessionId)).toBe(true);
  });

  it('POST /api/v1/sessions/:id/stop completes session and calculates bill into invoice', async () => {
    expect(createdSessionId).toBeDefined();
    const response = await fetch(origin + '/api/v1/sessions/' + createdSessionId + '/stop', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        discount: 0,
        notes: 'Selesai sesi reguler',
      }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: any; message: string };
    expect(body.data.session.status).toBe('COMPLETED');
    expect(body.data.session.endedAt).toBeDefined();
    expect(body.data.session.billedDurationMinutes).toBeGreaterThanOrEqual(60); // minimum 53 mins
    expect(body.data.session.totalAmount).toBeGreaterThanOrEqual(8000); // minimum Rp 8.000
    expect(body.data.invoice).toBeDefined();
    expect(body.data.invoice.total).toBe(body.data.session.totalAmount);
    expect(body.data.invoice.status).toBe('UNPAID');

    // Clean up created session and invoice for test isolation
    await prisma.invoice.delete({ where: { id: body.data.invoice.id } });
    await prisma.rentalSession.delete({ where: { id: createdSessionId } });
    createdSessionId = undefined;
  });

  it('POST /api/v1/sessions/:id/stop rejects stopping non-existent or completed session', async () => {
    const response = await fetch(origin + '/api/v1/sessions/non-existent-id/stop', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(404);
  });
});