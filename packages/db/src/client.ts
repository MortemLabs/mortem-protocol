// The Prisma singleton prevents connection-pool exhaustion during Next.js development reloads.
// Production creates a normal process-local client while dev reuses the global instance.
import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
}

export default prisma
