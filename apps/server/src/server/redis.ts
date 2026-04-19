// Server Redis access is limited to queue and pub/sub operations needed by routers and workers.
// It falls back to memory when credentials are absent so local route tests can still execute.
import { Redis } from "@upstash/redis"

export interface RedisLike {
  lpush(key: string, ...values: string[]): Promise<unknown>
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

  async publish(_channel: string, _message: string): Promise<unknown> {
    return 0
  }
}

let redisSingleton: RedisLike | undefined

export const getRedis = (): RedisLike => {
  if (redisSingleton !== undefined) {
    return redisSingleton
  }

  const url = process.env.REDIS_URL ?? process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.REDIS_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN

  if (url !== undefined && token !== undefined) {
    redisSingleton = new Redis({ token, url }) as RedisLike
    return redisSingleton
  }

  redisSingleton = new MemoryRedis()
  return redisSingleton
}
