
import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),

  API_PORT: z.coerce
    .number()
    .int()
    .min(1)
    .max(65535)
    .default(3000),

  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),

  DATABASE_URL: z.string().min(1).optional(),

  SESSION_SECRET: z.string().min(32).optional(),
});

export const env = envSchema.parse(process.env);

if (env.NODE_ENV === 'production') {
  const missing: string[] = [];

  if (!env.DATABASE_URL) {
    missing.push('DATABASE_URL');
  }

  if (!env.SESSION_SECRET) {
    missing.push('SESSION_SECRET');
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }
}
