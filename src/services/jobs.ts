import type { StructuredLogger } from "../observability/logger.js"
import { rootLogger } from "../observability/logger.js"
import {
  METRIC_NAMES,
  rootMetrics,
  type MetricsRegistry,
} from "../observability/metrics.js"
import type { GameAnalyzer } from "./game-analyzer.js"
import type { AnalysisStore } from "../store/types.js"

export type AnalysisWorkerDeps = {
  store: AnalysisStore
  analyzer: GameAnalyzer
  logger?: StructuredLogger
  metrics?: MetricsRegistry
  queueDepth?: () => number
}

export const createAnalysisJobHandler = (
  deps: AnalysisWorkerDeps,
): ((analysisId: string) => Promise<void>) => {
  const logger = deps.logger ?? rootLogger
  const metrics = deps.metrics ?? rootMetrics

  return async (analysisId: string): Promise<void> => {
    const row = await deps.store.getById(analysisId)
    if (!row) return
    if (row.status !== "queued") return

    await deps.store.markRunning(analysisId)
    if (deps.queueDepth) {
      metrics.setGauge(METRIC_NAMES.queueDepth, deps.queueDepth())
    }

    const started = Date.now()
    logger.info("analysis_job_start", {
      analysisId,
      pgnContentHash: row.pgnContentHash,
      enginePolicyId: row.enginePolicyId,
    })

    try {
      const result = await deps.analyzer.analyzePgn(row.normalizedPgn)
      const durationMs = Date.now() - started
      metrics.observeDurationMs(METRIC_NAMES.engineJobDurationMs, durationMs)
      await deps.store.markCompleted(analysisId, result)
      logger.info("analysis_job_complete", {
        analysisId,
        pgnContentHash: row.pgnContentHash,
        durationMs,
        suspicionBand: result.suspicion.band,
      })
    } catch (error) {
      const durationMs = Date.now() - started
      metrics.observeDurationMs(METRIC_NAMES.engineJobDurationMs, durationMs)
      const message =
        error instanceof Error ? error.message : "Analyzer failed"
      await deps.store.markFailed(analysisId, "analyzer_error", message)
      logger.error("analysis_job_failed", {
        analysisId,
        pgnContentHash: row.pgnContentHash,
        durationMs,
        error: message,
      })
    } finally {
      if (deps.queueDepth) {
        metrics.setGauge(METRIC_NAMES.queueDepth, deps.queueDepth())
      }
    }
  }
}
