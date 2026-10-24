import { z } from 'zod';

export const ConsoleTypeEnum = z.enum(['PS3', 'PS4'], {
  message: 'Tipe console harus PS3 atau PS4.',
});

export const StationDeviceTypeEnum = z.enum(['CONSOLE', 'PS_BOX'], {
  message: 'Jenis perangkat harus CONSOLE atau PS_BOX.',
});

export const createStationSchema = z.object({
  code: z
    .string({ message: 'Kode station wajib diisi.' })
    .trim()
    .min(2, 'Kode station minimal 2 karakter.')
    .max(20, 'Kode station maksimal 20 karakter.')
    .regex(/^[A-Za-z0-9-]+$/, 'Kode station hanya boleh berisi huruf, angka, dan tanda hubung.')
    .transform((v) => v.toUpperCase()),
  consoleType: ConsoleTypeEnum,
  deviceType: StationDeviceTypeEnum.optional().default('CONSOLE'),
  displayName: z.string().trim().min(2).max(100).optional().nullable(),
  active: z.boolean().optional().default(true),
  maintenanceReason: z.string().trim().max(255).optional().nullable(),
});

export const updateStationSchema = z.object({
  consoleType: ConsoleTypeEnum.optional(),
  deviceType: StationDeviceTypeEnum.optional(),
  displayName: z.string().trim().min(2).max(100).optional().nullable(),
  setupConfirmed: z.boolean().optional(),
  active: z.boolean().optional(),
  maintenanceReason: z.string().trim().max(255).optional().nullable(),
});

export const maintenanceStationSchema = z
  .object({
    maintenance: z.boolean({ message: 'Status maintenance wajib ditentukan (true/false).' }),
    reason: z.string().trim().max(255).optional().nullable(),
  })
  .refine(
    (data) => {
      if (data.maintenance && (!data.reason || data.reason.length === 0)) {
        return false;
      }
      return true;
    },
    {
      message: 'Alasan maintenance wajib diisi jika status diatur ke maintenance.',
      path: ['reason'],
    }
  );

export type CreateStationInput = z.infer<typeof createStationSchema>;
export type UpdateStationInput = z.infer<typeof updateStationSchema>;
export type MaintenanceStationInput = z.infer<typeof maintenanceStationSchema>;
