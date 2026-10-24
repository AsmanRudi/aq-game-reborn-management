import { Router } from 'express';
import { PaymentStatus, InvoiceStatus, PaymentMethod } from '@prisma/client';
import { prisma } from '../db.js';
import { requireAuthenticatedUser, requireRole } from '../middleware/auth.middleware.js';
import { recordAuditEvent as recordAuditEventService } from '../services/audit.service.js';
import { SessionServiceError } from '../services/session.service.js';

export const paymentsRouter = Router();

// POST /api/v1/payments - Record a payment for an invoice
paymentsRouter.post('/', async (request, response, next) => {
  try {
    const { invoiceId, amount, method, reference, idempotencyKey } = request.body;

    if (!invoiceId || !amount || !method) {
      return response.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invoice ID, jumlah, dan metode pembayaran wajib diisi.',
        },
      });
    }

    if (!Object.values(PaymentMethod).includes(method)) {
      return response.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Metode pembayaran tidak valid.',
        },
      });
    }

    const actor = requireAuthenticatedUser(request);

    // Check idempotency
    if (idempotencyKey) {
      const existingPayment = await prisma.payment.findUnique({
        where: { idempotencyKey },
      });
      if (existingPayment) {
        return response.status(409).json({
          error: {
            code: 'DUPLICATE_PAYMENT',
            message: 'Pembayaran dengan kunci idempotency ini sudah ada.',
          },
        });
      }
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        session: {
          include: {
            station: true,
            customer: true,
          },
        },
        payments: true,
      },
    });

    if (!invoice) {
      return response.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: `Invoice dengan ID '${invoiceId}' tidak ditemukan.`,
        },
      });
    }

    if (invoice.status === InvoiceStatus.VOID) {
      return response.status(409).json({
        error: {
          code: 'INVOICE_VOIDED',
          message: 'Tidak dapat membayar invoice yang sudah di-void.',
        },
      });
    }

    const totalPaidSoFar = invoice.payments.reduce((sum, p) => sum + p.amount, 0);
    const remainingAmount = invoice.total - totalPaidSoFar;

    if (amount > remainingAmount) {
      return response.status(400).json({
        error: {
          code: 'EXCESS_PAYMENT',
          message: `Jumlah pembayaran (${amount}) melebihi sisa tagihan (${remainingAmount}).`,
        },
      });
    }

    const payment = await prisma.$transaction(async (transaction) => {
      const createdPayment = await transaction.payment.create({
        data: {
          invoice: { connect: { id: invoiceId } },
          idempotencyKey,
          amount,
          method,
          status: 'CONFIRMED',
          recordedBy: { connect: { id: actor.userId } },
          reference,
        },
        include: {
          invoice: {
            include: {
              session: true,
              payments: true,
            },
          },
          recordedBy: { select: { id: true, name: true, email: true } },
        },
      });

      // Update invoice status based on total paid
      const totalPaid = createdPayment.amount + totalPaidSoFar;
      let newStatus: InvoiceStatus;

      if (totalPaid >= invoice.total) {
        newStatus = 'PAID';
      } else if (totalPaid > 0) {
        newStatus = 'PARTIAL';
      } else {
        newStatus = invoice.status; // Should remain UNPAID
      }

      if (newStatus !== invoice.status) {
        const updatedInvoice = await transaction.invoice.update({
          where: { id: invoiceId },
          data: { status: newStatus },
          include: {
            session: true,
            payments: true,
          },
        });

        await recordAuditEventService(transaction, actor, {
          action: 'INVOICE_STATUS_CHANGED',
          entityType: 'Invoice',
          entityId: invoiceId,
          before: { status: invoice.status },
          after: { status: newStatus },
        });
      }

      // Record audit for payment
      await recordAuditEventService(transaction, actor, {
        action: 'PAYMENT_RECORDED',
        entityType: 'Payment',
        entityId: createdPayment.id,
        after: {
          invoiceId: createdPayment.invoiceId,
          amount: createdPayment.amount,
          method: createdPayment.method,
          status: createdPayment.status,
          recordedAt: createdPayment.recordedAt.toISOString(),
        },
      });

      return createdPayment;
    });

    response.status(201).json({
      data: payment,
      message: `Pembayaran sebesar Rp ${amount.toLocaleString('id-ID')} berhasil dicatat untuk invoice ${payment.invoice.number}.`,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/payments - List payments with filters
paymentsRouter.get('/', async (request, response, next) => {
  try {
    const { invoiceId, recordedBy, method, status, startDate, endDate, limit } = request.query;

    const where: any = {};

    if (invoiceId) {
      where.invoiceId = invoiceId;
    }

    if (recordedBy) {
      where.recordedById = recordedBy;
    }

    if (method) {
      where.method = method;
    }

    if (status) {
      where.status = status;
    }

    if (startDate || endDate) {
      where.recordedAt = {};
      if (startDate) {
        where.recordedAt.gte = new Date(startDate as string);
      }
      if (endDate) {
        where.recordedAt.lte = new Date(endDate as string);
      }
    }

    const payments = await prisma.payment.findMany({
      where,
      include: {
        invoice: {
          include: {
            session: {
              include: {
                station: true,
                customer: true,
              },
            },
          },
        },
        recordedBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { recordedAt: 'desc' },
      take: limit ? Math.min(100, Math.max(1, parseInt(limit as string, 10))) : undefined,
    });

    response.json({ data: payments });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/payments/:id - Get payment by ID
paymentsRouter.get('/:id', async (request, response, next) => {
  try {
    const { id } = request.params;

    const payment = await prisma.payment.findUnique({
      where: { id },
      include: {
        invoice: {
          include: {
            session: {
              include: {
                station: true,
                customer: true,
              },
            },
          },
        },
        recordedBy: { select: { id: true, name: true, email: true } },
      },
    });

    if (!payment) {
      return response.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: `Pembayaran dengan ID '${id}' tidak ditemukan.`,
        },
      });
    }

    response.json({ data: payment });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/payments/:id/adjustment - Record a payment adjustment
paymentsRouter.post('/:id/adjustment', async (request, response, next) => {
  try {
    const { id } = request.params;
    const { amount, type, reason, approvedById } = request.body;

    if (!amount || !type || !reason || !approvedById) {
      return response.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Jumlah, tipe, alasan, dan petugas yang menyetujui wajib diisi.',
        },
      });
    }

    const payment = await prisma.payment.findUnique({
      where: { id },
      include: {
        invoice: true,
        recordedBy: { select: { id: true, name: true, email: true } },
      },
    });

    if (!payment) {
      return response.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: `Pembayaran dengan ID '${id}' tidak ditemukan.`,
        },
      });
    }

    const actor = requireAuthenticatedUser(request);

    const adjustment = await prisma.$transaction(async (transaction) => {
      const createdAdjustment = await transaction.paymentAdjustment.create({
        data: {
          payment: { connect: { id } },
          amount,
          type,
          reason,
          approvedById,
        },
        include: {
          payment: true,
        },
      });

      // Update payment amount
      const updatedPayment = await transaction.payment.update({
        where: { id },
        data: {
          amount: payment.amount + amount,
        },
        include: {
          invoice: true,
        },
      });

      // Recalculate invoice status
      const totalPaid = updatedPayment.amount;
      const invoice = updatedPayment.invoice;

      let newStatus: InvoiceStatus;
      if (totalPaid >= invoice.total) {
        newStatus = 'PAID';
      } else if (totalPaid > 0) {
        newStatus = 'PARTIAL';
      } else {
        newStatus = invoice.status;
      }

      if (newStatus !== invoice.status) {
        await transaction.invoice.update({
          where: { id: invoice.id },
          data: { status: newStatus },
        });

        await recordAuditEventService(transaction, actor, {
          action: 'INVOICE_STATUS_CHANGED',
          entityType: 'Invoice',
          entityId: invoice.id,
          before: { status: invoice.status },
          after: { status: newStatus },
        });
      }

      await recordAuditEventService(transaction, actor, {
        action: 'PAYMENT_ADJUSTMENT_RECORDED',
        entityType: 'PaymentAdjustment',
        entityId: createdAdjustment.id,
        after: {
          paymentId: createdAdjustment.paymentId,
          amount: createdAdjustment.amount,
          type: createdAdjustment.type,
          reason: createdAdjustment.reason,
          approvedById: createdAdjustment.approvedById,
        },
      });

      return createdAdjustment;
    });

    response.status(201).json({
      data: adjustment,
      message: `Penyesuaian pembayaran sebesar Rp ${amount.toLocaleString('id-ID')} berhasil dicatat.`,
    });
  } catch (error) {
    next(error);
  }
});