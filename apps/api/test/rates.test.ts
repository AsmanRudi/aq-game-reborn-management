import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/services/password.service.js';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';

const testDatabaseUrl = process.env.AQ_TEST_DATABASE_URL;
const hasDedicatedTestDatabase = Boolean(testDatabaseUrl);

let server: ReturnType<Express['listen']> | undefined;
let origin: string;
let prisma: PrismaClient;
let adminToken: string;
let adminUserId: string;
let appModule: { app: Express };

// Skip integration tests if no dedicated test database is configured
const isIntegrationTest = hasDedicatedTestDatabase && testDatabaseUrl.includes('_test');

describe.skipIf(!isIntegrationTest)('Rates API (/api/v1/rates) with auth', () => {
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

    // Clean up any existing rates with the same keys first
    await prisma.rate.deleteMany({
      where: {
        key: { in: ['RATE-PS4-HOURLY', 'RATE-PS3-HOURLY', 'BOX-PS3-06JAM'] },
      },
    });

    // Create admin user and login
    const testPassword = 'TestPassword123!';
    const passwordHash = await hashPassword(testPassword);
    const admin = await prisma.staffUser.create({
      data: { name: 'Admin Test', email: 'admin-rates-test@test.invalid', passwordHash, role: 'ADMIN', active: true },
    });
    adminUserId = admin.id;

    const loginRes = await fetch(`${origin}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: admin.email, password: testPassword }),
    });
    const loginBody = await loginRes.json() as { data: { token: string } };
    adminToken = loginBody.data.token;

    // Create rates with active=false as expected by tests
    await prisma.rate.create({
      data: {
        key: 'RATE-PS4-HOURLY',
        version: 1,
        name: 'Tarif PS4 per jam',
        consoleType: 'PS4',
        deviceType: 'CONSOLE',
        billingMode: 'HOURLY',
        amount: 8000,
        minimumMinutes: 60,
        roundingMinutes: 15,
        effectiveFrom: new Date(),
        active: false,
      },
    });
    await prisma.rate.create({
      data: {
        key: 'RATE-PS3-HOURLY',
        version: 1,
        name: 'Tarif PS3 per jam',
        consoleType: 'PS3',
        deviceType: 'CONSOLE',
        billingMode: 'HOURLY',
        amount: 6000,
        minimumMinutes: 60,
        roundingMinutes: 15,
        effectiveFrom: new Date(),
        active: false,
      },
    });
    await prisma.rate.create({
      data: {
        key: 'BOX-PS3-06JAM',
        version: 1,
        name: 'Paket PS Box 6 jam',
        consoleType: 'PS3',
        deviceType: 'PS_BOX',
        billingMode: 'PACKAGE',
        amount: 50000,
        durationMinutes: 360,
        minimumMinutes: 60,
        roundingMinutes: 15,
        effectiveFrom: new Date(),
        active: false,
      },
    });
  }, 20_000);

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
    await prisma.authSession.deleteMany({ where: { staffUserId: adminUserId } });
    await prisma.auditLog.deleteMany({ where: { actorId: adminUserId } });
    await prisma.staffUser.deleteMany({ where: { id: adminUserId } });
    await prisma.$disconnect();
  });

  const authHeaders = () => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${adminToken}`,
  });

  it('GET /api/v1/rates returns list of pricing packages', async () => {
    const response = await fetch(`${origin}/api/v1/rates`, { headers: authHeaders() });
    expect(response.status).toBe(200);

    const body = (await response.json()) as { data: any[] };
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(4);

    const ps4Hourly = body.data
      .filter((r) => r.key === 'RATE-PS4-HOURLY')
      .sort((left, right) => right.version - left.version)[0];
    expect(ps4Hourly).toBeDefined();
    expect(ps4Hourly.amount).toBe(8000);
    expect(ps4Hourly.billingMode).toBe('HOURLY');
    expect(ps4Hourly.deviceType).toBe('CONSOLE');
    expect(ps4Hourly.active).toBe(false);

    const ps3Hourly = body.data
      .filter((r) => r.key === 'RATE-PS3-HOURLY')
      .sort((left, right) => right.version - left.version)[0];
    expect(ps3Hourly).toBeDefined();
    expect(ps3Hourly.amount).toBe(6000);
    expect(ps3Hourly.deviceType).toBe('CONSOLE');
    expect(ps3Hourly.active).toBe(false);

    const psBoxPackage = body.data.find((r) => r.key === 'BOX-PS3-06JAM');
    expect(psBoxPackage).toBeDefined();
    expect(psBoxPackage.amount).toBe(50000);
    expect(psBoxPackage.durationMinutes).toBe(360);
    expect(psBoxPackage.deviceType).toBe('PS_BOX');
    expect(psBoxPackage.active).toBe(false);
  });

  it('POST /api/v1/rates creates a new rate with validation', async () => {
    const testKey = `RATE-TEST-${Date.now()}`;
    const response = await fetch(`${origin}/api/v1/rates`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        key: testKey,
        version: 1,
        name: 'Tarif Promo Spesial',
        consoleType: 'PS4',
        deviceType: 'CONSOLE',
        billingMode: 'HOURLY',
        amount: 8000,
        minimumMinutes: 60,
        roundingMinutes: 15,
        effectiveFrom: new Date().toISOString(),
        active: false,
      }),
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as { data: any };
    expect(body.data.key).toBe(testKey);
    expect(body.data.amount).toBe(8000);

    // Clean up
    await prisma.rate.delete({ where: { id: body.data.id } });
  });

  it('POST /api/v1/rates rejects PACKAGE mode without durationMinutes', async () => {
    const response = await fetch(`${origin}/api/v1/rates`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        key: 'PKG-INVALID',
        version: 1,
        name: 'Paket Tanpa Durasi',
        consoleType: 'PS4',
        deviceType: 'CONSOLE',
        billingMode: 'PACKAGE',
        amount: 20000,
        effectiveFrom: new Date().toISOString(),
      }),
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('GET /api/v1/dashboard/summary returns operational summary', async () => {
    const response = await fetch(`${origin}/api/v1/dashboard/summary`, { headers: authHeaders() });
    expect(response.status).toBe(200);

    const body = (await response.json()) as { data: { metrics: any; stations: any[]; activeRows: any[] } };
    expect(body.data.metrics).toBeDefined();
    expect(body.data.metrics.totalStations).toBeGreaterThanOrEqual(4);
    expect(body.data.stations.length).toBeGreaterThanOrEqual(4);
  });
});