# Security review notes (T27)

Language: English only. No emoji.

Status: reviewed against `PROJECT_SPEC.md` section 12. This document records the
v1 controls; it does not invent extra guarantees.

## SSRF (URL ingest)

- Gate: `isAllowedSiteUrl` from `@axiomchess/adapters` before any upstream fetch.
- Allowlisted web hosts only: `lichess.org`, `www.lichess.org`, `chess.com`,
  `www.chess.com`.
- Rejected: non-http(s) schemes, URLs with credentials, loopback/private hosts,
  and any non-allowlisted hostname (including `api.chess.com` as a user-facing
  game URL host -- adapters call the Published-Data API internally).
- Contract coverage: `POST /v1/analyze/url` returns `ssrf_rejected` for
  non-allowlisted hosts (see `src/analyze.contract.test.ts`).

## Input and job limits

- PGN body size capped at `MAX_PGN_BYTES` (512_000) in the ingest service.
- Engine jobs run through the analysis queue with worker timeouts handled in the
  analyzer UCI runner (policy `engine-v1`).

## Secrets

- `.env` is gitignored; only `.env.example` with placeholders is committed.
- API keys are stored as SHA-256(pepper + raw) hashes; raw keys are never stored.
- CI runs `pnpm secrets:scan` (and the same script in sibling product repos) to
  fail on common staged secret patterns (private keys, GitHub/AWS/Slack token
  prefixes, tracked `.env` files that are not `.env.example`).

## TLS

- Production deployments must terminate TLS at the reverse proxy or platform
  edge. The Node process itself speaks HTTP on the configured bind address.
