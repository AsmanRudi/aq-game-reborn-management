import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuthenticatedUser, requireRole } from '../middleware/auth.middleware.js';
import { getCustomerLoyaltySummary } from '../services/loyalty.service.js';
import { recordAuditEvent } from '../services/audit.service.js';

export const customersRouter = Router();

const createCustomerSchema = z.object({
  name: z.string().trim().min(2, 'Nama minimal 2 karakter.').max(100),
  phone: z.string().trim().regex(/^\+?[0-9\s-]{8,20}$/, 'Format nomor telepon tidak valid.').optional().nullable(),
  memberNumber: z.string().trim().max(50).optional().nullable(),
  memberStatus: z.boolean().optional(),
  notes: z.string().trim().max(255).optional().nullable(),
});

// GET /api/v1/customers - List customers
customersRouter.get('/', async (request, response, next) => {
  try {
    const { search, limit } = request.query;
    const where: any = {};

    if (typeof search === 'string' && search.trim().length > 0) {
      where.OR = [
        { name: { contains: search.trim(), mode: 'insensitive' } },
        { phone: { contains: search.trim(), mode: 'insensitive' } },
        { memberNumber: { contains: search.trim(), mode: 'insensitive' } },
      ];
    }

    const customers = await prisma.customer.findMany({
      where,
      include: {
        _count: {
          select: {
            sessions: true,
            bookings: true,
            invoices: true,
            vouchers: { where: { status: 'ISSUED' } },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: limit ? Math.min(100, Math.max(1, parseInt(limit as string, 10))) : 50,
    });

    response.json({
      data: customers.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        memberNumber: c.memberNumber,
        memberStatus: c.memberStatus,
        notes: c.notes,
        totalSessions: c._count.sessions,
        totalBookings: c._count.bookings,
        activeVouchers: c._count.vouchers,
        createdAt: c.createdAt,
      })),
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/customers - Create new customer / member
customersRouter.post('/', async (request, response, next) => {
  try {
    const parsed = createCustomerSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Data pelanggan tidak valid.',
          details: parsed.error.issues,
        },
      });
    }

    const actor = requireAuthenticatedUser(request);
    const customer = await prisma.customer.create({
      data: {
        name: parsed.data.name,
        phone: parsed.data.phone || null,
        memberNumber: parsed.data.memberNumber || null,
        memberStatus: parsed.data.memberStatus ?? Boolean(parsed.data.memberNumber),
        notes: parsed.data.notes || null,
      },
    });

    await recordAuditEvent(prisma, actor, {
      action: 'CUSTOMER_CREATED',
      entityType: 'Customer',
      entityId: customer.id,
      after: {
        name: customer.name,
        phone: customer.phone,
        memberNumber: customer.memberNumber,
      },
    });

    response.status(201).json({ data: customer });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/customers/:id - Customer details & history
customersRouter.get('/:id', async (request, response, next) => {
  try {
    const { id } = request.params;
    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        sessions: {
          take: 10,
          orderBy: { startedAt: 'desc' },
          include: { station: true },
        },
        bookings: {
          take: 10,
          orderBy: { startsAt: 'desc' },
          include: { station: true },
        },
        vouchers: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!customer) {
      return response.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: `Pelanggan dengan ID '${id}' tidak ditemukan.`,
        },
      });
    }

    response.json({ data: customer });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/customers/:id/loyalty - Customer loyalty points and vouchers
customersRouter.get('/:id/loyalty', async (request, response, next) => {
  try {
    const { id } = request.params;
    const summary = await getCustomerLoyaltySummary(id);
    response.json({ data: summary });
  } catch (error) {
    next(error);
  }
});

