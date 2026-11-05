import type { AnalysisJobHandler, AnalysisJobQueue } from "./types.js"

/**
 * Single-node in-process FIFO queue. Always available; used when Redis is unset.
 */
export const createInProcessAnalysisQueue = (
  handler: AnalysisJobHandler,
): AnalysisJobQueue => {
  const pending: string[] = []
  let active = false
  let closed = false

  const pump = (): void => {
    if (closed || active) return
    const next = pending.shift()
    if (next === undefined) return

    active = true
    void handler(next)
      .catch(() => {
        // Worker records failure on the analysis row; keep queue alive.
      })
      .finally(() => {
        active = false
        pump()
      })
  }

  return {
    backend: "in-process",
    enqueue: async (analysisId: string): Promise<void> => {
      if (closed) {
        throw new Error("Analysis queue is closed")
      }
      pending.push(analysisId)
      pump()
    },
    depth: (): number => pending.length + (active ? 1 : 0),
    close: async (): Promise<void> => {
      closed = true
      pending.length = 0
    },
  }
}
