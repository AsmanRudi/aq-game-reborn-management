import { z } from 'zod';

export const createSessionSchema = z.object({
  stationCode: z
    .string({ message: 'Kode station wajib diisi.' })
    .trim()
    .min(2, 'Kode station minimal 2 karakter.')
    .max(20, 'Kode station maksimal 20 karakter.')
    .transform((val) => val.toUpperCase()),
  rateKey: z.string().trim().optional(),
  customerName: z.string().trim().max(100).optional().default('Pelanggan Walk-in'),
  customerPhone: z.string().trim().max(20).optional().nullable(),
});

export const stopSessionSchema = z.object({
  discount: z.number().int().min(0).default(0).optional(),
  notes: z.string().trim().max(255).optional().nullable(),
});

export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type StopSessionInput = z.infer<typeof stopSessionSchema>;
