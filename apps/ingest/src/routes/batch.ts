// The batch route is the main SDK ingestion path. It validates compressed trace batches, resolves
// API keys, rate limits agents, writes traces/events transactionally, and fans out live updates.
import prisma, { Prisma } from "@mortemlabs/db"
import type { JsonValue } from "@mortemlabs/shared"
import type { FastifyInstance, FastifyReply } from "fastify"
import { checkRateLimit, extractApiKey, resolveAgentId } from "../auth.js"
import { type RedisLike, getRedis } from "../redis.js"
import { type TraceBatchInput, TraceBatchSchema } from "../schemas.js"

const stringifyForRedis = (value: unknown): string =>
  JSON.stringify(value, (_key, item: unknown) =>
    typeof item === "bigint" ? item.toString() : item,
  )

const toPrismaJson = (value: JsonValue): Prisma.InputJsonValue | typeof Prisma.JsonNull =>
  value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue)

const persistBatch = async (batch: TraceBatchInput, agentId: string): Promise<void> => {
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    for (const item of batch.items) {
      const { id, ...traceRest } = item.trace
      const traceData = {
        ...traceRest,
        agentId,
      }

      await tx.trace.upsert({
        create: {
          id,
          ...traceData,
        },
        update: traceData,
        where: { id },
      })

      if (item.events.length > 0) {
        await tx.traceEvent.createMany({
          data: item.events.map((event) => ({
            ...event,
            payload: toPrismaJson(event.payload),
            traceId: id,
          })),
          skipDuplicates: true,
        })
      }
    }
  })
}

const publishSideEffects = async (
  redis: RedisLike,
  batch: TraceBatchInput,
  agentId: string,
): Promise<void> => {
  for (const item of batch.items) {
    const livePayload = stringifyForRedis(item)
    await redis.lpush(`live:${agentId}`, livePayload)
    await redis.ltrim(`live:${agentId}`, 0, 999)
    await redis.publish(`pubsub:live:${agentId}`, livePayload)

    if (item.trace.status === "completed" || item.trace.status === "errored") {
      await redis.lpush("analysis:pending", item.trace.id)
    }
  }
}

const publishFirstTraceSignal = async (
  redis: RedisLike,
  batch: TraceBatchInput,
  agentId: string,
): Promise<void> => {
  const firstTrace = batch.items[0]?.trace

  if (firstTrace === undefined) {
    return
  }

  const traceCount = await prisma.trace.count({
    where: { agentId },
  })

  if (traceCount !== 1) {
    return
  }

  await redis.publish(
    "agent:connected",
    JSON.stringify({
      agentId,
      traceId: firstTrace.id,
    }),
  )
}

const verifyAgentOwnership = async (
  redis: RedisLike,
  batch: TraceBatchInput,
  resolvedAgentId: string,
): Promise<void> => {
  if (
    batch.verifyToken === undefined ||
    batch.agentId === undefined ||
    batch.agentId !== resolvedAgentId
  ) {
    return
  }

  const agent = await prisma.agent.findFirst({
    where: {
      id: batch.agentId,
      verifyToken: batch.verifyToken,
      verified: false,
    },
  })

  if (agent === null) {
    return
  }

  await prisma.agent.update({
    data: {
      verified: true,
      verifiedAt: new Date(),
    },
    where: { id: agent.id },
  })

  await redis.publish(
    "agent:verified",
    JSON.stringify({
      agentId: agent.id,
    }),
  )
}

const validationError = (reply: FastifyReply): FastifyReply =>
  reply.code(400).send({ error: "Invalid trace batch" })

export const registerBatchRoutes = (server: FastifyInstance): void => {
  server.post("/v1/traces/batch", async (request, reply) => {
    const parsed = TraceBatchSchema.safeParse(request.body)

    if (!parsed.success) {
      return validationError(reply)
    }

    const apiKey = extractApiKey(request)

    if (apiKey === undefined) {
      return reply.code(401).send({ error: "Missing API key" })
    }

    const redis = getRedis()
    const agentId = await resolveAgentId(redis, apiKey)

    if (agentId === undefined) {
      return reply.code(401).send({ error: "Invalid API key" })
    }

    if (!(await checkRateLimit(redis, agentId))) {
      return reply.code(429).send({ error: "Rate limit exceeded" })
    }

    await persistBatch(parsed.data, agentId)
    await publishSideEffects(redis, parsed.data, agentId)
    await publishFirstTraceSignal(redis, parsed.data, agentId)
    await verifyAgentOwnership(redis, parsed.data, agentId)

    return reply.code(202).send({ traceId: parsed.data.items[0]?.trace.id })
  })
}
