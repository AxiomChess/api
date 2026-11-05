import type { Context } from "hono"

import type { RateLimitDecision } from "./types.js"

/** De-facto headers documented by IETF draft-ietf-httpapi-ratelimit-headers. */
export const RATE_LIMIT_LIMIT_HEADER = "X-RateLimit-Limit"
export const RATE_LIMIT_REMAINING_HEADER = "X-RateLimit-Remaining"
export const RATE_LIMIT_RESET_HEADER = "X-RateLimit-Reset"
export const RETRY_AFTER_HEADER = "Retry-After"

export const applyRateLimitHeaders = (
  c: Context,
  decision: RateLimitDecision,
): void => {
  c.header(RATE_LIMIT_LIMIT_HEADER, String(decision.limit))
  c.header(RATE_LIMIT_REMAINING_HEADER, String(decision.remaining))
  c.header(RATE_LIMIT_RESET_HEADER, String(decision.resetAtUnix))
}

export const applyRetryAfterHeader = (
  c: Context,
  decision: RateLimitDecision,
): void => {
  c.header(RETRY_AFTER_HEADER, String(decision.retryAfterSeconds))
}
