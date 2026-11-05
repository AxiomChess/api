import type { RateLimitDecision, RateLimiter } from "./types.js"

type Counter = {
  count: number
  windowStartMs: number
}

const windowKey = (
  subjectId: string,
  window: "burst" | "daily",
  windowStartMs: number,
): string => {
  return `${subjectId}:${window}:${windowStartMs}`
}

const floorWindow = (nowMs: number, windowMs: number): number => {
  return Math.floor(nowMs / windowMs) * windowMs
}

export const createMemoryRateLimiter = (
  now: () => number = Date.now,
): RateLimiter => {
  const counters = new Map<string, Counter>()

  const read = (
    subjectId: string,
    window: "burst" | "daily",
    windowMs: number,
    nowMs: number,
  ): Counter => {
    const start = floorWindow(nowMs, windowMs)
    const key = windowKey(subjectId, window, start)
    const existing = counters.get(key)
    if (existing) return existing
    const created: Counter = { count: 0, windowStartMs: start }
    counters.set(key, created)
    return created
  }

  const decisionFor = (
    counter: Counter,
    limit: number,
    windowMs: number,
    window: "burst" | "daily",
    allowed: boolean,
  ): RateLimitDecision => {
    const resetAtUnix = Math.floor((counter.windowStartMs + windowMs) / 1000)
    const remaining = Math.max(0, limit - counter.count)
    const retryAfterSeconds = Math.max(1, resetAtUnix - Math.floor(now() / 1000))
    return {
      allowed,
      limit,
      remaining,
      resetAtUnix,
      retryAfterSeconds,
      window,
    }
  }

  return {
    consume: async (subjectId, cost, limits) => {
      const nowMs = now()
      const burst = read(subjectId, "burst", limits.burstWindowMs, nowMs)
      const daily = read(subjectId, "daily", limits.dailyWindowMs, nowMs)

      if (burst.count + cost > limits.burstLimit) {
        return decisionFor(
          burst,
          limits.burstLimit,
          limits.burstWindowMs,
          "burst",
          false,
        )
      }
      if (daily.count + cost > limits.dailyLimit) {
        return decisionFor(
          daily,
          limits.dailyLimit,
          limits.dailyWindowMs,
          "daily",
          false,
        )
      }

      burst.count += cost
      daily.count += cost

      const burstDecision = decisionFor(
        burst,
        limits.burstLimit,
        limits.burstWindowMs,
        "burst",
        true,
      )
      const dailyDecision = decisionFor(
        daily,
        limits.dailyLimit,
        limits.dailyWindowMs,
        "daily",
        true,
      )

      // Expose the tighter remaining ratio as the primary header binding.
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
