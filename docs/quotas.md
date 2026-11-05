# Auth quotas, rate limits, and analysis cache

Language: English only. No emoji.

Values follow `PROJECT_SPEC.md` Auth and quotas / Rate limits and caching.

## Quotas (v1 defaults)

| Subject | Daily analyses | Burst |
| --- | --- | --- |
| Anonymous (per client IP) | 10 / day | 2 / minute |
| API key | 200 / day | 20 / minute |

Quota cost: each analysis create **or** completed-cache hit on `POST /v1/analyze/*` consumes 1 unit. Username listing without `analyze: true` does not consume analysis quota.

## API keys

- Send `Authorization: Bearer <key>` or `X-API-Key: <key>`.
- Keys are hashed at rest with SHA-256 over `pepper:rawKey` (`API_KEY_PEPPER`). Raw keys are never stored.
- Invalid or revoked keys return `401` with `code: invalid_api_key`.
- Public self-serve key minting is out of scope for v1; operators insert hashes via DB helpers.

## Rate-limit headers

When an analyze route consumes quota, responses include:

| Header | Meaning |
| --- | --- |
| `X-RateLimit-Limit` | Binding window limit |
| `X-RateLimit-Remaining` | Remaining units in that window |
| `X-RateLimit-Reset` | Unix epoch seconds when the window resets |
| `Retry-After` | Present on `429`; seconds to wait |

`429` body uses stable error shape with `code: rate_limited`.

Limiter backend: Redis when `REDIS_URL` is set and reachable; otherwise in-memory (single node).

## Response cache

Identical completed analyses are reused by content hash of normalized PGN + engine policy id (`engine-v1`).

- Lookup uses non-expired `analyses` rows (`status=completed`).
- Cache hit: HTTP `200`, header `X-Cache: HIT`, body includes existing `id` + `result`.
- Cache miss: HTTP `202`, header `X-Cache: MISS`, new job enqueued.
