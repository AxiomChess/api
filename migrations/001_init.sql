-- T17: analyses, API key hashes, retention metadata
-- PostgreSQL 14+

CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  normalized_pgn TEXT NOT NULL,
  pgn_content_hash TEXT NOT NULL,
  engine_policy_id TEXT NOT NULL DEFAULT 'engine-v1',
  result_json JSONB,
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS analyses_expires_at_idx
  ON analyses (expires_at);

CREATE INDEX IF NOT EXISTS analyses_pgn_policy_idx
  ON analyses (pgn_content_hash, engine_policy_id);

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ
);
