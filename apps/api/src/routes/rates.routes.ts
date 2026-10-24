import { Router } from 'express';
import { Prisma, StationDeviceType } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuthenticatedUser, requireRole } from '../middleware/auth.middleware.js';
import { createRateSchema, updateRateSchema } from '../schemas/rate.schema.js';
import { recordAuditEvent } from '../services/audit.service.js';
import { ratePeriodsOverlap } from '../services/rate-period.service.js';

export const ratesRouter = Router();

const listRatesQuerySchema = z.object({
  active: z.enum(['true', 'false']).optional(),
  consoleType: z.enum(['PS3', 'PS4']).optional(),
  billingMode: z.enum(['HOURLY', 'PACKAGE']).optional(),
  deviceType: z.enum(['CONSOLE', 'PS_BOX']).optional(),
}).strict();

// GET /api/v1/rates
ratesRouter.get('/', async (request, response, next) => {
  try {
    const parsed = listRatesQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return response.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Filter tarif tidak valid.',
          details: parsed.error.issues,
        },
      });
    }

    const where: Prisma.RateWhereInput = {
      ...(parsed.data.active !== undefined && { active: parsed.data.active === 'true' }),
      ...(parsed.data.consoleType && { consoleType: parsed.data.consoleType }),
      ...(parsed.data.billingMode && { billingMode: parsed.data.billingMode }),
      ...(parsed.data.deviceType && {
        deviceType: parsed.data.deviceType === 'PS_BOX' ? StationDeviceType.PS_BOX : StationDeviceType.CONSOLE,
      }),
    };

    const rates = await prisma.rate.findMany({
      where,
      orderBy: [{ consoleType: 'desc' }, { billingMode: 'asc' }, { amount: 'asc' }],
    });

    response.json({ data: rates });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/rates
ratesRouter.post('/', requireRole('ADMIN'), async (request, response, next) => {
  try {
    const parsed = createRateSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Data tarif/paket tidak valid.',
          details: parsed.error.issues,
        },
      });
    }

    const existing = await prisma.rate.findUnique({
      where: {
        key_version: {
          key: parsed.data.key,
          version: parsed.data.version,
        },
      },
    });

    if (existing) {
      return response.status(409).json({
        error: {
          code: 'RATE_VERSION_EXISTS',
          message: `Tarif dengan kunci '${parsed.data.key}' versi ${parsed.data.version} sudah ada.`,
        },
      });
    }

    if (parsed.data.active) {
      const activeRates = await prisma.rate.findMany({
        where: {
          active: true,
          deviceType: parsed.data.deviceType,
          consoleType: parsed.data.consoleType,
          billingMode: parsed.data.billingMode,
          durationMinutes: parsed.data.durationMinutes ?? null,
        },
        select: {
          active: true,
          deviceType: true,
          consoleType: true,
          billingMode: true,
          durationMinutes: true,
          effectiveFrom: true,
          effectiveTo: true,
        },
      });
      if (activeRates.some((rate) => ratePeriodsOverlap(parsed.data, rate))) {
        return response.status(409).json({
          error: {
            code: 'RATE_PERIOD_CONFLICT',
            message: 'Periode tarif aktif bertabrakan dengan tarif lain untuk perangkat, konsol, dan durasi yang sama.',
          },
        });
      }
    }

    const actor = requireAuthenticatedUser(request);
    const rate = await prisma.$transaction(async (transaction) => {
      const created = await transaction.rate.create({ data: parsed.data });
      await recordAuditEvent(transaction, actor, {
        action: 'RATE_CREATED',
        entityType: 'Rate',
        entityId: created.id,
        after: {
          key: created.key,
          version: created.version,
          name: created.name,
          consoleType: created.consoleType,
          deviceType: created.deviceType,
          billingMode: created.billingMode,
          amount: created.amount,
          durationMinutes: created.durationMinutes,
          effectiveFrom: created.effectiveFrom.toISOString(),
          effectiveTo: created.effectiveTo?.toISOString() ?? null,
          active: created.active,
        },
        requestId: request.header('x-request-id')?.slice(0, 100),
      });
      return created;
    });

    response.status(201).json({ data: rate });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/rates/:id
ratesRouter.get('/:id', async (request, response, next) => {
  try {
    const id = request.params.id;
    if (typeof id !== 'string') return response.status(400).json({ error: 'Parameter ID tarif tidak valid.' });
    const rate = await prisma.rate.findUnique({
      where: { id },
    });

    if (!rate) {
      return response.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: `Tarif dengan ID '${id}' tidak ditemukan.`,
        },
      });
    }

    response.json({ data: rate });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/v1/rates/:id
ratesRouter.patch('/:id', requireRole('ADMIN'), async (request, response, next) => {
  try {
    const id = request.params.id;
    if (typeof id !== 'string') return response.status(400).json({ error: 'Parameter ID tarif tidak valid.' });
    const parsed = updateRateSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Data perubahan tarif tidak valid.',
          details: parsed.error.issues,
        },
      });
    }

    const target = await prisma.rate.findUnique({ where: { id } });
    if (!target) {
      return response.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: `Tarif dengan ID '${id}' tidak ditemukan.`,
        },
      });
    }

    const candidate = {
      active: parsed.data.active ?? target.active,
      deviceType: target.deviceType,
      consoleType: target.consoleType,
      billingMode: target.billingMode,
      durationMinutes: target.durationMinutes,
      effectiveFrom: target.effectiveFrom,
      effectiveTo: parsed.data.effectiveTo === undefined ? target.effectiveTo : parsed.data.effectiveTo,
    };
    if (candidate.effectiveTo && candidate.effectiveTo.getTime() <= candidate.effectiveFrom.getTime()) {
      return response.status(400).json({
        error: {
          code: 'INVALID_RATE_PERIOD',
          message: 'Tanggal akhir berlaku harus setelah tanggal mulai berlaku.',
        },
      });
    }

    if (candidate.active) {
      const activeRates = await prisma.rate.findMany({
        where: {
          id: { not: target.id },
          active: true,
          deviceType: candidate.deviceType,
          consoleType: candidate.consoleType,
          billingMode: candidate.billingMode,
          durationMinutes: candidate.durationMinutes,
        },
        select: {
          active: true,
          deviceType: true,
          consoleType: true,
          billingMode: true,
          durationMinutes: true,
          effectiveFrom: true,
          effectiveTo: true,
        },
      });
      if (activeRates.some((rate) => ratePeriodsOverlap(candidate, rate))) {
        return response.status(409).json({
          error: {
            code: 'RATE_PERIOD_CONFLICT',
            message: 'Periode tarif aktif bertabrakan dengan tarif lain untuk perangkat, konsol, dan durasi yang sama.',
          },
        });
      }
    }

    const actor = requireAuthenticatedUser(request);
    const updated = await prisma.$transaction(async (transaction) => {
      const changed = await transaction.rate.update({
        where: { id },
        data: parsed.data,
      });
      await recordAuditEvent(transaction, actor, {
        action: 'RATE_UPDATED',
        entityType: 'Rate',
        entityId: changed.id,
        before: {
          name: target.name,
          effectiveTo: target.effectiveTo?.toISOString() ?? null,
          active: target.active,
        },
        after: {
          name: changed.name,
          effectiveTo: changed.effectiveTo?.toISOString() ?? null,
          active: changed.active,
        },
        requestId: request.header('x-request-id')?.slice(0, 100),
      });
      return changed;
    });

    response.json({ data: updated });
  } catch (error) {
    next(error);
  }
});
