import { z } from 'zod';

const isoDateTime = z.union([
  z.string().datetime({ message: 'Format tanggal harus ISO 8601' }).transform((s) => new Date(s)),
  z.date(),
]);

export const createInvoiceSchema = z.object({
  customerName: z.string({ message: 'Nama pelanggan wajib diisi.' }).trim().min(2, 'Nama minimal 2 karakter.').max(100, 'Nama maksimal 100 karakter.'),
  customerPhone: z.string({ message: 'Nomor telepon pelanggan wajib diisi.' }).trim().regex(/^\+\d{1,3}\s?\d{6,15}$/, 'Format nomor telepon tidak valid. Gunakan format: +62 812 3456 7890'),
  amount: z.number({ message: 'Jumlah wajib diisi.' }).int('Jumlah harus berupa bilangan bulat Rupiah.').min(0, 'Jumlah tidak boleh negatif.'),
  dueDate: isoDateTime,
  notes: z.string().trim().max(255).optional().nullable(),
});

export const updateInvoiceStatusSchema = z.object({
  status: z.enum(['UNPAID', 'PARTIAL', 'PAID', 'VOID'], {
    message: 'Status invoice harus UNPAID, PARTIAL, PAID, atau VOID.',
  }),
  reason: z.string().trim().max(255).optional().nullable(),
});

export const getInvoicesQuerySchema = z.object({
  customerName: z.string().optional(),
  status: z.enum(['UNPAID', 'PARTIAL', 'PAID', 'VOID']).optional(),
  startDate: isoDateTime.optional(),
  endDate: isoDateTime.optional(),
  limit: z.string().regex(/^[0-9]+$/).optional(),
}).strict();

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type UpdateInvoiceStatusInput = z.infer<typeof updateInvoiceStatusSchema>;
export type GetInvoicesQueryInput = z.infer<typeof getInvoicesQuerySchema>;
export type InvoiceFilters = GetInvoicesQueryInput;

export interface InvoiceListItem {
  id: string;
  number: string;
  customerName: string;
  customerPhone?: string | null;
  amount: number;
  dueDate: Date;
  status: string;
  paidAmount: number;
  remainingAmount: number;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
  customerId?: string | null;
}

export interface InvoiceWithDetails extends InvoiceListItem {
  session?: any;
  customer?: any;
  payments?: any[];
  rewardLedger?: any[];
}

export class InvoiceServiceError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 400,
  ) {
    super(message);
    this.name = 'InvoiceServiceError';
  }
}

export const isInvoiceConflictError = (error: unknown): error is InvoiceServiceError => {
  return error instanceof InvoiceServiceError || (typeof error === 'object' && error !== null && 'code' in error && typeof (error as any).code === 'string');
};