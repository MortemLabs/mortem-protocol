// Redis access is wrapped behind the small command surface the ingest service needs. In tests or
// local shells without Upstash credentials, an in-memory fallback keeps route behavior executable.
import { Redis } from "@upstash/redis"
import { getIngestEnv } from "./env.js"

export interface RedisLike {
  expire(key: string, seconds: number): Promise<unknown>
  get<T>(key: string): Promise<T | null>
  incr(key: string): Promise<number>
  lpush(key: string, ...values: string[]): Promise<unknown>
  lrange<T>(key: string, start: number, stop: number): Promise<T[]>
  lrem(key: string, count: number, value: string): Promise<unknown>
  ltrim(key: string, start: number, stop: number): Promise<unknown>
  publish(channel: string, message: string): Promise<unknown>
  set(key: string, value: string, options?: { ex?: number | undefined }): Promise<unknown>
}

class MemoryRedis implements RedisLike {
  private readonly values = new Map<string, string>()
  private readonly lists = new Map<string, string[]>()

  async expire(_key: string, _seconds: number): Promise<unknown> {
    return 1
  }

  async get<T>(key: string): Promise<T | null> {
    return (this.values.get(key) as T | undefined) ?? null
  }

  async incr(key: string): Promise<number> {
    const next = Number.parseInt(this.values.get(key) ?? "0", 10) + 1
    this.values.set(key, String(next))
    return next
  }

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

  async ltrim(key: string, start: number, stop: number): Promise<unknown> {
    const list = this.lists.get(key) ?? []
    const normalizedStop = stop < 0 ? list.length : stop + 1
    this.lists.set(key, list.slice(start, normalizedStop))
    return "OK"
  }

  async publish(_channel: string, _message: string): Promise<unknown> {
    return 0
  }

  async set(key: string, value: string, _options?: { ex?: number | undefined }): Promise<unknown> {
    this.values.set(key, value)
    return "OK"
  }
}

let redisSingleton: RedisLike | undefined

export const getRedis = (): RedisLike => {
  if (redisSingleton !== undefined) {
    return redisSingleton
  }

  const env = getIngestEnv()

  if (env.redisUrl !== undefined && env.redisToken !== undefined) {
    console.info("[ingest-redis] using configured Redis credentials")
    redisSingleton = new Redis({
      token: env.redisToken,
      url: env.redisUrl,
    }) as RedisLike
    return redisSingleton
  }

  console.warn("[ingest-redis] using in-memory Redis; cross-process queues will not work")
  redisSingleton = new MemoryRedis()
  return redisSingleton
}
