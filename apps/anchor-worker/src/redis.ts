// Redis access is wrapped for the anchor queue commands the worker needs. A memory fallback keeps
// tests and local dry runs deterministic when Upstash credentials are not present.
import { Redis } from "@upstash/redis"
import { getAnchorWorkerEnv } from "./env.js"

export interface RedisLike {
  lrange<T>(key: string, start: number, stop: number): Promise<T[]>
  lrem(key: string, count: number, value: string): Promise<unknown>
}

class MemoryRedis implements RedisLike {
  private readonly lists = new Map<string, string[]>()

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
}

let redisSingleton: RedisLike | undefined

export const getRedis = (): RedisLike => {
  if (redisSingleton !== undefined) {
    return redisSingleton
  }

  const env = getAnchorWorkerEnv()

  if (env.redisUrl !== undefined && env.redisToken !== undefined) {
    redisSingleton = new Redis({
      token: env.redisToken,
      url: env.redisUrl,
    }) as RedisLike
    return redisSingleton
  }

  redisSingleton = new MemoryRedis()
  return redisSingleton
}
