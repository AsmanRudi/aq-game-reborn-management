import { Router } from 'express';
import { prisma } from '../db.js';
import { requireAuthenticatedUser } from '../middleware/auth.middleware.js';
import { redeemVoucherForSession, LoyaltyServiceError } from '../services/loyalty.service.js';

export const vouchersRouter = Router();

// GET /api/v1/vouchers/:code - Check voucher validity
vouchersRouter.get('/:code', async (request, response, next) => {
  try {
    const code = request.params.code?.toUpperCase();
    const voucher = await prisma.voucher.findUnique({
      where: { code },
      include: {
        customer: true,
      },
    });

    if (!voucher) {
      return response.status(404).json({
        error: {
          code: 'VOUCHER_NOT_FOUND',
          message: `Voucher dengan kode '${code}' tidak ditemukan.`,
        },
      });
    }

    const isExpired = voucher.expiresAt ? voucher.expiresAt < new Date() : false;
    const isValid = voucher.status === 'ISSUED' && !isExpired;

    response.json({
      data: {
        id: voucher.id,
        code: voucher.code,
        durationMinutes: voucher.durationMinutes,
        status: isExpired ? 'EXPIRED' : voucher.status,
        isValid,
        expiresAt: voucher.expiresAt,
        customer: voucher.customer ? { id: voucher.customer.id, name: voucher.customer.name } : null,
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/vouchers/:code/redeem - Redeem voucher for a rental session
vouchersRouter.post('/:code/redeem', async (request, response, next) => {
  try {
    const code = request.params.code;
    const { sessionId, customerId } = request.body;

    if (!sessionId) {
      return response.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'sessionId wajib disertakan untuk menukar voucher.',
        },
      });
    }

    const actor = requireAuthenticatedUser(request);
    const voucher = await prisma.$transaction(async (tx) => {
      return await redeemVoucherForSession(tx, {
        voucherCode: code,
        sessionId,
        customerId,
        actor,
      });
    });

    response.json({
      data: voucher,
      message: `Voucher ${voucher.code} berhasil ditukarkan untuk sesi sewa.`,
    });
  } catch (error) {
    if (error instanceof LoyaltyServiceError) {
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

