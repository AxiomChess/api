import { createInProcessAnalysisQueue } from "./in-process.js"
import { createRedisAnalysisQueue } from "./redis.js"
import type { AnalysisJobHandler, AnalysisJobQueue } from "./types.js"

export type { AnalysisJobHandler, AnalysisJobQueue } from "./types.js"
export { createInProcessAnalysisQueue } from "./in-process.js"
export { createRedisAnalysisQueue } from "./redis.js"

export type CreateAnalysisQueueOptions = {
  handler: AnalysisJobHandler
  redisUrl?: string | null | undefined
}

/**
 * Prefer Redis when REDIS_URL is set; otherwise in-process fallback.
 */
export const createAnalysisQueue = async (
  options: CreateAnalysisQueueOptions,
): Promise<AnalysisJobQueue> => {
  const redisUrl = options.redisUrl?.trim()
  if (redisUrl && redisUrl.length > 0) {
    return createRedisAnalysisQueue({
      url: redisUrl,
      handler: options.handler,
    })
  }
  return createInProcessAnalysisQueue(options.handler)
}
