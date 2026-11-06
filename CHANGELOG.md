# Changelog

All notable changes to `@axiomchess/api` are documented in this file.

## [1.0.0] - 2026-11-06

### Added

- Public HTTP API on Hono + `@hono/node-server` with `GET /v1/health`
- Analyze by URL, PGN, and username; `GET`/`DELETE /v1/analyses/{id}`; `GET /v1/sites`; OpenAPI document
- Postgres models, configurable retention (default 30 days), and analysis erasure
- Anonymous and API-key quotas with rate-limit headers; PGN+policy response cache
- SSRF host allowlist for URL ingest; structured JSON logs and in-process metrics
- CI secret-pattern scan; acceptance suite report for v1 fixtures

### Notes

- First-party code: MIT. Path dependencies on sibling `@axiomchess/adapters` and `@axiomchess/analyzer`.
- No live Chess.com/Lichess calls in CI; contract tests use fixtures and mocks.
