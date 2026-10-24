import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/services/password.service.js';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { InvoiceStatus, PaymentMethod } from '@prisma/client';

const testDatabaseUrl = process.env.AQ_TEST_DATABASE_URL;
const hasDedicatedTestDatabase = Boolean(testDatabaseUrl);

let server: ReturnType<Express['listen']> | undefined;
let origin: string;
let prisma: PrismaClient;
let adminToken: string;
let adminUserId: string;
let appModule: { app: Express };

const fixtureId = Math.floor(Math.random() * 10000);
const invoiceNumber = `INV-TEST-${fixtureId}`;

// Skip integration tests if no dedicated test database is configured
const isIntegrationTest = hasDedicatedTestDatabase && testDatabaseUrl.includes('_test');

describe.skipIf(!isIntegrationTest)('Payment API (/api/v1/payments) with auth', () => {
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
    await prisma.payment.deleteMany({ where: {} });
    await prisma.invoice.deleteMany({ where: {} });
    await prisma.authSession.deleteMany({ where: {} });
    await prisma.auditLog.deleteMany({ where: {} });

    // Create admin user and login
    const testPassword = 'TestPassword123!';
    const passwordHash = await hashPassword(testPassword);
    const admin = await prisma.staffUser.create({
      data: { name: 'Admin Payment Test', email: 'admin-payment-test@test.invalid', passwordHash, role: 'ADMIN', active: true },
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
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
    if (prisma) {
      await prisma.payment.deleteMany({ where: {} });
      await prisma.invoice.deleteMany({ where: {} });
      await prisma.authSession.deleteMany({ where: {} });
      await prisma.auditLog.deleteMany({ where: {} });
      await prisma.staffUser.deleteMany({ where: { id: adminUserId } });
      await prisma.$disconnect();
    }
  });

  const authHeaders = () => ({
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + adminToken,
  });

  it('POST /api/v1/payments creates a new payment', async () => {
    // First create an invoice to pay
    const invoiceRes = await fetch(origin + '/api/v1/invoices', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        customerName: 'Test Customer',
        customerPhone: '+62 812 3456 7890',
        amount: 100000,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        notes: 'Test invoice',
      }),
    });

    expect(invoiceRes.status).toBe(201);
    const invoice = (await invoiceRes.json()) as { data: any };
    expect(invoice.data).toBeDefined();
    expect(invoice.data.number).toBeDefined();

// Create payment for the invoice
    const paymentRes = await fetch(origin + '/api/v1/payments', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        invoiceId: invoice.data.id,
        amount: 50000,
        method: 'CASH',
        reference: 'CASH-001',
        idempotencyKey: 'PAYMENT-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9),
      }),
    });

    expect(paymentRes.status).toBe(201);
    const payment = (await paymentRes.json()) as { data: any; message: string };
    expect(payment.data).toBeDefined();
    expect(payment.data.id).toBeDefined();
    expect(payment.data.invoiceId).toBe(invoice.data.id);
    expect(payment.data.amount).toBe(50000);
    expect(payment.data.method).toBe('CASH');
    expect(payment.data.status).toBe('CONFIRMED');

    // Verify invoice status updated to PARTIAL
    expect(payment.data.invoice.status).toBe('PARTIAL');
  });

  it('GET /api/v1/payments/:id retrieves payment by ID', async () => {
// Create a payment first
    const paymentRes = await fetch(origin + '/api/v1/payments', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        invoiceId: 'test-invoice-id',
        amount: 25000,
        method: 'QRIS_MANUAL',
        reference: 'QRIS-001',
      }),
    });

    expect(paymentRes.status).toBe(201);
    const payment = (await paymentRes.json()) as { data: any };
    const paymentId = payment.data.id;

    const getRes = await fetch(origin + '/api/v1/payments/' + paymentId, {
      headers: authHeaders(),
    });

    expect(getRes.status).toBe(200);
    const getBody = (await getRes.json()) as { data: any };
    expect(getBody.data.id).toBe(paymentId);
    expect(getBody.data.amount).toBe(25000);
  });

  it('POST /api/v1/payments/:id/adjustment records payment adjustment', async () => {
    // Create a payment first
    const paymentRes = await fetch(origin + '/api/v1/payments', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        invoiceId: 'test-invoice-id-2',
        amount: 30000,
        method: 'CASH',
        reference: 'CASH-002',
      }),
    });

    expect(paymentRes.status).toBe(201);
    const payment = (await paymentRes.json()) as { data: any };
    const paymentId = payment.data.id;

    // Create adjustment
    const adjustmentRes = await fetch(`${origin}/api/v1/payments/${paymentId}/adjustment`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        amount: 10000,
        type: 'CORRECTION',
        reason: 'Adjustment for overcharge',
        approvedById: 'test-approved-by-id',
      }),
    });

    expect(adjustmentRes.status).toBe(201);
    const adjustment = (await adjustmentRes.json()) as { data: any; message: string };
    expect(adjustment.data).toBeDefined();
    expect(adjustment.data.amount).toBe(10000);
    expect(adjustment.data.type).toBe('CORRECTION');
  });

  it('GET /api/v1/payments lists payments with filters', async () => {
    const response = await fetch(`${origin}/api/v1/payments?method=CASH`, {
      headers: authHeaders(),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: any[] };
    expect(Array.isArray(body.data)).toBe(true);
    // Should have at least the payment we created in the previous test
  });
});