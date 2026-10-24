import { Router } from 'express';
import { prisma } from '../db.js';
import { requireAuthenticatedUser, requireRole } from '../middleware/auth.middleware.js';
import {
  createStationSchema,
  maintenanceStationSchema,
  updateStationSchema,
} from '../schemas/station.schema.js';
import { computeStationStatus, getAllStationsWithState } from '../services/station.service.js';
import { recordAuditEvent } from '../services/audit.service.js';

export const stationsRouter = Router();

// GET /api/v1/stations
stationsRouter.get('/', async (_request, response, next) => {
  try {
    const stations = await getAllStationsWithState();
    response.json({ data: stations });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/stations
stationsRouter.post('/', requireRole('ADMIN'), async (request, response, next) => {
  try {
    const parsed = createStationSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Data station tidak valid.',
          details: parsed.error.issues,
        },
      });
    }

    const existing = await prisma.station.findUnique({
      where: { code: parsed.data.code },
    });
    if (existing) {
      return response.status(409).json({
        error: {
          code: 'STATION_EXISTS',
          message: `Station dengan kode ${parsed.data.code} sudah terdaftar.`,
        },
      });
    }

    const actor = requireAuthenticatedUser(request);
    const station = await prisma.$transaction(async (transaction) => {
      const created = await transaction.station.create({ data: parsed.data });
      await recordAuditEvent(transaction, actor, {
        action: 'STATION_CREATED',
        entityType: 'Station',
        entityId: created.id,
        after: {
          code: created.code,
          consoleType: created.consoleType,
          deviceType: created.deviceType,
          setupConfirmed: created.setupConfirmed,
          active: created.active,
        },
        requestId: request.header('x-request-id')?.slice(0, 100),
      });
      return created;
    });

    response.status(201).json({ data: computeStationStatus(station) });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/stations/:codeOrId
stationsRouter.get('/:codeOrId', async (request, response, next) => {
  try {
    const codeOrId = request.params.codeOrId;
    if (typeof codeOrId !== 'string') return response.status(400).json({ error: 'Parameter kode station tidak valid.' });
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(codeOrId);
    const station = await prisma.station.findFirst({
      where: isUuid ? { OR: [{ id: codeOrId }, { code: codeOrId.toUpperCase() }] } : { code: codeOrId.toUpperCase() },
      include: {
        sessions: {
          where: { status: 'ACTIVE' },
          include: { customer: true },
          take: 1,
        },
        bookings: {
          where: { status: 'CONFIRMED', endsAt: { gte: new Date() } },
          include: { customer: true },
          orderBy: { startsAt: 'asc' },
          take: 1,
        },
      },
    });

    if (!station) {
      return response.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: `Station '${codeOrId}' tidak ditemukan.`,
        },
      });
    }

    response.json({ data: computeStationStatus(station) });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/v1/stations/:codeOrId
stationsRouter.patch('/:codeOrId', requireRole('ADMIN'), async (request, response, next) => {
  try {
    const codeOrId = request.params.codeOrId;
    if (typeof codeOrId !== 'string') return response.status(400).json({ error: 'Parameter kode station tidak valid.' });
    const parsed = updateStationSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Data perubahan station tidak valid.',
          details: parsed.error.issues,
        },
      });
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(codeOrId);
    const target = await prisma.station.findFirst({
      where: isUuid ? { OR: [{ id: codeOrId }, { code: codeOrId.toUpperCase() }] } : { code: codeOrId.toUpperCase() },
    });

    if (!target) {
      return response.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: `Station '${codeOrId}' tidak ditemukan.`,
        },
      });
    }

    const deviceConfigurationChanged =
      (parsed.data.consoleType !== undefined && parsed.data.consoleType !== target.consoleType) ||
      (parsed.data.deviceType !== undefined && parsed.data.deviceType !== target.deviceType);
    if (deviceConfigurationChanged) {
      const [bookingCount, sessionCount] = await Promise.all([
        prisma.booking.count({ where: { stationId: target.id } }),
        prisma.rentalSession.count({ where: { stationId: target.id } }),
      ]);
      if (bookingCount > 0 || sessionCount > 0) {
        return response.status(409).json({
          error: {
            code: 'STATION_HAS_HISTORY',
            message: 'Jenis perangkat tidak dapat diubah setelah station memiliki riwayat booking atau sesi.',
          },
        });
      }
    }

    const actor = requireAuthenticatedUser(request);
    const updated = await prisma.$transaction(async (transaction) => {
      const changed = await transaction.station.update({
        where: { id: target.id },
        data: parsed.data,
      });
      await recordAuditEvent(transaction, actor, {
        action: 'STATION_UPDATED',
        entityType: 'Station',
        entityId: changed.id,
        before: {
          displayName: target.displayName,
          consoleType: target.consoleType,
          deviceType: target.deviceType,
          setupConfirmed: target.setupConfirmed,
          active: target.active,
          maintenanceReason: target.maintenanceReason,
        },
        after: {
          displayName: changed.displayName,
          consoleType: changed.consoleType,
          deviceType: changed.deviceType,
          setupConfirmed: changed.setupConfirmed,
          active: changed.active,
          maintenanceReason: changed.maintenanceReason,
        },
        requestId: request.header('x-request-id')?.slice(0, 100),
      });
      return changed;
    });

    response.json({ data: computeStationStatus(updated) });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/stations/:codeOrId/maintenance
stationsRouter.post('/:codeOrId/maintenance', requireRole('ADMIN'), async (request, response, next) => {
  try {
    const codeOrId = request.params.codeOrId;
    if (typeof codeOrId !== 'string') return response.status(400).json({ error: 'Parameter kode station tidak valid.' });
    const parsed = maintenanceStationSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Data maintenance tidak valid.',
          details: parsed.error.issues,
        },
      });
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(codeOrId);
    const target = await prisma.station.findFirst({
      where: isUuid ? { OR: [{ id: codeOrId }, { code: codeOrId.toUpperCase() }] } : { code: codeOrId.toUpperCase() },
      include: {
        sessions: { where: { status: 'ACTIVE' } },
      },
    });

    if (!target) {
      return response.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: `Station '${codeOrId}' tidak ditemukan.`,
        },
      });
    }

    // Rule: Cannot set maintenance if active session exists
    if (parsed.data.maintenance && target.sessions.length > 0) {
      return response.status(409).json({
        error: {
          code: 'STATION_ACTIVE',
          message: 'Tidak dapat mengatur status maintenance karena station sedang memiliki sesi rental aktif.',
        },
      });
    }

    const actor = requireAuthenticatedUser(request);
    const updated = await prisma.$transaction(async (transaction) => {
      const changed = await transaction.station.update({
        where: { id: target.id },
        data: {
          maintenanceReason: parsed.data.maintenance ? parsed.data.reason : null,
        },
      });
      await recordAuditEvent(transaction, actor, {
        action: parsed.data.maintenance ? 'STATION_MAINTENANCE_ENABLED' : 'STATION_MAINTENANCE_DISABLED',
        entityType: 'Station',
        entityId: changed.id,
        before: { maintenanceReason: target.maintenanceReason },
        after: { maintenanceReason: changed.maintenanceReason },
        requestId: request.header('x-request-id')?.slice(0, 100),
      });
      return changed;
    });

    response.json({ data: computeStationStatus(updated) });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/stations/:codeOrId/confirm-setup - Admin confirms station setup readiness
stationsRouter.post('/:codeOrId/confirm-setup', requireRole('ADMIN'), async (request, response, next) => {
  try {
    const codeOrId = request.params.codeOrId;
    if (typeof codeOrId !== 'string') return response.status(400).json({ error: 'Parameter kode station tidak valid.' });
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(codeOrId);
    const target = await prisma.station.findFirst({
      where: isUuid ? { OR: [{ id: codeOrId }, { code: codeOrId.toUpperCase() }] } : { code: codeOrId.toUpperCase() },
    });

    if (!target) {
      return response.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: `Station '${codeOrId}' tidak ditemukan.`,
        },
      });
    }

    const actor = requireAuthenticatedUser(request);
    const updated = await prisma.$transaction(async (transaction) => {
      const changed = await transaction.station.update({
        where: { id: target.id },
        data: { setupConfirmed: true },
      });
      await recordAuditEvent(transaction, actor, {
        action: 'STATION_SETUP_CONFIRMED',
        entityType: 'Station',
        entityId: changed.id,
        before: { setupConfirmed: target.setupConfirmed },
        after: { setupConfirmed: true },
        requestId: request.header('x-request-id')?.slice(0, 100),
      });
      return changed;
    });

    response.json({
      data: computeStationStatus(updated),
      message: `Konfigurasi station ${updated.code} berhasil dikonfirmasi.`,
    });
  } catch (error) {
    next(error);
  }
});
