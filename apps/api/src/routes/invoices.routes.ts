import { Router } from 'express';
import { InvoiceStatus } from '@prisma/client';
import { prisma } from '../db.js';
import { requireAuthenticatedUser, requireRole } from '../middleware/auth.middleware.js';
import { createInvoiceSchema, updateInvoiceStatusSchema, getInvoicesQuerySchema } from '../schemas/invoice.schema.js';
import { recordAuditEvent as recordAuditEventService } from '../services/audit.service.js';

export const invoicesRouter = Router();

// GET /api/v1/invoices - List invoices with filters
invoicesRouter.get('/', async (request, response, next) => {
  try {
    const parsed = getInvoicesQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return response.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Filter invoice tidak valid.',
          details: parsed.error.issues,
        },
      });
    }

    const actor = requireAuthenticatedUser(request);
    const where: any = {};

    if (parsed.data.customerName) {
      where.customer = { name: { contains: parsed.data.customerName, mode: 'insensitive' } };
    }

    if (parsed.data.status) {
      where.status = parsed.data.status;
    }

    if (parsed.data.startDate || parsed.data.endDate) {
      where.issuedAt = {};
      if (parsed.data.startDate) {
        where.issuedAt.gte = new Date(parsed.data.startDate);
      }
      if (parsed.data.endDate) {
        where.issuedAt.lte = new Date(parsed.data.endDate);
      }
    }

    const invoices = await prisma.invoice.findMany({
      where,
      include: {
        session: {
          include: {
            station: true,
            customer: true,
          },
        },
        customer: true,
        payments: true,
        rewardLedger: true,
      },
      orderBy: { issuedAt: 'desc' },
      take: parsed.data.limit ? Math.min(100, Math.max(1, parseInt(parsed.data.limit, 10))) : undefined,
    });

    // Calculate paid amount and remaining amount for each invoice
    const formattedInvoices = invoices.map((invoice) => {
      const paidAmount = invoice.payments.reduce((sum, payment) => sum + payment.amount, 0);
      return {
        ...invoice,
        paidAmount,
        remainingAmount: invoice.total - paidAmount,
        payments: undefined, // Remove payments from response
        rewardLedger: undefined, // Remove reward ledger from response
      };
    });

    response.json({ data: formattedInvoices });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/invoices - Create a new invoice
invoicesRouter.post('/', async (request, response, next) => {
  try {
    const parsed = createInvoiceSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Data invoice tidak valid.',
          details: parsed.error.issues,
        },
      });
    }

    const actor = requireAuthenticatedUser(request);

    // Create customer if doesn't exist
    let customer = await prisma.customer.findFirst({
      where: { name: parsed.data.customerName, phone: parsed.data.customerPhone || undefined },
    });

    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          name: parsed.data.customerName,
          phone: parsed.data.customerPhone || null,
          notes: parsed.data.notes || null,
        },
      });
    }

    // Generate unique invoice number
    const today = new Date();
    const yearMonth = today.toISOString().slice(0, 7).replace('-', ''); // YYYYMM
    const count = await prisma.invoice.count({
      where: { number: { startsWith: `INV-${yearMonth}-` } },
    });
    const invoiceNumber = `INV-${yearMonth}-${String(count + 1).padStart(4, '0')}`;

    const invoice = await prisma.$transaction(async (transaction) => {
      // Find a station to link the session with if creating manual invoice
      const station = await transaction.station.findFirst();
      if (!station) {
        throw new Error('Tidak ada station yang tersedia untuk membuat invoice.');
      }

      const session = await transaction.rentalSession.create({
        data: {
          number: `RS-INV-${Date.now().toString(36).toUpperCase()}`,
          stationId: station.id,
          customerId: customer.id,
          rateSnapshot: { amount: parsed.data.amount, billingMode: 'HOURLY', name: 'Manual Invoice' },
          startedAt: new Date(),
          endedAt: new Date(),
          status: 'COMPLETED',
          totalAmount: parsed.data.amount,
          createdById: actor.userId,
        },
      });

      const dueDateStr = parsed.data.dueDate instanceof Date 
        ? parsed.data.dueDate.toISOString() 
        : typeof parsed.data.dueDate === 'string' 
          ? parsed.data.dueDate 
          : new Date().toISOString();

      const createdInvoice = await transaction.invoice.create({
        data: {
          number: invoiceNumber,
          sessionId: session.id,
          customerId: customer.id,
          subtotal: parsed.data.amount,
          discount: 0,
          total: parsed.data.amount,
          status: 'UNPAID',
          pricingSnapshot: {
            amount: parsed.data.amount,
            customerName: parsed.data.customerName,
            customerPhone: parsed.data.customerPhone,
            dueDate: dueDateStr,
            notes: parsed.data.notes,
          },
          issuedAt: new Date(),
        },
        include: {
          customer: true,
          session: true,
        },
      });

      await recordAuditEventService(transaction, actor, {
        action: 'INVOICE_CREATED',
        entityType: 'Invoice',
        entityId: createdInvoice.id,
        after: {
          number: createdInvoice.number,
          customerName: createdInvoice.customer?.name ?? parsed.data.customerName,
          amount: createdInvoice.total,
          status: createdInvoice.status,
          issuedAt: createdInvoice.issuedAt.toISOString(),
        },
      });

      return createdInvoice;
    });

    response.status(201).json({
      data: invoice,
      message: `Invoice berhasil dibuat. Nomor invoice: ${invoice.number}.`,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/invoices/:id - Get invoice by ID
invoicesRouter.get('/:id', async (request, response, next) => {
  try {
    const { id } = request.params;

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        customer: true,
        payments: {
          include: {
            recordedBy: { select: { id: true, name: true, email: true } },
          },
        },
        rewardLedger: true,
      },
    });

    if (!invoice) {
      return response.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: `Invoice dengan ID '${id}' tidak ditemukan.`,
        },
      });
    }

    // Calculate paid amount
    const paidAmount = invoice.payments.reduce((sum, payment) => sum + payment.amount, 0);
    const remainingAmount = invoice.total - paidAmount;

    const formattedInvoice = {
      ...invoice,
      paidAmount,
      remainingAmount,
      payments: undefined, // Remove payments from response
      rewardLedger: undefined, // Remove reward ledger from response
    };

    response.json({ data: formattedInvoice });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/v1/invoices/:id/status - Update invoice status
invoicesRouter.patch('/:id/status', async (request, response, next) => {
  try {
    const { id } = request.params;
    const parsed = updateInvoiceStatusSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Data perubahan status invoice tidak valid.',
          details: parsed.error.issues,
        },
      });
    }

    const actor = requireAuthenticatedUser(request);

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        payments: true,
      },
    });

    if (!invoice) {
      return response.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: `Invoice dengan ID '${id}' tidak ditemukan.`,
        },
      });
    }

    // Validate status transition
    if (invoice.status === 'VOID') {
      return response.status(409).json({
        error: {
          code: 'INVOICE_VOIDED',
          message: 'Tidak dapat mengubah status invoice yang sudah di-void.',
        },
      });
    }

    if (parsed.data.status === 'VOID' && invoice.status === 'PAID') {
      return response.status(409).json({
        error: {
          code: 'INVALID_STATUS_TRANSITION',
          message: 'Tidak dapat mengubah status invoice yang sudah PAID menjadi VOID.',
        },
      });
    }

    // Check if paying fully paid invoice
    if (parsed.data.status === 'PAID') {
      const paidAmount = invoice.payments.reduce((sum, payment) => sum + payment.amount, 0);
      if (paidAmount < invoice.total) {
        return response.status(409).json({
          error: {
            code: 'INVOICE_NOT_FULLY_PAID',
            message: `Tidak dapat mengubah status invoice menjadi PAID karena belum sepenuhnya dibayar (dibayar: ${paidAmount}, total: ${invoice.total}).`,
          },
        });
      }
    }

    // Record audit before update
    await recordAuditEventService(prisma, actor, {
      action: 'INVOICE_STATUS_CHANGED',
      entityType: 'Invoice',
      entityId: id,
      before: { status: invoice.status },
      after: { status: parsed.data.status, reason: parsed.data.reason },
    });

    const updatedInvoice = await prisma.invoice.update({
      where: { id },
      data: {
        status: parsed.data.status,
      },
      include: {
        session: true,
        customer: true,
        payments: true,
      },
    });

    // Calculate paid amount
    const paidAmount = updatedInvoice.payments.reduce((sum, payment) => sum + payment.amount, 0);
    const remainingAmount = updatedInvoice.total - paidAmount;

    const formattedInvoice = {
      ...updatedInvoice,
      paidAmount,
      remainingAmount,
      payments: undefined, // Remove payments from response
    };

    response.json({
      data: formattedInvoice,
      message: `Status invoice ${updatedInvoice.number} berhasil diperbarui menjadi ${parsed.data.status}.${parsed.data.reason ? ` Alasan: ${parsed.data.reason}` : ''}`,
    });
  } catch (error) {
    next(error);
  }
});