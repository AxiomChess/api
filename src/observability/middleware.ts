import type { MiddlewareHandler } from "hono"

import type { RequestIdVariables } from "../http/request-id.js"
import type { StructuredLogger } from "./logger.js"
import { rootLogger } from "./logger.js"
import {
  METRIC_NAMES,
  rootMetrics,
  type MetricsRegistry,
} from "./metrics.js"

export type ObservabilityVariables = RequestIdVariables

export type RequestLogMiddlewareOptions = {
  readonly logger?: StructuredLogger
  readonly metrics?: MetricsRegistry
  readonly queueDepth?: () => number
}

/**
 * Structured request log + http_requests_total. Never logs bodies or PGN.
 */
export const requestLogMiddleware = (
  options: RequestLogMiddlewareOptions = {},
): MiddlewareHandler<{ Variables: ObservabilityVariables }> => {
  const logger = options.logger ?? rootLogger
  const metrics = options.metrics ?? rootMetrics

  return async (c, next) => {
    const started = Date.now()
    const requestId = c.get("requestId")
    metrics.increment(METRIC_NAMES.httpRequestsTotal)
    if (options.queueDepth) {
      metrics.setGauge(METRIC_NAMES.queueDepth, options.queueDepth())
    }

    try {
      await next()
    } finally {
      const status = c.res.status
      logger.info("http_request", {
        requestId,
        method: c.req.method,
        path: c.req.path,
        status,
        durationMs: Date.now() - started,
      })
      if (options.queueDepth) {
        metrics.setGauge(METRIC_NAMES.queueDepth, options.queueDepth())
      }
    }
  }
}
