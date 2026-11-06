export type CounterSnapshot = {
  readonly name: string
  readonly value: number
}

export type GaugeSnapshot = {
  readonly name: string
  readonly value: number
}

export type DurationSnapshot = {
  readonly name: string
  readonly count: number
  readonly sumMs: number
  readonly lastMs: number | null
}

export type MetricsSnapshot = {
  readonly counters: readonly CounterSnapshot[]
  readonly gauges: readonly GaugeSnapshot[]
  readonly durations: readonly DurationSnapshot[]
  readonly derived: {
    readonly cacheHitRatio: number | null
    readonly requestRatePerMinute: number
  }
}

type DurationState = {
  count: number
  sumMs: number
  lastMs: number | null
}

/**
 * In-process metrics for v1. OpenTelemetry export is optional later;
 * names stay stable so scrapers can map them.
 */
export type MetricsRegistry = {
  increment: (name: string, by?: number) => void
  setGauge: (name: string, value: number) => void
  observeDurationMs: (name: string, durationMs: number) => void
  snapshot: () => MetricsSnapshot
  reset: () => void
}

export const METRIC_NAMES = {
  httpRequestsTotal: "http_requests_total",
  queueDepth: "queue_depth",
  engineJobDurationMs: "engine_job_duration_ms",
  cacheHitsTotal: "cache_hits_total",
  cacheMissesTotal: "cache_misses_total",
  upstream429Total: "upstream_429_total",
} as const

export const createMetricsRegistry = (): MetricsRegistry => {
  const counters = new Map<string, number>()
  const gauges = new Map<string, number>()
  const durations = new Map<string, DurationState>()
  const requestTimestamps: number[] = []

  const increment = (name: string, by = 1): void => {
    counters.set(name, (counters.get(name) ?? 0) + by)
    if (name === METRIC_NAMES.httpRequestsTotal) {
      const now = Date.now()
      requestTimestamps.push(now)
      const cutoff = now - 60_000
      while (
        requestTimestamps.length > 0 &&
        (requestTimestamps[0] ?? 0) < cutoff
      ) {
        requestTimestamps.shift()
      }
    }
  }

  const setGauge = (name: string, value: number): void => {
    gauges.set(name, value)
  }

  const observeDurationMs = (name: string, durationMs: number): void => {
    const safe = Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : 0
    const current = durations.get(name) ?? {
      count: 0,
      sumMs: 0,
      lastMs: null,
    }
    durations.set(name, {
      count: current.count + 1,
      sumMs: current.sumMs + safe,
      lastMs: safe,
    })
  }

  const snapshot = (): MetricsSnapshot => {
    const hits = counters.get(METRIC_NAMES.cacheHitsTotal) ?? 0
    const misses = counters.get(METRIC_NAMES.cacheMissesTotal) ?? 0
    const cacheTotal = hits + misses
    return {
      counters: [...counters.entries()].map(([name, value]) => ({
        name,
        value,
      })),
      gauges: [...gauges.entries()].map(([name, value]) => ({ name, value })),
      durations: [...durations.entries()].map(([name, state]) => ({
        name,
        count: state.count,
        sumMs: state.sumMs,
        lastMs: state.lastMs,
      })),
      derived: {
        cacheHitRatio: cacheTotal === 0 ? null : hits / cacheTotal,
        requestRatePerMinute: requestTimestamps.length,
      },
    }
  }

  const reset = (): void => {
    counters.clear()
    gauges.clear()
    durations.clear()
    requestTimestamps.length = 0
  }

  return {
    increment,
    setGauge,
    observeDurationMs,
    snapshot,
    reset,
  }
}

export const rootMetrics = createMetricsRegistry()
