import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/services/password.service.js';

const testDatabaseUrl = process.env.AQ_TEST_DATABASE_URL;
const hasDedicatedTestDatabase = Boolean(testDatabaseUrl);
let server: ReturnType<(typeof import('../src/app.js'))['app']['listen']>;
let origin: string;
let prisma: (typeof import('../src/db.js'))['prisma'];
let cashierEmail: string;
let adminEmail: string;
let testPassword: string;
let cashierId: string;
let adminId: string;
let createdStationCode: string | undefined;

describe.skipIf(!hasDedicatedTestDatabase)('staff authentication and authorization integration', () => {
  beforeAll(async () => {
    if (!testDatabaseUrl) throw new Error('AQ_TEST_DATABASE_URL must point to a dedicated test database.');
    const parsedUrl = new URL(testDatabaseUrl);
    if (!parsedUrl.pathname.toLowerCase().endsWith('_test')) {
      throw new Error('Database integration tests require a database name ending in _test.');
    }
    process.env.DATABASE_URL = testDatabaseUrl;

    const database = await import('../src/db.js');
    prisma = database.prisma;
    const { app } = await import('../src/app.js');
    testPassword = `Test-only-${Date.now()}-Secure!`;
    cashierEmail = `cashier-${Date.now()}@example.invalid`;
    adminEmail = `admin-${Date.now()}@example.invalid`;
    const passwordHash = await hashPassword(testPassword);
    const [cashier, admin] = await Promise.all([
      prisma.staffUser.create({
        data: { name: 'Kasir Uji', email: cashierEmail, passwordHash, role: 'CASHIER' },
      }),
      prisma.staffUser.create({
        data: { name: 'Admin Uji', email: adminEmail, passwordHash, role: 'ADMIN' },
      }),
    ]);
    cashierId = cashier.id;
    adminId = admin.id;

    server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind to a TCP port');
    origin = `http://127.0.0.1:${address.port}`;
  }, 20_000);

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
    if (prisma) {
      await prisma.authSession.deleteMany({ where: { staffUserId: { in: [cashierId, adminId] } } });
      await prisma.auditLog.deleteMany({ where: { actorId: { in: [cashierId, adminId] } } });
      if (createdStationCode) await prisma.station.deleteMany({ where: { code: createdStationCode } });
      await prisma.staffUser.deleteMany({ where: { id: { in: [cashierId, adminId] } } });
      await prisma.$disconnect();
    }
  });

  it('creates a server-validated staff session and revokes it at logout', async () => {
    const loginResponse = await fetch(origin + '/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: cashierEmail, password: testPassword }),
    });
    expect(loginResponse.status).toBe(200);
    const loginBody = await loginResponse.json() as {
      data: { token: string; user: { id: string; role: string } };
    };
    expect(loginBody.data.user.id).toBe(cashierId);
    expect(loginBody.data.user.role).toBe('CASHIER');
    expect(JSON.stringify(loginBody)).not.toContain('passwordHash');

    const meResponse = await fetch(origin + '/api/v1/auth/me', {
      headers: { Authorization: 'Bearer ' + loginBody.data.token },
    });
    expect(meResponse.status).toBe(200);

    const logoutResponse = await fetch(origin + '/api/v1/auth/logout', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + loginBody.data.token },
    });
    expect(logoutResponse.status).toBe(204);

    const revokedResponse = await fetch(origin + '/api/v1/auth/me', {
      headers: { Authorization: 'Bearer ' + loginBody.data.token },
    });
    expect(revokedResponse.status).toBe(401);
  });

  it('allows admins to mutate stations with an audit event and rejects cashier mutations', async () => {
    const cashierLogin = await fetch(`${origin}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: cashierEmail, password: testPassword }),
    });
    const cashierBody = await cashierLogin.json() as { data: { token: string } };
    const cashierMutation = await fetch(`${origin}/api/v1/stations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cashierBody.data.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code: `C-${Date.now().toString(36)}`, consoleType: 'PS4' }),
    });
    expect(cashierMutation.status).toBe(403);

    const adminLogin = await fetch(`${origin}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminEmail, password: testPassword }),
    });
    const adminBody = await adminLogin.json() as { data: { token: string } };
    createdStationCode = `A-${Date.now().toString(36)}`;
    const adminMutation = await fetch(`${origin}/api/v1/stations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminBody.data.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code: createdStationCode, consoleType: 'PS4' }),
    });
    expect(adminMutation.status).toBe(201);

    const audit = await prisma.auditLog.findFirst({
      where: { actorId: adminId, action: 'STATION_CREATED', entityType: 'Station' },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit?.entityId).toBeDefined();
  });
});
