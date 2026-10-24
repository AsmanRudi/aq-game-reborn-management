import { z } from 'zod';
import { ConsoleTypeEnum, StationDeviceTypeEnum } from './station.schema.js';

export const BillingModeEnum = z.enum(['HOURLY', 'PACKAGE'], {
  message: 'Mode penagihan harus HOURLY atau PACKAGE.',
});

export const createRateSchema = z
  .object({
    key: z
      .string({ message: 'Kunci tarif wajib diisi.' })
      .trim()
      .min(3, 'Kunci tarif minimal 3 karakter.')
      .max(50, 'Kunci tarif maksimal 50 karakter.')
      .regex(/^[A-Za-z0-9_-]+$/, 'Kunci tarif hanya boleh berisi huruf, angka, garis bawah, dan tanda hubung.')
      .transform((v) => v.toUpperCase()),
    version: z.number().int().min(1).default(1),
    name: z
      .string({ message: 'Nama tarif/paket wajib diisi.' })
      .trim()
      .min(3, 'Nama tarif minimal 3 karakter.')
      .max(100, 'Nama tarif maksimal 100 karakter.'),
    consoleType: ConsoleTypeEnum.optional().nullable(),
    deviceType: StationDeviceTypeEnum.optional().default('CONSOLE'),
    billingMode: BillingModeEnum,
    amount: z
      .number({ message: 'Nominal harga wajib diisi.' })
      .int('Nominal harga harus berupa bilangan bulat Rupiah.')
      .min(0, 'Nominal harga tidak boleh negatif.'),
    durationMinutes: z.number().int().positive('Durasi menit harus bernilai positif.').optional().nullable(),
    minimumMinutes: z.number().int().min(0).default(0),
    roundingMinutes: z.number().int().positive().default(15),
    effectiveFrom: z
      .string()
      .datetime({ message: 'Tanggal mulai berlaku harus format ISO 8601.' })
      .or(z.date())
      .transform((val) => (typeof val === 'string' ? new Date(val) : val)),
    effectiveTo: z
      .string()
      .datetime({ message: 'Tanggal akhir berlaku harus format ISO 8601.' })
      .or(z.date())
      .optional()
      .nullable()
      .transform((val) => (val === undefined ? undefined : typeof val === 'string' ? new Date(val) : val)),
    active: z.boolean().optional().default(true),
  })
  .superRefine((data, context) => {
    if (data.effectiveTo && data.effectiveTo.getTime() <= data.effectiveFrom.getTime()) {
      context.addIssue({
        code: 'custom',
        message: 'Tanggal akhir berlaku harus setelah tanggal mulai berlaku.',
        path: ['effectiveTo'],
      });
    }

    if (!data.consoleType) {
      context.addIssue({
        code: 'custom',
        message: 'Tipe konsol wajib dipilih untuk tarif atau paket.',
        path: ['consoleType'],
      });
      return;
    }

    if (data.billingMode === 'HOURLY') {
      const hourlyPrice = data.consoleType === 'PS3' ? 6000 : 8000;
      if (data.deviceType !== 'CONSOLE') {
        context.addIssue({
          code: 'custom',
          message: 'Tarif per jam hanya berlaku untuk konsol biasa.',
          path: ['deviceType'],
        });
      }
      if (data.amount !== hourlyPrice) {
        context.addIssue({
          code: 'custom',
          message: `Tarif per jam ${data.consoleType} harus Rp${hourlyPrice.toLocaleString('id-ID')}.`,
          path: ['amount'],
        });
      }
      if (data.durationMinutes != null) {
        context.addIssue({
          code: 'custom',
          message: 'Tarif per jam tidak menggunakan durasi paket.',
          path: ['durationMinutes'],
        });
      }
      return;
    }

    if (data.deviceType !== 'PS_BOX') {
      context.addIssue({
        code: 'custom',
        message: 'Paket yang ditetapkan saat ini hanya berlaku untuk perangkat PS Box.',
        path: ['deviceType'],
      });
    }

    const packagePrices = data.consoleType === 'PS3'
      ? new Map([[360, 50000], [720, 90000], [1440, 130000]])
      : new Map([[360, 60000], [720, 100000], [1440, 140000]]);
    const expectedPrice = data.durationMinutes == null ? undefined : packagePrices.get(data.durationMinutes);

    if (expectedPrice === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'Durasi paket PS Box harus 6, 12, atau 24 jam.',
        path: ['durationMinutes'],
      });
    } else if (data.amount !== expectedPrice) {
      context.addIssue({
        code: 'custom',
        message: `Harga paket ${data.consoleType} tidak sesuai dengan durasinya.`,
        path: ['amount'],
      });
    }
  });

export const updateRateSchema = z.object({
  name: z.string().trim().min(3).max(100).optional(),
  effectiveTo: z
    .string()
    .datetime()
    .or(z.date())
    .optional()
    .nullable()
    .transform((val) => (val === undefined ? undefined : typeof val === 'string' ? new Date(val) : val)),
  active: z.boolean().optional(),
});

export type CreateRateInput = z.infer<typeof createRateSchema>;
export type UpdateRateInput = z.infer<typeof updateRateSchema>;
