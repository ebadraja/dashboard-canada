import { PrismaClient } from "@prisma/client";

// One PrismaClient for the whole long-running server (see STACK.md).
// The globalThis stash prevents dev hot-reload from opening new connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
