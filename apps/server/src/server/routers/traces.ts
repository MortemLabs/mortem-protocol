// Trace procedures expose paginated trace browsing, detail reads, public share token controls, and
// deletion for agents the authenticated Privy user can access.
import prisma, { type Prisma } from "@mortemlabs/db"
import { getMerkleRoot } from "@mortemlabs/shared"
import { ulid } from "ulid"
import { z } from "zod"
import { createTRPCRouter, protectedProcedure } from "../trpc"

const TraceListInputSchema = z.object({
  agentId: z.string(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(25),
  status: z.string().optional(),
  tag: z.string().optional(),
})

const agentAccessWhere = (agentId: string, userId: string) => ({
  id: agentId,
  OR: [{ ownerId: userId }, { agentOwners: { some: { userId } } }],
})

const canAccessAgent = async (agentId: string, userId: string): Promise<boolean> => {
  const agent = await prisma.agent.findFirst({
    select: { id: true },
    where: agentAccessWhere(agentId, userId),
  })

  return agent !== null
}

const traceAccessWhere = (traceId: string, userId: string) => ({
  id: traceId,
  agent: {
    OR: [{ ownerId: userId }, { agentOwners: { some: { userId } } }],
  },
})

const getTraceBatchRoot = async ({
  agentId,
  anchorSignature,
}: {
  agentId: string
  anchorSignature: string | null
}): Promise<string | null> => {
  if (anchorSignature === null) {
    return null
  }

  const traces = await prisma.trace.findMany({
    orderBy: { startedAt: "asc" },
    select: { traceHash: true },
    where: {
      agentId,
      anchorSignature,
      traceHash: { not: null },
    },
  })
  const hashes = traces.flatMap((trace) => (trace.traceHash === null ? [] : [trace.traceHash]))

  return hashes.length === 0 ? null : getMerkleRoot(hashes)
}

export const tracesRouter = createTRPCRouter({
  list: protectedProcedure.input(TraceListInputSchema).query(async ({ ctx, input }) => {
    if (!(await canAccessAgent(input.agentId, ctx.userId))) {
      return { items: [], nextCursor: null as string | null }
    }

    const where: Prisma.TraceWhereInput = {
      agentId: input.agentId,
    }

    if (input.status !== undefined) {
      where.status = input.status
    }

    if (input.tag !== undefined) {
      where.tags = { has: input.tag }
    }

    const query: Prisma.TraceFindManyArgs = {
      orderBy: { startedAt: "desc" },
      take: input.limit + 1,
      where,
    }

    if (input.cursor !== undefined) {
      query.cursor = { id: input.cursor }
    }

    const items = await prisma.trace.findMany(query)
    const next = items.length > input.limit ? items.pop() : undefined

    return {
      items,
      nextCursor: next?.id ?? null,
    }
  }),

  get: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const trace = await prisma.trace.findFirst({
      include: {
        analysis: true,
        events: { orderBy: { sequence: "asc" } },
      },
      where: traceAccessWhere(input.id, ctx.userId),
    })

    if (trace === null) {
      return null
    }

    return {
      ...trace,
      merkleRoot: await getTraceBatchRoot({
        agentId: trace.agentId,
        anchorSignature: trace.anchorSignature,
      }),
    }
  }),

  share: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const existing = await prisma.trace.findFirst({
      select: { id: true, shareToken: true },
      where: traceAccessWhere(input.id, ctx.userId),
    })

    if (existing === null) {
      return null
    }

    if (existing.shareToken !== null) {
      return existing.shareToken
    }

    const shareToken = ulid()
    await prisma.trace.update({
      data: { shareToken },
      where: { id: input.id },
    })

    return shareToken
  }),

  unshare: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await prisma.trace.findFirst({
        select: { id: true },
        where: traceAccessWhere(input.id, ctx.userId),
      })

      if (existing === null) {
        return false
      }

      await prisma.trace.update({
        data: { shareToken: null },
        where: { id: input.id },
      })

      return true
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await prisma.trace.findFirst({
        select: { id: true },
        where: traceAccessWhere(input.id, ctx.userId),
      })

      if (existing === null) {
        return false
      }

      await prisma.trace.delete({ where: { id: input.id } })
      return true
    }),
})
