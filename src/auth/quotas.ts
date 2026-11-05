/**
 * Ops quotas from PROJECT_SPEC.md Auth and quotas section.
 * Anonymous starting point: 10 analyses / day / IP, burst 2 / minute.
 * API keys: higher documented defaults below.
 */

export type QuotaWindow = {
  limit: number
  windowMs: number
}

export type QuotaPolicy = {
  id: "anonymous" | "api_key"
  daily: QuotaWindow
  burst: QuotaWindow
}

export const MS_PER_MINUTE = 60_000
export const MS_PER_DAY = 86_400_000

export const ANONYMOUS_QUOTA: QuotaPolicy = {
  id: "anonymous",
  daily: { limit: 10, windowMs: MS_PER_DAY },
  burst: { limit: 2, windowMs: MS_PER_MINUTE },
}

export const API_KEY_QUOTA: QuotaPolicy = {
  id: "api_key",
  daily: { limit: 200, windowMs: MS_PER_DAY },
  burst: { limit: 20, windowMs: MS_PER_MINUTE },
}

export const quotaForAuthKind = (
  kind: "anonymous" | "api_key",
): QuotaPolicy => {
  return kind === "api_key" ? API_KEY_QUOTA : ANONYMOUS_QUOTA
}
