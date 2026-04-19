import { randomBytes } from "node:crypto"
// Agent procedures manage agent records, ownership, and API key rotation. Raw API keys are only
// returned at creation or rotation time; the database stores SHA-256 hashes.
import prisma from "@mortemlabs/db"
import { sha256 } from "@mortemlabs/shared"
import { ulid } from "ulid"
import { z } from "zod"
import { createTRPCRouter, protectedProcedure } from "../trpc.js"

const EnvironmentSchema = z.enum(["devnet", "mainnet"])

const agentAccessWhere = (agentId: string, userId: string) => ({
  id: agentId,
  OR: [{ ownerId: userId }, { agentOwners: { some: { userId } } }],
})

const createApiKey = (): string => `mtm_${randomBytes(32).toString("base64url")}`

export const agentsRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) =>
    prisma.agent.findMany({
      orderBy: { createdAt: "desc" },
      where: {
        OR: [{ ownerId: ctx.userId }, { agentOwners: { some: { userId: ctx.userId } } }],
      },
    }),
  ),

  get: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) =>
    prisma.agent.findFirst({
      where: agentAccessWhere(input.id, ctx.userId),
    }),
  ),

  create: protectedProcedure
    .input(
      z.object({
        displayName: z.string().min(1),
        environment: EnvironmentSchema.default("devnet"),
        privateMode: z.boolean().default(false),
        retentionDays: z.number().int().min(1).max(365).default(30),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const apiKey = createApiKey()
      const agentId = ulid()

      await prisma.user.upsert({
        create: { id: ctx.userId },
        update: {},
        where: { id: ctx.userId },
      })
      const agent = await prisma.agent.create({
        data: {
          apiKeyHash: sha256(apiKey),
          displayName: input.displayName,
          environment: input.environment,
          id: agentId,
          ownerId: ctx.userId,
          privateMode: input.privateMode,
          retentionDays: input.retentionDays,
          agentOwners: {
            create: {
              role: "owner",
              userId: ctx.userId,
            },
          },
        },
      })

      return { agent, apiKey }
    }),

  rotateKey: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await prisma.agent.findFirst({
        select: { id: true },
        where: agentAccessWhere(input.id, ctx.userId),
      })

      if (existing === null) {
        return null
      }

      const apiKey = createApiKey()
      const agent = await prisma.agent.update({
        data: { apiKeyHash: sha256(apiKey) },
        where: { id: input.id },
      })

      return { agent, apiKey }
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await prisma.agent.findFirst({
        select: { id: true },
        where: { id: input.id, ownerId: ctx.userId },
      })

      if (existing === null) {
        return false
      }

      await prisma.agent.delete({ where: { id: input.id } })
      return true
    }),
})
