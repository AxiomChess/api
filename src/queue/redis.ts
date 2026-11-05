import { createClient, type RedisClientType } from "redis"

import type { AnalysisJobHandler, AnalysisJobQueue } from "./types.js"

const QUEUE_KEY = "axiomchess:analysis:jobs"

type RedisQueueOptions = {
  url: string
  handler: AnalysisJobHandler
  /** Injected client for tests; skips connect when provided. */
  client?: RedisClientType
  pollIntervalMs?: number
}

/**
 * Redis list-backed queue. Used when REDIS_URL is set (PROJECT_SPEC optional Redis).
 */
export const createRedisAnalysisQueue = async (
  options: RedisQueueOptions,
): Promise<AnalysisJobQueue> => {
  const client =
    options.client ??
    (createClient({ url: options.url }) as RedisClientType)

  if (!options.client) {
    client.on("error", () => {
      // Caller must still listen; avoid unhandled error crash during reconnect.
    })
    await client.connect()
  }

  let closed = false
  let inFlight = 0
  const pollIntervalMs = options.pollIntervalMs ?? 50

  const poll = async (): Promise<void> => {
    while (!closed) {
      try {
        const id = await client.lPop(QUEUE_KEY)
        if (id === null) {
          await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
          continue
        }
        inFlight += 1
        try {
          await options.handler(id)
        } catch {
          // Worker records failure on the analysis row.
        } finally {
          inFlight -= 1
        }
      } catch {
        if (closed) return
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
      }
    }
  }

  void poll()

  return {
    backend: "redis",
    enqueue: async (analysisId: string): Promise<void> => {
      if (closed) {
        throw new Error("Analysis queue is closed")
      }
      await client.rPush(QUEUE_KEY, analysisId)
    },
    depth: (): number => inFlight,
    close: async (): Promise<void> => {
      closed = true
      if (!options.client) {
        await client.quit().catch(() => {
          client.destroy()
        })
      }
    },
  }
}
