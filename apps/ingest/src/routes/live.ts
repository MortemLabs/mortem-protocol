// Live routes expose agent event streams over SSE after verifying the browser's Privy JWT. The
// stream replays recent Redis list entries and polls for new published items.
import prisma from "@mortemlabs/db"
import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { verifyPrivyJwt } from "../privy.js"
import { getRedis } from "../redis.js"

const LiveParamsSchema = z.object({
  id: z.string(),
})

const hasAgentAccess = async (agentId: string, userId: string): Promise<boolean> => {
  const agent = await prisma.agent.findFirst({
    select: { id: true },
    where: {
      id: agentId,
      OR: [{ ownerId: userId }, { agentOwners: { some: { userId } } }],
    },
  })

  return agent !== null
}

const writeSse = (raw: NodeJS.WritableStream, event: string, data: string): void => {
  raw.write(`event: ${event}\n`)
  raw.write(`data: ${data}\n\n`)
}

export const registerLiveRoutes = (server: FastifyInstance): void => {
  server.get("/v1/agents/:id/live", async (request, reply) => {
    const params = LiveParamsSchema.safeParse(request.params)

    if (!params.success) {
      return reply.code(400).send({ error: "Invalid agent id" })
    }

    const userId = await verifyPrivyJwt(request)

    if (userId === undefined) {
      return reply.code(401).send({ error: "Invalid Privy token" })
    }

    if (!(await hasAgentAccess(params.data.id, userId))) {
      return reply.code(403).send({ error: "Forbidden" })
    }

    const redis = getRedis()
    const key = `live:${params.data.id}`
    const seen = new Set<string>()

    reply.hijack()
    reply.raw.writeHead(200, {
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "content-type": "text/event-stream; charset=utf-8",
      "x-accel-buffering": "no",
    })
    reply.raw.write(": connected\n\n")

    const pushUpdates = async (): Promise<void> => {
      try {
        const items = await redis.lrange<string>(key, 0, 999)

        for (const item of items.reverse()) {
          if (seen.has(item)) {
            continue
          }

          seen.add(item)
          writeSse(reply.raw, "trace", item)
        }
      } catch {
        writeSse(reply.raw, "warning", JSON.stringify({ message: "live stream interrupted" }))
      }
    }

    await pushUpdates()

    const interval = setInterval(() => {
      void pushUpdates()
    }, 1_000)

    request.raw.on("close", () => {
      clearInterval(interval)
    })
  })
}
