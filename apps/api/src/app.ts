import express from 'express';
import { env } from './config.js';
import { authenticate } from './middleware/auth.middleware.js';
import { authRouter } from './routes/auth.routes.js';
import { bookingsRouter } from './routes/bookings.routes.js';
import { customersRouter } from './routes/customers.routes.js';
import { dashboardRouter } from './routes/dashboard.routes.js';
import { invoicesRouter } from './routes/invoices.routes.js';
import { paymentsRouter } from './routes/payments.routes.js';
import { ratesRouter } from './routes/rates.routes.js';
import { sessionsRouter } from './routes/sessions.routes.js';
import { stationsRouter } from './routes/stations.routes.js';
import { vouchersRouter } from './routes/vouchers.routes.js';

export const app = express();
app.disable('x-powered-by');

function isOriginAllowed(origin?: string): boolean {
  if (!origin) return true;
  if (origin === env.WEB_ORIGIN) return true;
  // Allow localhost, loopback, and private LAN IP ranges (192.168.x, 172.x, 10.x) in development/test
  if (env.NODE_ENV !== 'production') {
    try {
      const parsed = new URL(origin);
      const host = parsed.hostname;
      if (
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host.startsWith('192.168.') ||
        host.startsWith('172.') ||
        host.startsWith('10.')
      ) {
        return true;
      }
    } catch {
      return false;
    }
  }
  return false;
}

app.use((request, response, next) => {
  const origin = request.headers.origin;
  if (origin && isOriginAllowed(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    response.setHeader('Access-Control-Allow-Origin', env.WEB_ORIGIN);
  }
  response.setHeader('Vary', 'Origin');
  response.setHeader('Access-Control-Allow-Credentials', 'true');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Idempotency-Key');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  if (request.method === 'OPTIONS') return response.sendStatus(204);
  next();
});

app.use(express.json({ limit: '32kb' }));

// Health Check
app.get('/api/v1/health', (_request, response) => {
  response.json({ status: 'ok', service: 'aq-game-api', timestamp: new Date().toISOString() });
});

app.use('/api/v1/auth', authRouter);

// Operational data and mutations require a staff session validated against the database.
app.use('/api/v1/stations', authenticate, stationsRouter);
app.use('/api/v1/rates', authenticate, ratesRouter);
app.use('/api/v1/sessions', authenticate, sessionsRouter);
app.use('/api/v1/dashboard', authenticate, dashboardRouter);
app.use('/api/v1/bookings', authenticate, bookingsRouter);
app.use('/api/v1/invoices', authenticate, invoicesRouter);
app.use('/api/v1/payments', authenticate, paymentsRouter);
app.use('/api/v1/customers', authenticate, customersRouter);
app.use('/api/v1/vouchers', authenticate, vouchersRouter);

// 404 Route Not Found
app.use((_request, response) => {
  response.status(404).json({ error: { code: 'NOT_FOUND', message: 'Rute tidak ditemukan.' } });
});

// Global Error Handler
app.use((error: any, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled API Error:', error);
  response.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Terjadi kesalahan internal pada server.',
    },
  });
});