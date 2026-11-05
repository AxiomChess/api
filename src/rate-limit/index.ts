import { createClient, type RedisClientType } from "redis"

import { createMemoryRateLimiter } from "./memory.js"
import { createRedisRateLimiter } from "./redis.js"
import type { RateLimiter } from "./types.js"

export type CreateRateLimiterOptions = {
  redisUrl?: string | null
  /** Injected Redis client for tests. */
  redisClient?: RedisClientType
  now?: () => number
}

export type RateLimiterHandle = {
  limiter: RateLimiter
  backend: "memory" | "redis"
  close: () => Promise<void>
}

export const createRateLimiter = async (
  options: CreateRateLimiterOptions = {},
): Promise<RateLimiterHandle> => {
  if (options.redisClient) {
    return {
      limiter: createRedisRateLimiter({
        client: options.redisClient,
        ...(options.now ? { now: options.now } : {}),
      }),
      backend: "redis",
      close: async () => undefined,
    }
  }

  const redisUrl = options.redisUrl?.trim()
  if (redisUrl && redisUrl.length > 0) {
    const client = createClient({ url: redisUrl }) as RedisClientType
    client.on("error", () => {
      // Avoid unhandled error during reconnect; caller uses in-memory if connect fails.
    })
    try {
      await client.connect()
      return {
        limiter: createRedisRateLimiter({
          client,
          ...(options.now ? { now: options.now } : {}),
        }),
        backend: "redis",
        close: async () => {
          await client.quit().catch(() => {
            client.destroy()
          })
        },
      }
    } catch {
      await client.quit().catch(() => {
        client.destroy()
      })
    }
  }

  return {
    limiter: createMemoryRateLimiter(options.now),
    backend: "memory",
    close: async () => undefined,
  }
}

export type { RateLimiter, RateLimitDecision } from "./types.js"
export {
  applyRateLimitHeaders,
  applyRetryAfterHeader,
  RATE_LIMIT_LIMIT_HEADER,
  RATE_LIMIT_REMAINING_HEADER,
  RATE_LIMIT_RESET_HEADER,
  RETRY_AFTER_HEADER,
} from "./headers.js"
export { createMemoryRateLimiter } from "./memory.js"
