// Server Redis access is limited to queue and pub/sub operations needed by routers and workers.
// It falls back to memory when credentials are absent so local route tests can still execute.
import { Redis } from "@upstash/redis"

export interface RedisLike {
  lrange<T>(key: string, start: number, stop: number): Promise<T[]>
  lpush(key: string, ...values: string[]): Promise<unknown>
  lrem(key: string, count: number, value: string): Promise<unknown>
  publish(channel: string, message: string): Promise<unknown>
}

class MemoryRedis implements RedisLike {
  private readonly lists = new Map<string, string[]>()

  async lpush(key: string, ...values: string[]): Promise<unknown> {
    const list = this.lists.get(key) ?? []
    list.unshift(...values)
    this.lists.set(key, list)
    return list.length
  }

  async lrange<T>(key: string, start: number, stop: number): Promise<T[]> {
    const list = this.lists.get(key) ?? []
    const normalizedStop = stop < 0 ? list.length : stop + 1
    return list.slice(start, normalizedStop) as T[]
  }

  async lrem(key: string, count: number, value: string): Promise<unknown> {
    const list = this.lists.get(key) ?? []
    const next: string[] = []
    let removed = 0

    for (const item of list) {
      if ((count === 0 || removed < Math.abs(count)) && item === value) {
        removed += 1
        continue
      }

      next.push(item)
    }

    this.lists.set(key, next)
    return removed
  }

  async publish(_channel: string, _message: string): Promise<unknown> {
    return 0
  }
}

let redisSingleton: RedisLike | undefined

const readEnv = (name: string): string | undefined => {
  const value = process.env[name]
  return value === undefined || value.length === 0 ? undefined : value
}

const isPlaceholderRedisUrl = (url: string): boolean => url.includes("example-upstash.upstash.io")

const resolveRedisConfig = ():
  | { token: string; url: string; source: "REDIS" | "UPSTASH_REDIS_REST" }
  | undefined => {
  const redisUrl = readEnv("REDIS_URL")
  const redisToken = readEnv("REDIS_TOKEN")

  if (redisUrl !== undefined && redisToken !== undefined && !isPlaceholderRedisUrl(redisUrl)) {
    return { source: "REDIS", token: redisToken, url: redisUrl }
  }

  const upstashUrl = readEnv("UPSTASH_REDIS_REST_URL")
  const upstashToken = readEnv("UPSTASH_REDIS_REST_TOKEN")

  if (
    upstashUrl !== undefined &&
    upstashToken !== undefined &&
    !isPlaceholderRedisUrl(upstashUrl)
  ) {
    return { source: "UPSTASH_REDIS_REST", token: upstashToken, url: upstashUrl }
  }

  return undefined
}

export const getRedis = (): RedisLike => {
  if (redisSingleton !== undefined) {
    return redisSingleton
  }

  const config = resolveRedisConfig()

  if (config !== undefined) {
    console.info(`[server-redis] using ${config.source} credentials`)
    redisSingleton = new Redis({ token: config.token, url: config.url }) as RedisLike
    return redisSingleton
  }

  console.warn("[server-redis] using in-memory Redis; cross-process queues will not work")
  redisSingleton = new MemoryRedis()
  return redisSingleton
}
