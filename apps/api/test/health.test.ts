import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
process.env.SESSION_SECRET ??= 'a-test-secret-that-is-long-enough-for-validation';

const { app } = await import('../src/app.js');
let server: ReturnType<typeof app.listen>;
let origin: string;

beforeAll(async () => {
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind to a TCP port');
  origin = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

describe('GET /api/v1/health', () => {
  it('returns an API health response with an ISO timestamp', async () => {
    const response = await fetch(`${origin}/api/v1/health`);
    const body = await response.json() as { status: string; service: string; timestamp: string };
    expect(response.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.service).toBe('aq-game-api');
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
  });

  it('returns a localized JSON error for unknown API routes', async () => {
    const response = await fetch(`${origin}/api/v1/missing`);
    const body = await response.json() as { error: { code: string; message: string } };
    expect(response.status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toContain('Rute');
  });

  it('returns appropriate CORS header for LAN origins in development', async () => {
    const lanOrigin = 'http://172.18.112.1:5174';
    const response = await fetch(`${origin}/api/v1/health`, {
      headers: { Origin: lanOrigin },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe(lanOrigin);
  });

  it('handles OPTIONS preflight requests cleanly', async () => {
    const lanOrigin = 'http://172.18.112.1:5174';
    const response = await fetch(`${origin}/api/v1/health`, {
      method: 'OPTIONS',
      headers: {
        Origin: lanOrigin,
        'Access-Control-Request-Method': 'GET',
      },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe(lanOrigin);
  });

  it('rejects operational data requests without a validated staff session', async () => {
    const response = await fetch(`${origin}/api/v1/stations`);
    const body = await response.json() as { error: string };
    expect(response.status).toBe(401);
    expect(body.error).toContain('Autentikasi');
  });

  it('rejects station mutations before reading or writing operational data', async () => {
    const response = await fetch(`${origin}/api/v1/stations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'AUTH-TEST-NO-WRITE', consoleType: 'PS4' }),
    });
    expect(response.status).toBe(401);
  });
});
