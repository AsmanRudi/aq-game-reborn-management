import type { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from './auth.service.js';

export async function recordAuditEvent(
  transaction: Prisma.TransactionClient,
  actor: AuthenticatedUser,
  event: {
    action: string;
    entityType: string;
    entityId: string;
    before?: Prisma.InputJsonValue;
    after?: Prisma.InputJsonValue;
    requestId?: string;
  },
): Promise<void> {
  await transaction.auditLog.create({
    data: {
      actorId: actor.userId,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId,
      before: event.before,
      after: event.after,
      requestId: event.requestId,
    },
  });
}
