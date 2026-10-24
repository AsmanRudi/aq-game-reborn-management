import { Router } from 'express';
import { BookingStatus } from '@prisma/client';
import { prisma } from '../db.js';
import { requireAuthenticatedUser, requireRole } from '../middleware/auth.middleware.js';
import {
  createBookingSchema,
  updateBookingStatusSchema,
  getBookingsQuerySchema,
} from '../schemas/booking.schema.js';
import { recordAuditEvent } from '../services/audit.service.js';
import {
  startRentalSession,
  createBooking as createBookingService,
  updateBookingStatus as updateBookingStatusService,
  getBookings as getBookingsService,
  getBookingById as getBookingByIdService,
} from '../services/booking.service.js';

export const bookingsRouter = Router();

// GET /api/v1/bookings - List bookings with filters
bookingsRouter.get('/', async (request, response, next) => {
  try {
    const parsed = getBookingsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return response.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Filter booking tidak valid.',
          details: parsed.error.issues,
        },
      });
    }

    const actor = requireAuthenticatedUser(request);
    const bookings = await getBookingsService({
      actor,
      filters: parsed.data,
    });

    response.json({ data: bookings });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/bookings - Create a new booking
bookingsRouter.post('/', async (request, response, next) => {
  try {
    const parsed = createBookingSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Data booking tidak valid.',
          details: parsed.error.issues,
        },
      });
    }

    const actor = requireAuthenticatedUser(request);
    const booking = await createBookingService({
      actor,
      data: parsed.data,
    });

    response.status(201).json({
      data: booking,
      message: `Booking berhasil dibuat. Nomor booking: ${booking.number}.`,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/bookings/:id - Get booking by ID
bookingsRouter.get('/:id', async (request, response, next) => {
  try {
    const { id } = request.params;
    const actor = requireAuthenticatedUser(request);
    const booking = await getBookingByIdService({
      actor,
      id,
    });

    response.json({ data: booking });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/v1/bookings/:id/status - Update booking status (check-in, confirm, cancel, etc.)
bookingsRouter.patch('/:id/status', async (request, response, next) => {
  try {
    const { id } = request.params;
    const parsed = updateBookingStatusSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Data perubahan status booking tidak valid.',
          details: parsed.error.issues,
        },
      });
    }

    const actor = requireAuthenticatedUser(request);
    const booking = await updateBookingStatusService({
      actor,
      id,
      status: parsed.data.status,
      reason: parsed.data.reason,
    });

    response.json({
      data: booking,
      message: `Status booking ${booking.number} berhasil diperbarui menjadi ${booking.status}.`,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/bookings/:id/check-in - Check-in a confirmed booking to start rental
bookingsRouter.post('/:id/check-in', async (request, response, next) => {
  try {
    const { id } = request.params;
    const actor = requireAuthenticatedUser(request);
    const session = await startRentalSession({
      actor,
      bookingId: id,
    });

    response.status(201).json({
      data: session,
      message: `Booking ${session.booking.number} berhasil dikonfirmasi dan sesi rental dimulai.`,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/bookings/:id/cancel - Cancel a confirmed booking
bookingsRouter.post('/:id/cancel', async (request, response, next) => {
  try {
    const { id } = request.params;
    const { reason } = request.body;
    const actor = requireAuthenticatedUser(request);

    const booking = await updateBookingStatusService({
      actor,
      id,
      status: 'CANCELLED',
      reason,
    });

    response.json({
      data: booking,
      message: `Booking ${booking.number} berhasil dibatalkan.${reason ? ` Alasan: ${reason}` : ''}`,
    });
  } catch (error) {
    next(error);
  }
});