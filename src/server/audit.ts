import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./db";

// "Every important change writes an audit-log row" (Doc 0 §3).
// Call this inside the same transaction as the change it records, so the
// change and its audit row commit or fail together.
type Db = PrismaClient | Prisma.TransactionClient;

export async function audit(
  db: Db,
  entry: {
    userId?: string | null; // null = system / AI-initiated action
    action: string; // e.g. "clinic.created", "task.answered"
    entityType: string; // e.g. "Clinic", "Task"
    entityId: string;
    meta?: Prisma.InputJsonValue; // before/after or extra context
  },
) {
  await db.auditLog.create({
    data: {
      userId: entry.userId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      meta: entry.meta,
    },
  });
}

// Convenience for non-transactional writes.
export const auditLog = (entry: Parameters<typeof audit>[1]) =>
  audit(prisma, entry);
