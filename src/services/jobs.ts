import type { GameAnalyzer } from "./game-analyzer.js"
import type { AnalysisStore } from "../store/types.js"

export type AnalysisWorkerDeps = {
  store: AnalysisStore
  analyzer: GameAnalyzer
}

export const createAnalysisJobHandler = (
  deps: AnalysisWorkerDeps,
): ((analysisId: string) => Promise<void>) => {
  return async (analysisId: string): Promise<void> => {
    const row = await deps.store.getById(analysisId)
    if (!row) return
    if (row.status !== "queued") return

    await deps.store.markRunning(analysisId)

    try {
      const result = await deps.analyzer.analyzePgn(row.normalizedPgn)
      await deps.store.markCompleted(analysisId, result)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Analyzer failed"
      await deps.store.markFailed(analysisId, "analyzer_error", message)
    }
  }
}
