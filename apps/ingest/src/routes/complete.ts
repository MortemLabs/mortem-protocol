// The completion route lets SDKs finalize a trace when the last buffered batch is not enough. It
// verifies API-key ownership, updates terminal fields, and leaves completed traces queued for workers.
import prisma, { type Prisma } from "@mortemlabs/db"
import { TraceStatusSchema } from "@mortemlabs/shared"
import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { checkRateLimit, extractApiKey, resolveAgentId } from "../auth.js"
import { getRedis } from "../redis.js"

const CompleteParamsSchema = z.object({
  id: z.string(),
})

const CompleteBodySchema = z.object({
  endedAt: z.coerce.date().optional(),
  errorMessage: z.string().nullable().optional(),
  outputSummary: z.string().nullable().optional(),
  status: TraceStatusSchema.default("completed"),
})

export const registerCompleteRoutes = (server: FastifyInstance): void => {
  server.post("/v1/traces/:id/complete", async (request, reply) => {
    const params = CompleteParamsSchema.safeParse(request.params)
    const body = CompleteBodySchema.safeParse(request.body ?? {})

    if (!params.success || !body.success) {
      return reply.code(400).send({ error: "Invalid completion request" })
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

    const existing = await prisma.trace.findFirst({
      select: { startedAt: true },
      where: { agentId, id: params.data.id },
    })

    if (existing === null) {
      return reply.code(404).send({ error: "Trace not found" })
    }

    const endedAt = body.data.endedAt ?? new Date()
    const durationMs = Math.max(0, endedAt.getTime() - existing.startedAt.getTime())

    const updateData: Prisma.TraceUpdateInput = {
      durationMs,
      endedAt,
      status: body.data.status,
    }

    if (body.data.errorMessage !== undefined) {
      updateData.errorMessage = body.data.errorMessage
    }

    if (body.data.outputSummary !== undefined) {
      updateData.outputSummary = body.data.outputSummary
    }

    await prisma.trace.update({
      data: updateData,
      where: { id: params.data.id },
    })

    if (body.data.status === "completed" || body.data.status === "errored") {
      await redis.lpush("anchor:pending", params.data.id)
      await redis.lpush("analysis:pending", params.data.id)
    }

    return reply.send({ traceId: params.data.id })
  })
}
