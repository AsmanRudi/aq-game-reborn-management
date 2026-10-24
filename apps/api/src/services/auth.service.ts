import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '../db.js';
import { verifyPassword } from './password.service.js';

export interface AuthenticatedUser {
  userId: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'CASHIER';
  sessionId: string;
}

export const authSessionLifetimeMs = 12 * 60 * 60 * 1000;

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createStaffSession(
  email: string,
  password: string,
  userAgent?: string,
) {
  const normalizedEmail = email.trim().toLowerCase();
  const staff = await prisma.staffUser.findUnique({ where: { email: normalizedEmail } });
  const passwordValid = await verifyPassword(password, staff?.passwordHash ?? '');
  if (!staff || !staff.active || !passwordValid) return null;

  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + authSessionLifetimeMs);
  const session = await prisma.authSession.create({
    data: {
      staffUserId: staff.id,
      tokenHash: hashSessionToken(token),
      expiresAt,
      userAgent: userAgent?.slice(0, 512) ?? null,
    },
  });

  return {
    token,
    expiresAt,
    sessionId: session.id,
    user: {
      id: staff.id,
      name: staff.name,
      email: staff.email,
      role: staff.role,
    },
  };
}

export async function findAuthenticatedSession(token: string): Promise<AuthenticatedUser | null> {
  const session = await prisma.authSession.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { staffUser: true },
  });
  if (!session || session.revokedAt || session.expiresAt <= new Date() || !session.staffUser.active) return null;
  return {
    userId: session.staffUser.id,
    name: session.staffUser.name,
    email: session.staffUser.email,
    role: session.staffUser.role,
    sessionId: session.id,
  };
}

export async function revokeStaffSession(sessionId: string): Promise<void> {
  await prisma.authSession.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
