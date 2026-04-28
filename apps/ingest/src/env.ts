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

const readEnv = (name: string): string | undefined => {
  const value = process.env[name]
  return value === undefined || value.length === 0 ? undefined : value
}

const isPlaceholderRedisUrl = (url: string): boolean => url.includes("example-upstash.upstash.io")

const resolveRedisConfig = (): { token?: string | undefined; url?: string | undefined } => {
  const redisUrl = readEnv("REDIS_URL")
  const redisToken = readEnv("REDIS_TOKEN")

  if (redisUrl !== undefined && redisToken !== undefined && !isPlaceholderRedisUrl(redisUrl)) {
    return { token: redisToken, url: redisUrl }
  }

  const upstashUrl = readEnv("UPSTASH_REDIS_REST_URL")
  const upstashToken = readEnv("UPSTASH_REDIS_REST_TOKEN")

  if (
    upstashUrl !== undefined &&
    upstashToken !== undefined &&
    !isPlaceholderRedisUrl(upstashUrl)
  ) {
    return { token: upstashToken, url: upstashUrl }
  }

  return {}
}

export const getIngestEnv = () => {
  const redis = resolveRedisConfig()

  return {
    host: process.env.INGEST_HOST ?? "0.0.0.0",
    maxBodyBytes: readInteger("INGEST_MAX_BODY_BYTES", 10_485_760),
    port: readInteger("PORT", 4001),
    rateLimitPerMinute: readInteger("INGEST_RATELIMIT_PER_MIN", 10_000),
    redisToken: redis.token,
    redisUrl: redis.url,
  }
}
