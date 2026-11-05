# api

Public HTTP API for AxiomChess. Hono on Node.js with `@hono/node-server`.

## Stack

- Runtime: Node.js 20+ (CI uses 22)
- Framework: [Hono](https://hono.dev/docs/) (MIT) + [@hono/node-server](https://hono.dev/docs/getting-started/nodejs) (MIT)
- Database: PostgreSQL via [pg](https://node-postgres.com/) (MIT)
- Package manager: pnpm

## Setup

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

## Scripts

| Script | Purpose |
| --- | --- |
| `pnpm lint` | ESLint + `tsc --noEmit` |
| `pnpm test` | Vitest (set `DATABASE_URL` for integration tests) |
| `pnpm build` | Compile TypeScript to `dist/` |
| `pnpm migrate` | Apply SQL migrations under `migrations/` |
| `pnpm start` | Run compiled server (`node dist/index.js`) |

## Routes (v1 bootstrap)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/v1/health` | Liveness summary |

Further analyze and sites routes arrive in later roadmap tasks.

## License

MIT. See `LICENSE`. Third-party: `NOTICE`.
