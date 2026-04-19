// The enrichment worker exposes the Helius webhook receiver. It enriches matching trace events and
// notifies subscribers when transaction context is ready.
import { createHmac, timingSafeEqual } from "node:crypto"
import prisma, { type Prisma } from "@mortemlabs/db"
import { Redis } from "@upstash/redis"
import Fastify from "fastify"
import { z } from "zod"

interface RedisLike {
  publish(channel: string, message: string): Promise<unknown>
}

const readInteger = (name: string, fallback: number): number => {
  const value = process.env[name]

  if (value === undefined) {
    return fallback
  }

  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

const WebhookPayloadSchema = z.array(
  z.object({
    signature: z.string(),
  }),
)

const getRedis = (): RedisLike | undefined => {
  const url = process.env.REDIS_URL ?? process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.REDIS_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN

  if (url === undefined || token === undefined) {
    return undefined
  }

  return new Redis({ token, url }) as RedisLike
}

const signatureHeader = (
  headers: Record<string, string | string[] | undefined>,
): string | undefined => {
  const value =
    headers["x-helius-signature"] ?? headers["x-webhook-signature"] ?? headers["helius-signature"]

  return Array.isArray(value) ? value[0] : value
}

const secureEqual = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)

  return (
    leftBuffer.byteLength === rightBuffer.byteLength && timingSafeEqual(leftBuffer, rightBuffer)
  )
}

const validHmac = (body: Buffer, signature: string | undefined): boolean => {
  const secret = process.env.HELIUS_WEBHOOK_SECRET

  if (secret === undefined || signature === undefined) {
    return false
  }

  const hex = createHmac("sha256", secret).update(body).digest("hex")
  const base64 = createHmac("sha256", secret).update(body).digest("base64")
  return secureEqual(signature, hex) || secureEqual(signature, base64)
}

const fetchHeliusEnrichment = async (
  signature: string,
): Promise<Prisma.InputJsonValue | undefined> => {
  const apiKey = process.env.HELIUS_API_KEY

  if (apiKey === undefined) {
    return undefined
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5_000)

  try {
    const response = await fetch(`https://api.helius.xyz/v0/transactions/?api-key=${apiKey}`, {
      body: JSON.stringify({ transactions: [signature] }),
      headers: { "content-type": "application/json" },
      method: "POST",
      signal: controller.signal,
    })

    if (!response.ok) {
      return undefined
    }

    const parsed = (await response.json()) as unknown
    return parsed === null ? undefined : (parsed as Prisma.InputJsonValue)
  } catch {
    return undefined
  } finally {
    clearTimeout(timeout)
  }
}

const mergePayload = (
  payload: Prisma.JsonValue,
  enrichment: Prisma.InputJsonValue,
): Prisma.InputJsonValue => {
  if (payload !== null && typeof payload === "object" && !Array.isArray(payload)) {
    return {
      ...payload,
      enrichment,
    } as Prisma.InputJsonObject
  }

  return { enrichment }
}

const server = Fastify({
  bodyLimit: readInteger("INGEST_MAX_BODY_BYTES", 10_485_760),
  logger: true,
})

server.removeContentTypeParser("application/json")
server.addContentTypeParser("application/json", { parseAs: "buffer" }, (_request, body, done) => {
  done(null, body)
})

server.post("/webhook/helius", async (request, reply) => {
  const body = Buffer.isBuffer(request.body) ? request.body : Buffer.from("")

  if (!validHmac(body, signatureHeader(request.headers))) {
    return reply.code(401).send({ error: "Invalid webhook signature" })
  }

  const parsed = WebhookPayloadSchema.safeParse(JSON.parse(body.toString("utf8")) as unknown)

  if (!parsed.success) {
    return reply.code(400).send({ error: "Invalid webhook payload" })
  }

  const redis = getRedis()
  let updated = 0

  for (const transaction of parsed.data) {
    const enrichment = await fetchHeliusEnrichment(transaction.signature)

    if (enrichment === undefined) {
      continue
    }

    const events = await prisma.traceEvent.findMany({
      select: { id: true, payload: true, traceId: true },
      where: {
        payload: {
          path: ["signature"],
          equals: transaction.signature,
        },
      },
    })

    for (const event of events) {
      await prisma.traceEvent.update({
        data: {
          payload: mergePayload(event.payload, enrichment),
        },
        where: { id: event.id },
      })
      updated += 1
      await redis?.publish(
        `enrichment:ready:${event.traceId}`,
        JSON.stringify({ traceId: event.traceId }),
      )
    }
  }

  return reply.send({ updated })
})

const main = async (): Promise<void> => {
  try {
    await server.listen({
      host: process.env.ENRICHMENT_HOST ?? "0.0.0.0",
      port: readInteger("ENRICHMENT_PORT", 4002),
    })
  } catch (error) {
    server.log.error(error)
    process.exitCode = 1
  }
}

void main()
