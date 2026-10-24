import { Router } from 'express';
import { SessionStatus } from '@prisma/client';
import { prisma } from '../db.js';
import { requireAuthenticatedUser } from '../middleware/auth.middleware.js';
import { createSessionSchema, stopSessionSchema } from '../schemas/session.schema.js';
import { SessionServiceError, startRentalSession, stopRentalSession } from '../services/session.service.js';

export const sessionsRouter = Router();

// GET /api/v1/sessions
sessionsRouter.get('/', async (request, response, next) => {
  try {
    const { status, stationId, limit } = request.query;

    const where: any = {};
    if (status && (status === 'ACTIVE' || status === 'COMPLETED')) {
      where.status = status as SessionStatus;
    }
    if (stationId && typeof stationId === 'string') {
      where.stationId = stationId;
    }

    const sessions = await prisma.rentalSession.findMany({
      where,
      include: {
        station: true,
        customer: true,
        invoice: true,
      },
      orderBy: { startedAt: 'desc' },
      take: limit ? Math.min(100, Math.max(1, parseInt(limit as string, 10))) : 50,
    });

    response.json({ data: sessions });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/sessions - Start rental
sessionsRouter.post('/', async (request, response, next) => {
  try {
    const parsed = createSessionSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Data sesi rental tidak valid.',
          details: parsed.error.issues,
        },
      });
    }

    const session = await startRentalSession({
      actor: requireAuthenticatedUser(request),
      stationCode: parsed.data.stationCode,
      rateKey: parsed.data.rateKey,
      customerName: parsed.data.customerName,
      customerPhone: parsed.data.customerPhone,
    });

    response.status(201).json({
      data: session,
      message: `Sesi rental untuk ${session.station.code} berhasil dimulai.`,
    });
  } catch (error) {
    if (error instanceof SessionServiceError) {
      return response.status(error.statusCode).json({
        error: {
          code: error.code,
          message: error.message,
        },
      });
    }
    next(error);
  }
});

// GET /api/v1/sessions/:id
sessionsRouter.get('/:id', async (request, response, next) => {
  try {
    const { id } = request.params;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    const session = await prisma.rentalSession.findFirst({
      where: isUuid ? { OR: [{ id }, { number: id }] } : { number: id },
      include: {
        station: true,
        customer: true,
        invoice: {
          include: { payments: true },
        },
      },
    });

    if (!session) {
      return response.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: `Sesi rental '${id}' tidak ditemukan.`,
        },
      });
    }

    response.json({ data: session });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/sessions/:id/stop - Stop rental & calculate bill
sessionsRouter.post('/:id/stop', async (request, response, next) => {
  try {
    const { id } = request.params;
    const parsed = stopSessionSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Data stop sesi tidak valid.',
          details: parsed.error.issues,
        },
      });
    }

    const result = await stopRentalSession(id, parsed.data, requireAuthenticatedUser(request));

    response.json({
      data: result,
      message: `Sesi rental ${result.station.code} selesai. Total tagihan: Rp ${result.invoice.total.toLocaleString('id-ID')}.`,
    });
  } catch (error) {
    if (error instanceof SessionServiceError) {
      return response.status(error.statusCode).json({
        error: {
          code: error.code,
          message: error.message,
        },
      });
    }
    next(error);
  }
});
