# API observability (v1)

Language: English only. No emoji.

Structured JSON logs and in-process metrics for `@axiomchess/api`. OpenTelemetry export is optional later; metric names below stay stable.

## Structured logs

Each log line is one JSON object on stdout:

| Field | Meaning |
| --- | --- |
| `ts` | ISO-8601 timestamp |
| `level` | `debug` / `info` / `warn` / `error` |
| `service` | `axiomchess-api` |
| `message` | Event name (e.g. `http_request`, `analysis_enqueued`) |
| `requestId` | Present on HTTP-path events; echoed from `X-Request-Id` |
| `pgnContentHash` | SHA-256 of normalized PGN when a game is involved |

Hard rule: default `info` logs never include full PGN bodies. Use `pgnContentHash` only. Debug may still omit PGN keys named `pgn` / `normalizedPgn` / `pgnBody` / `rawPgn`.

## Metrics

| Name | Type | Meaning |
| --- | --- | --- |
| `http_requests_total` | counter | Completed HTTP requests (middleware) |
| `queue_depth` | gauge | Pending + in-flight analysis jobs (`queue.depth()`) |
| `engine_job_duration_ms` | duration | Wall time of one analysis worker job (`analyzePgn`) |
| `cache_hits_total` | counter | Completed-analysis cache hits |
| `cache_misses_total` | counter | Cache misses that enqueue a job |
| `upstream_429_total` | counter | Site-adapter `rate_limited` errors |

Derived snapshot fields:

- `cacheHitRatio` = hits / (hits + misses), or null when unused
- `requestRatePerMinute` = `http_requests_total` events in the last 60 seconds

Read via `rootMetrics.snapshot()` in-process (no scrape endpoint in v1).

## Queue depth and engine duration

- **Queue depth**: updated on enqueue, after each job, and on each HTTP request when a queue is attached. For in-process queues this is pending + active. For Redis, depth reflects in-flight workers (list length is not polled every tick in v1).
- **Engine job duration**: measured in the API worker around `analyzer.analyzePgn`. Per-position UCI search duration is recorded separately in `@axiomchess/analyzer` as `engine_search_duration_ms`.
