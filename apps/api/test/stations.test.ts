import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { hashPassword } from '../src/services/password.service.js';
import type { PrismaClient } from '@prisma/client';

const testDatabaseUrl = process.env.AQ_TEST_DATABASE_URL;
const hasDedicatedTestDatabase = Boolean(testDatabaseUrl);

let server: ReturnType<Express['listen']>;
let origin: string;
let prisma: PrismaClient;
let adminToken: string;
let adminUserId: string;
let appModule: { app: Express };

describe.skipIf(!hasDedicatedTestDatabase)('Stations API (/api/v1/stations) with auth', () => {
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

    // Create admin user and login
    const testPassword = 'TestPassword123!';
    const passwordHash = await hashPassword(testPassword);
    const admin = await prisma.staffUser.create({
      data: { name: 'Admin Test', email: 'admin-stations-test@test.invalid', passwordHash, role: 'ADMIN' },
    });
    adminUserId = admin.id;

    const loginRes = await fetch(`${origin}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: admin.email, password: testPassword }),
    });
    const loginBody = await loginRes.json() as { data: { token: string } };
    adminToken = loginBody.data.token;
  }, 20_000);

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
    if (prisma) {
      await prisma.authSession.deleteMany({ where: { staffUserId: adminUserId } });
      await prisma.auditLog.deleteMany({ where: { actorId: adminUserId } });
      await prisma.staffUser.deleteMany({ where: { id: adminUserId } });
      await prisma.$disconnect();
    }
  });

  const authHeaders = () => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${adminToken}`,
  });

  it('GET /api/v1/stations separates readiness from operational state', async () => {
    const response = await fetch(`${origin}/api/v1/stations`, { headers: authHeaders() });
    expect(response.status).toBe(200);

    const body = (await response.json()) as { data: any[] };
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(4);

    const ps4_01 = body.data.find((s) => s.code === 'PS4-01');
    expect(ps4_01).toBeDefined();
    expect(ps4_01.consoleType).toBe('PS4');
    expect(ps4_01.status).toBe('Tersedia');
    expect(ps4_01.setupConfirmed).toBe(true);
    expect(ps4_01.canStartRental).toBe(true);
  });

  it('POST /api/v1/stations creates a new station with validation', async () => {
    const testCode = `TEST-${Date.now()}`;
    const response = await fetch(`${origin}/api/v1/stations`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        code: testCode,
        consoleType: 'PS4',
      }),
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as { data: any };
    expect(body.data.code).toBe(testCode);
    expect(body.data.consoleType).toBe('PS4');
    expect(body.data.status).toBe('Tersedia');
    expect(body.data.setupConfirmed).toBe(false);
    expect(body.data.canStartRental).toBe(false);

    // Clean up created test station
    await prisma.station.delete({ where: { code: testCode } });
  });

  it('POST /api/v1/stations rejects invalid consoleType with 400', async () => {
    const response = await fetch(`${origin}/api/v1/stations`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        code: 'INVALID-TYPE',
        consoleType: 'XBOX',
      }),
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /api/v1/stations/:code/maintenance toggles maintenance state', async () => {
    const code = `MAINT-${Date.now()}`;
    await prisma.station.create({
      data: { code, consoleType: 'PS4', active: true, setupConfirmed: true },
    });

    // Set maintenance
    const putRes = await fetch(`${origin}/api/v1/stations/${code}/maintenance`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        maintenance: true,
        reason: 'Uji pembersihan ventilasi',
      }),
    });

    expect(putRes.status).toBe(200);
    const putBody = (await putRes.json()) as { data: any };
    expect(putBody.data.status).toBe('Maintenance');
    expect(putBody.data.customer).toBe('Uji pembersihan ventilasi');

    // Restore to available
    const restoreRes = await fetch(`${origin}/api/v1/stations/${code}/maintenance`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        maintenance: false,
      }),
    });

    expect(restoreRes.status).toBe(200);
    const restoreBody = (await restoreRes.json()) as { data: any };
    expect(restoreBody.data.status).toBe('Tersedia');

    await prisma.station.delete({ where: { code } });
  });
});