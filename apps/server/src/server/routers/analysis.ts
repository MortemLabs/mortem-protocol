// Analysis procedures read generated trace analysis and let users queue a rerun for accessible
// traces. Actual LLM work is performed by the analysis worker.
import prisma from "@mortemlabs/db"
import { z } from "zod"
import { getRedis } from "../redis.js"
import { createTRPCRouter, protectedProcedure } from "../trpc.js"

const traceAccessWhere = (traceId: string, userId: string) => ({
  id: traceId,
  agent: {
    OR: [{ ownerId: userId }, { agentOwners: { some: { userId } } }],
  },
})

export const analysisRouter = createTRPCRouter({
  get: protectedProcedure.input(z.object({ traceId: z.string() })).query(async ({ ctx, input }) => {
    const trace = await prisma.trace.findFirst({
      select: { id: true },
      where: traceAccessWhere(input.traceId, ctx.userId),
    })

    if (trace === null) {
      return null
    }

    return prisma.traceAnalysis.findUnique({
      where: { traceId: input.traceId },
    })
  }),

  rerun: protectedProcedure
    .input(z.object({ traceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const trace = await prisma.trace.findFirst({
        select: { id: true },
        where: traceAccessWhere(input.traceId, ctx.userId),
      })

      if (trace === null) {
        return false
      }

      await getRedis().lpush("analysis:pending", input.traceId)
      return true
    }),
})
