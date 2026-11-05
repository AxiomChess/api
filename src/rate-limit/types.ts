export type RateLimitDecision = {
  allowed: boolean
  limit: number
  remaining: number
  /** Unix epoch seconds when the binding window resets. */
  resetAtUnix: number
  /** Seconds until reset (for Retry-After). */
  retryAfterSeconds: number
  window: "burst" | "daily"
}

export type RateLimiter = {
  /**
   * Consume `cost` units against burst + daily windows for `subjectId`.
   * Returns the tightest binding decision (denied window, or remaining).
   */
  consume: (
    subjectId: string,
    cost: number,
    limits: {
      burstLimit: number
      burstWindowMs: number
      dailyLimit: number
      dailyWindowMs: number
    },
  ) => Promise<RateLimitDecision>
}
