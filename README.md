# api

Public HTTP API for AxiomChess. Hono on Node.js with `@hono/node-server`.

## Stack

- Runtime: Node.js 20+ (CI uses 22)
- Framework: [Hono](https://hono.dev/docs/) (MIT) + [@hono/node-server](https://hono.dev/docs/getting-started/nodejs) (MIT)
- Database: PostgreSQL via [pg](https://node-postgres.com/) (MIT)
- Queue: in-process FIFO by default; optional Redis via [redis](https://github.com/redis/node-redis) (MIT) when `REDIS_URL` is set
- Ingest: `@axiomchess/adapters` (path/git sibling)
- Scoring: `@axiomchess/analyzer` (path/git sibling)
- Package manager: pnpm

## Setup

Sibling checkouts of `adapters` and `analyzer` are required (`file:../adapters`, `file:../analyzer`).

```sh
pnpm install
cp .env.example .env
# create DB, then:
pnpm build
pnpm migrate
pnpm start
```

Config is read from the environment. See `.env.example` for placeholders. Never commit `.env` or real secrets.

Retention defaults to 30 days (`ANALYSIS_RETENTION_DAYS`). See `docs/retention.md`.

Auth quotas, rate-limit headers, API key hash-at-rest, and PGN+policy response cache: see `docs/quotas.md`.

OpenAPI document: `GET /v1/openapi.json` (source `openapi/openapi-v1.json`).

## Scripts

| Script | Purpose |
| --- | --- |
| `pnpm lint` | ESLint + `tsc --noEmit` |
| `pnpm test` | Vitest (set `DATABASE_URL` for integration tests) |
| `pnpm build` | Compile TypeScript to `dist/` |
| `pnpm migrate` | Apply SQL migrations under `migrations/` |
| `pnpm start` | Run compiled server (`node dist/index.js`) |

## Routes (v1)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/v1/health` | Liveness summary |
| POST | `/v1/analyze/url` | Analyze by public game URL (SSRF allowlist) |
| POST | `/v1/analyze/pgn` | Analyze by PGN body |
| POST | `/v1/analyze/username` | List recent public games; optional analyze queue |
| GET | `/v1/analyses/{id}` | Get analysis job/result |
| GET | `/v1/openapi.json` | OpenAPI 3.1 document |
| GET | `/v1/sites` | Supported sites and capabilities (adapters manifest) |

URL ingest rejects non-allowlisted hosts. Adapter tests and API contract tests use fixtures / mocks; no live Chess.com/Lichess calls in CI.

## License

MIT. See `LICENSE`. Third-party: `NOTICE`.
