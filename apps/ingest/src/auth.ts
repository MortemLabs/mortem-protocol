// Ingest auth resolves SDK API keys to agents through a Redis cache with Prisma fallback. The same
// module also owns per-agent Redis rate limiting for write endpoints.
import prisma from "@mortemlabs/db"
import { sha256 } from "@mortemlabs/shared"
import type { FastifyRequest } from "fastify"
import { getIngestEnv } from "./env.js"
import type { RedisLike } from "./redis.js"

const API_KEY_TTL_SECONDS = 900
const RATE_LIMIT_TTL_SECONDS = 120

export const extractApiKey = (request: FastifyRequest): string | undefined => {
  const explicit = request.headers["x-mortem-api-key"]

  if (typeof explicit === "string" && explicit.length > 0) {
    return explicit
  }

  const authorization = request.headers.authorization

  if (authorization?.startsWith("Bearer ") === true) {
    return authorization.slice("Bearer ".length)
  }

  return undefined
}

export const resolveAgentId = async (
  redis: RedisLike,
  apiKey: string,
): Promise<string | undefined> => {
  const apiKeyHash = sha256(apiKey)
  const cacheKey = `apikey:${apiKeyHash}`
  const cached = await redis.get<string>(cacheKey)

  if (cached !== null) {
    return cached
  }

  const agent = await prisma.agent.findUnique({
    select: { id: true },
    where: { apiKeyHash },
  })

  if (agent === null) {
    return undefined
  }

  await redis.set(cacheKey, agent.id, { ex: API_KEY_TTL_SECONDS })
  return agent.id
}

export const checkRateLimit = async (redis: RedisLike, agentId: string): Promise<boolean> => {
  const env = getIngestEnv()
  const minute = Math.floor(Date.now() / 60_000)
  const key = `ratelimit:${agentId}:${minute}`
  const count = await redis.incr(key)

  if (count === 1) {
    await redis.expire(key, RATE_LIMIT_TTL_SECONDS)
  }

  return count <= env.rateLimitPerMinute
}
