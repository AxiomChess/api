import type { RedisClientType } from "redis"

import type { RateLimitDecision, RateLimiter } from "./types.js"

const floorWindow = (nowMs: number, windowMs: number): number => {
  return Math.floor(nowMs / windowMs) * windowMs
}

const redisKey = (
  subjectId: string,
  window: "burst" | "daily",
  windowStartMs: number,
): string => {
  return `axiomchess:rl:${window}:${subjectId}:${windowStartMs}`
}

type RedisRateLimiterOptions = {
  client: RedisClientType
  now?: () => number
}

export const createRedisRateLimiter = (
  options: RedisRateLimiterOptions,
): RateLimiter => {
  const now = options.now ?? Date.now

  const readCount = async (key: string): Promise<number> => {
    const raw = await options.client.get(key)
    if (raw === null) return 0
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : 0
  }

  const addCost = async (
    key: string,
    cost: number,
    windowMs: number,
  ): Promise<number> => {
    const count = await options.client.incrBy(key, cost)
    if (count === cost) {
      await options.client.pExpire(key, windowMs + 1000)
    }
    return count
  }

  return {
    consume: async (subjectId, cost, limits) => {
      const nowMs = now()
      const burstStart = floorWindow(nowMs, limits.burstWindowMs)
      const dailyStart = floorWindow(nowMs, limits.dailyWindowMs)
      const burstKey = redisKey(subjectId, "burst", burstStart)
      const dailyKey = redisKey(subjectId, "daily", dailyStart)

      const burstCount = await readCount(burstKey)
      const dailyCount = await readCount(dailyKey)

      const toDecision = (
        count: number,
        limit: number,
        windowStartMs: number,
        windowMs: number,
        window: "burst" | "daily",
        allowed: boolean,
      ): RateLimitDecision => {
        const resetAtUnix = Math.floor((windowStartMs + windowMs) / 1000)
        const remaining = Math.max(0, limit - count)
        const retryAfterSeconds = Math.max(
          1,
          resetAtUnix - Math.floor(nowMs / 1000),
        )
        return {
          allowed,
          limit,
          remaining,
          resetAtUnix,
          retryAfterSeconds,
          window,
        }
      }

      if (burstCount + cost > limits.burstLimit) {
        return toDecision(
          burstCount,
          limits.burstLimit,
          burstStart,
          limits.burstWindowMs,
          "burst",
          false,
        )
      }
      if (dailyCount + cost > limits.dailyLimit) {
        return toDecision(
          dailyCount,
          limits.dailyLimit,
          dailyStart,
          limits.dailyWindowMs,
          "daily",
          false,
        )
      }

      const nextBurst = await addCost(burstKey, cost, limits.burstWindowMs)
      const nextDaily = await addCost(dailyKey, cost, limits.dailyWindowMs)

      const burstDecision = toDecision(
        nextBurst,
        limits.burstLimit,
        burstStart,
        limits.burstWindowMs,
        "burst",
        true,
      )
      const dailyDecision = toDecision(
        nextDaily,
        limits.dailyLimit,
        dailyStart,
        limits.dailyWindowMs,
        "daily",
        true,
      )

      if (
        burstDecision.remaining / burstDecision.limit <=
        dailyDecision.remaining / dailyDecision.limit
      ) {
        return burstDecision
      }
      return dailyDecision
    },
  }
}
