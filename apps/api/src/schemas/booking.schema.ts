import { z } from 'zod';

const isoDateTime = z.union([
  z.string().datetime({ message: 'Format tanggal harus ISO 8601' }).transform((s) => new Date(s)),
  z.date(),
]);

export const createBookingSchema = z.object({
  stationCode: z
    .string({ message: 'Kode station wajib diisi.' })
    .trim()
    .min(2, 'Kode station minimal 2 karakter.')
    .max(20, 'Kode station maksimal 20 karakter.')
    .regex(/^[A-Za-z0-9-]+$/, 'Kode station hanya boleh berisi huruf, angka, dan tanda hubung.')
    .transform((v) => v.toUpperCase()),
  customerName: z.string({ message: 'Nama pelanggan wajib diisi.' }).trim().min(2, 'Nama minimal 2 karakter.').max(100, 'Nama maksimal 100 karakter.'),
  customerPhone: z.string({ message: 'Nomor telepon pelanggan wajib diisi.' }).trim().regex(/^\+\d{1,3}\s?\d{6,15}$/, 'Format nomor telepon tidak valid. Gunakan format: +62 812 3456 7890'),
  rateKey: z
    .string({ message: 'Kunci tarif wajib diisi.' })
    .trim()
    .min(3, 'Kunci tarif minimal 3 karakter.')
    .max(50, 'Kunci tarif maksimal 50 karakter.')
    .regex(/^[A-Za-z0-9_-]+$/, 'Kunci tarif hanya boleh berisi huruf, angka, garis bawah, dan tanda hubung.')
    .transform((v) => v.toUpperCase()),
  startsAt: isoDateTime,
  notes: z.string().trim().max(255).optional().nullable(),
});

export const updateBookingStatusSchema = z.object({
  status: z.enum(['CONFIRMED', 'CHECKED_IN', 'CANCELLED', 'NO_SHOW'], {
    message: 'Status booking harus CONFIRMED, CHECKED_IN, CANCELLED, atau NO_SHOW.',
  }),
  reason: z.string().trim().max(255).optional().nullable(),
});

export const getBookingsQuerySchema = z.object({
  stationCode: z.string().optional(),
  customerName: z.string().optional(),
  rateKey: z.string().optional(),
  status: z.enum(['CONFIRMED', 'CHECKED_IN', 'CANCELLED', 'NO_SHOW']).optional(),
  startsAt: isoDateTime.optional(),
  endsAt: isoDateTime.optional(),
  limit: z.string().regex(/^[0-9]+$/).transform((v) => parseInt(v, 10)).optional(),
}).strict();

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type UpdateBookingStatusInput = z.infer<typeof updateBookingStatusSchema>;
export type GetBookingsQueryInput = z.infer<typeof getBookingsQuerySchema>;
export type BookingFilters = GetBookingsQueryInput;

export interface BookingListItem {
  id: string;
  number: string;
  stationCode: string;
  stationDisplayName?: string | null;
  customerName: string;
  customerPhone?: string | null;
  rateKey: string;
  rateName: string;
  consoleType: string;
  deviceType: string;
  billingMode: string;
  startsAt: Date;
  endsAt: Date;
  status: BookingStatus;
  cancelReason?: string | null;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
  customerId?: string | null;
  rateId?: string | null;
}

export interface BookingWithDetails extends BookingListItem {
  station?: any;
  customer?: any;
  rate?: any;
  session?: any;
  createdBy?: any;
}

export class BookingServiceError extends Error {
  constructor(
    public message: string,
    public code: string,
    public statusCode: number = 400,
  ) {
    super(message);
    this.name = 'BookingServiceError';
  }
}

export type BookingStatus = 'CONFIRMED' | 'CHECKED_IN' | 'CANCELLED' | 'NO_SHOW';

export const isBookingConflictError = (error: unknown): error is BookingServiceError => {
  return error instanceof BookingServiceError || (typeof error === 'object' && error !== null && 'code' in error && typeof (error as any).code === 'string');
};