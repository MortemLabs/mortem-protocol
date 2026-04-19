// Ingest environment parsing keeps runtime defaults centralized and typed. Values are read lazily
// from process.env so tests can construct servers with deterministic overrides.
const readInteger = (name: string, fallback: number): number => {
  const value = process.env[name]

  if (value === undefined) {
    return fallback
  }

  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

export const getIngestEnv = () => ({
  host: process.env.INGEST_HOST ?? "0.0.0.0",
  maxBodyBytes: readInteger("INGEST_MAX_BODY_BYTES", 10_485_760),
  port: readInteger("PORT", 4001),
  rateLimitPerMinute: readInteger("INGEST_RATELIMIT_PER_MIN", 10_000),
  redisToken: process.env.REDIS_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN,
  redisUrl: process.env.REDIS_URL ?? process.env.UPSTASH_REDIS_REST_URL,
})
