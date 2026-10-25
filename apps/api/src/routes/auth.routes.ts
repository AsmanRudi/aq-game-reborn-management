import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireAuthenticatedUser } from '../middleware/auth.middleware.js';
import { createStaffSession, revokeStaffSession } from '../services/auth.service.js';
import { hashPassword } from '../services/password.service.js';
import { prisma } from '../db.js';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(256),
}).strict();

// Schema for creating the first admin user
const bootstrapAdminSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(256),
}).strict();

const attempts = new Map<string, { count: number; resetAt: number }>();
const windowMs = 15 * 60 * 1000;
const maxAttempts = 10;

authRouter.post('/login', async (request, response, next) => {
  const now = Date.now();
  const ip = request.ip ?? request.socket.remoteAddress ?? 'unknown';
  const current = attempts.get(ip);
  if (attempts.size > 10_000) {
    for (const [key, attempt] of attempts) {
      if (attempt.resetAt <= now) attempts.delete(key);
    }
    if (attempts.size > 10_000) attempts.clear();
  }
  if (current && current.resetAt > now && current.count >= maxAttempts) {
    response.status(429).json({ error: 'Terlalu banyak percobaan login. Coba lagi setelah 15 menit.' });
    return;
  }

  const parsed = loginSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Email atau kata sandi tidak valid.',
        details: parsed.error.issues,
      },
    });
    return;
  }

  try {
    const session = await createStaffSession(
      parsed.data.email,
      parsed.data.password,
      request.header('user-agent'),
    );
    if (!session) {
      attempts.set(ip, {
        count: current && current.resetAt > now ? current.count + 1 : 1,
        resetAt: current && current.resetAt > now ? current.resetAt : now + windowMs,
      });
      response.status(401).json({ error: 'Email atau kata sandi salah, atau akun tidak aktif.' });
      return;
    }
    attempts.delete(ip);
    response.json({
      data: {
        token: session.token,
        expiresAt: session.expiresAt,
        user: session.user,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Bootstrap endpoint to create the first admin user (for local development only)
authRouter.post('/bootstrap-admin', async (request, response, next) => {
  try {
    // Only allow in non-production environments
    if (process.env.NODE_ENV === 'production') {
      response.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Endpoint bootstrap-admin tidak tersedia pada environment production.',
        },
      });
      return;
    }

    const parsed = bootstrapAdminSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Data admin pertama tidak valid.',
          details: parsed.error.issues,
        },
      });
      return;
    }

    // Check if any admin user already exists
    const existingAdmin = await prisma.staffUser.findFirst({
      where: { role: 'ADMIN' },
    });

    if (existingAdmin) {
      response.status(409).json({
        error: {
          code: 'ADMIN_ALREADY_EXISTS',
          message: 'Admin sudah ada. Gunakan endpoint login biasa atau reset database.',
        },
      });
      return;
    }

    // Create admin user with hashed password
    const passwordHash = await hashPassword(parsed.data.password);
    const adminUser = await prisma.staffUser.create({
      data: {
        id: '00000000-0000-0000-0000-000000000000', // Use a known UUID for the first admin
        name: parsed.data.name,
        email: parsed.data.email.toLowerCase(),
        passwordHash,
        role: 'ADMIN',
        active: true,
      },
    });

    response.status(201).json({
      data: {
        id: adminUser.id,
        name: adminUser.name,
        email: adminUser.email,
        role: adminUser.role,
        active: adminUser.active,
        createdAt: adminUser.createdAt,
        updatedAt: adminUser.updatedAt,
      },
      message: 'Admin pertama berhasil dibuat. Gunakan kredensial ini untuk login.',
    });
  } catch (error) {
    next(error);
  }
});

authRouter.get('/me', authenticate, (request, response) => {
  const user = requireAuthenticatedUser(request);
  response.json({
    data: {
      id: user.userId,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  });
});

authRouter.post('/logout', authenticate, async (request, response, next) => {
  try {
    const user = requireAuthenticatedUser(request);
    await revokeStaffSession(user.sessionId);
    response.status(204).end();
  } catch (error) {
    next(error);
  }
});