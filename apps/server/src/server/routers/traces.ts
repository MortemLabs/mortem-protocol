// Trace procedures expose paginated trace browsing, detail reads, public share links, and deletion
// for agents the authenticated Privy user can access.
import prisma, { type Prisma } from "@mortemlabs/db"
import { ulid } from "ulid"
import { z } from "zod"
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc"

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

const traceSummarySelect = {
  agentId: true,
  durationMs: true,
  endedAt: true,
  errorMessage: true,
  eventCount: true,
  id: true,
  inputSummary: true,
  outputSummary: true,
  shareToken: true,
  solanaTxCount: true,
  startedAt: true,
  status: true,
  tags: true,
  toolsCalled: true,
  totalCostUsd: true,
  totalLamports: true,
  totalTokens: true,
} satisfies Prisma.TraceSelect

const traceDetailSelect = {
  ...traceSummarySelect,
  analysis: true,
  events: { orderBy: { sequence: "asc" } },
} satisfies Prisma.TraceSelect

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
      select: traceSummarySelect,
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
      select: traceDetailSelect,
      where: traceAccessWhere(input.id, ctx.userId),
    })

    return trace
  }),

  byShareToken: publicProcedure.input(z.object({ token: z.string() })).query(async ({ input }) =>
    prisma.trace.findUnique({
      select: traceDetailSelect,
      where: { shareToken: input.token },
    }),
  ),

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
