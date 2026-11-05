# Analysis retention and deletion

Language: English only. No emoji.

## Default TTL

Raw PGN inputs and stored analysis results expire after **30 days** unless the operator configures a longer (or shorter) window.

| Setting | Env var | Default |
| --- | --- | --- |
| Analysis retention | `ANALYSIS_RETENTION_DAYS` | `30` |

`expires_at` is set at insert time as `created_at + ANALYSIS_RETENTION_DAYS` (UTC day arithmetic).

## Purge

Operators run expiry cleanup with the library helper `purgeExpiredAnalyses` (deletes rows where `expires_at < now()`). A scheduled job can call this on a cadence; v1 does not require a separate daemon.

## Deletion by id

Erasure of a stored analysis is a hard delete:

- Library: `deleteAnalysisById(db, id)`
- HTTP DELETE route arrives in a later roadmap task; until then operators may call the library or SQL `DELETE FROM analyses WHERE id = $1`

API key rows store only `key_hash` (SHA-256 with `API_KEY_PEPPER`). Keys may be revoked (`revoked_at`) or hard-deleted via `deleteApiKeyById`.

## Privacy notes

- Store only what is needed for analysis replay and operator tooling.
- Do not log full PGN bodies at info level (hash only); see project security rules.
- No sale of personal data.
