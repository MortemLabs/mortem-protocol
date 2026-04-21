import { randomBytes } from "node:crypto"
// Agent procedures manage agent records, ownership, and API key rotation. Raw API keys are only
// returned at creation or rotation time; the database stores SHA-256 hashes.
import prisma from "@mortemlabs/db"
import { sha256 } from "@mortemlabs/shared"
import { TRPCError } from "@trpc/server"
import { ulid } from "ulid"
import { z } from "zod"
import { addWalletToWebhook, removeWalletFromWebhook } from "../../lib/helius"
import { createTRPCRouter, protectedProcedure } from "../trpc"

const EnvironmentSchema = z.enum(["devnet", "mainnet"])

const agentAccessWhere = (agentId: string, userId: string) => ({
  id: agentId,
  OR: [{ ownerId: userId }, { agentOwners: { some: { userId } } }],
})

const createApiKey = (): string => `mtm_${randomBytes(32).toString("base64url")}`
const createVerifyToken = (): string => `mrt_verify_${randomBytes(4).toString("hex")}`
const AgentDisplayNameSchema = z.string().min(1).regex(/^\S+$/u, "Agent name cannot contain spaces")

const agentListSelect = {
  createdAt: true,
  displayName: true,
  environment: true,
  id: true,
  privateMode: true,
  retentionDays: true,
  verified: true,
  verifiedAt: true,
} as const

const agentDetailSelect = {
  ...agentListSelect,
  agentWallet: true,
  apiKeyHash: true,
  ownerId: true,
} as const

export const agentsRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) =>
    prisma.agent.findMany({
      orderBy: { createdAt: "desc" },
      select: agentListSelect,
      where: {
        OR: [{ ownerId: ctx.userId }, { agentOwners: { some: { userId: ctx.userId } } }],
      },
    }),
  ),

  get: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) =>
    prisma.agent.findFirst({
      select: agentDetailSelect,
      where: agentAccessWhere(input.id, ctx.userId),
    }),
  ),

  checkConnection: protectedProcedure
    .input(z.object({ agentId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [agent, firstTrace] = await Promise.all([
        prisma.agent.findFirst({
          select: { id: true, verified: true },
          where: agentAccessWhere(input.agentId, ctx.userId),
        }),
        prisma.trace.findFirst({
          orderBy: { startedAt: "asc" },
          select: { id: true, startedAt: true },
          where: { agentId: input.agentId },
        }),
      ])

      if (agent === null) {
        throw new TRPCError({ code: "NOT_FOUND" })
      }

      return {
        connected: firstTrace !== null,
        firstSeenAt: firstTrace?.startedAt ?? null,
        firstTraceId: firstTrace?.id ?? null,
        verified: agent.verified,
      }
    }),

  create: protectedProcedure
    .input(
      z.object({
        agentWallet: z.string().min(1).optional(),
        displayName: AgentDisplayNameSchema,
        environment: EnvironmentSchema.default("devnet"),
        privateMode: z.boolean().default(false),
        retentionDays: z.number().int().min(1).max(365).default(30),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const apiKey = createApiKey()
      const agentId = ulid()
      const verifyToken = createVerifyToken()

      await prisma.user.upsert({
        create: { id: ctx.userId },
        update: {},
        where: { id: ctx.userId },
      })
      const agent = await prisma.agent.create({
        data: {
          apiKeyHash: sha256(apiKey),
          agentWallet: input.agentWallet ?? null,
          displayName: input.displayName,
          environment: input.environment,
          id: agentId,
          ownerId: ctx.userId,
          privateMode: input.privateMode,
          retentionDays: input.retentionDays,
          verifyToken,
          agentOwners: {
            create: {
              role: "owner",
              userId: ctx.userId,
            },
          },
        },
      })
      if (input.agentWallet !== undefined) {
        await addWalletToWebhook(input.agentWallet)
      }

      return {
        agent: {
          createdAt: agent.createdAt,
          displayName: agent.displayName,
          environment: agent.environment,
          id: agent.id,
          privateMode: agent.privateMode,
          retentionDays: agent.retentionDays,
          verified: agent.verified,
          verifiedAt: agent.verifiedAt,
        },
        apiKey,
        verifyToken,
      }
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

      return {
        agent: {
          createdAt: agent.createdAt,
          displayName: agent.displayName,
          environment: agent.environment,
          id: agent.id,
          privateMode: agent.privateMode,
          retentionDays: agent.retentionDays,
          verified: agent.verified,
          verifiedAt: agent.verifiedAt,
        },
        apiKey,
      }
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await prisma.agent.findFirst({
        select: { agentWallet: true, id: true },
        where: { id: input.id, ownerId: ctx.userId },
      })

      if (existing === null) {
        return false
      }

      await prisma.agent.delete({ where: { id: input.id } })

      if (existing.agentWallet !== null) {
        await removeWalletFromWebhook(existing.agentWallet)
      }

      return true
    }),
})
