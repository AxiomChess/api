# api

Public HTTP API for AxiomChess. Hono on Node.js with `@hono/node-server`.

## Stack

- Runtime: Node.js 20+ (CI uses 22)
- Framework: [Hono](https://hono.dev/docs/) (MIT) + [@hono/node-server](https://hono.dev/docs/getting-started/nodejs) (MIT)
- Package manager: pnpm

## Setup

```sh
pnpm install
cp .env.example .env
pnpm build
pnpm start
```

Config is read from the environment. See `.env.example` for placeholders. Never commit `.env` or real secrets.

## Scripts

| Script | Purpose |
| --- | --- |
| `pnpm lint` | ESLint + `tsc --noEmit` |
| `pnpm test` | Vitest |
| `pnpm build` | Compile TypeScript to `dist/` |
| `pnpm start` | Run compiled server (`node dist/index.js`) |

## Routes (v1 bootstrap)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/v1/health` | Liveness summary |

Further analyze and sites routes arrive in later roadmap tasks.

## License

MIT. See `LICENSE`.
