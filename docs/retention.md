# Analysis retention and deletion

Language: English only. No emoji.

## Default TTL

Raw PGN inputs and stored analysis results expire after **30 days** unless the
operator configures a longer (or shorter) window.

| Setting | Env var | Default |
| --- | --- | --- |
| Analysis retention | `ANALYSIS_RETENTION_DAYS` | `30` |

`expires_at` is set at insert time as `created_at + ANALYSIS_RETENTION_DAYS`
(UTC day arithmetic).

## Retention enforcement

- Cache lookups (`findCompletedByHash`) skip rows with `expires_at <= now`.
- `GET /v1/analyses/{id}` returns `404 not_found` when the row is missing or
  expired (expired rows are treated as erased for read access).
- Operators should run `purgeExpiredAnalyses` on a cadence to hard-delete expired
  rows from Postgres. v1 does not require a separate daemon.

## Deletion by id (erasure)

Hard delete of a stored analysis:

| Path | Behavior |
| --- | --- |
| `DELETE /v1/analyses/{id}` | Removes the row; `204` on success; `404` if unknown |
| Library | `deleteAnalysisById(db, id)` / store `deleteById(id)` |
| SQL | `DELETE FROM analyses WHERE id = $1` |

Expired rows may still be deleted via `DELETE` if they have not yet been purged.

API key rows store only `key_hash` (SHA-256 with `API_KEY_PEPPER`). Keys may be
revoked (`revoked_at`) or hard-deleted via `deleteApiKeyById`.

## Privacy notes

- Store only what is needed for analysis replay and operator tooling.
- Do not log full PGN bodies at info level (hash only); see `docs/observability.md`
  and `docs/security.md`.
- No sale of personal data. Public privacy notice: web `/privacy` and docs
  `privacy.html`.
