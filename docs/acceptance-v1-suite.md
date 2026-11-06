# AxiomChess API acceptance suite v1

Language: English only. No emoji.

Generated: 2026-11-06 (T28)
Live network: none. Contract tests use fixture adapters and mocked analyzer; no live Chess.com/Lichess calls.

## Package checks

| Check | Status | Measured |
| --- | --- | --- |
| lint (eslint + tsc --noEmit) | PASS | 0 warnings |
| test (vitest) | PASS | 34/34 passed + 4 skipped (no local DATABASE_URL for Postgres integration) |
| build (tsc) | PASS | 0 warnings |

## Fixture / contract coverage

- Analyze by URL/PGN/username + GET analysis (fixture adapters)
- SSRF allowlist rejection on non-allowlisted hosts
- Auth quotas, rate-limit headers, cache HIT/MISS by PGN+policy hash
- Sites manifest via GET /v1/sites
- Retention deletion path covered in memory tests

## Notes

Canonical analyzer gates A1-A5: see `analyzer/docs/acceptance-v1-suite.md`.
Thresholds were not modified in this task.
Postgres 16 integration tests were not re-run in this session (4 skips).
