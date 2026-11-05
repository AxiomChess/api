import { createHash } from "node:crypto"

import type { Pool, PoolClient } from "pg"

type Queryable = Pool | PoolClient

export type ApiKeyRow = {
  id: string
  key_hash: string
  label: string
  created_at: Date
  revoked_at: Date | null
  last_used_at: Date | null
}

export const hashApiKey = (rawKey: string, pepper: string): string => {
  if (rawKey.length === 0) {
    throw new Error("API key must not be empty")
  }
  if (pepper.length === 0) {
    throw new Error("API_KEY_PEPPER must not be empty")
  }

  return createHash("sha256").update(`${pepper}:${rawKey}`, "utf8").digest("hex")
}

export const insertApiKey = async (
  db: Queryable,
  input: { keyHash: string; label?: string },
): Promise<ApiKeyRow> => {
  const result = await db.query<ApiKeyRow>(
    `
      INSERT INTO api_keys (key_hash, label)
      VALUES ($1, $2)
      RETURNING *
    `,
    [input.keyHash, input.label ?? ""],
  )

  const row = result.rows[0]
  if (!row) {
    throw new Error("insertApiKey returned no row")
  }
  return row
}

export const getApiKeyByHash = async (
  db: Queryable,
  keyHash: string,
): Promise<ApiKeyRow | null> => {
  const result = await db.query<ApiKeyRow>(
    "SELECT * FROM api_keys WHERE key_hash = $1",
    [keyHash],
  )
  return result.rows[0] ?? null
}

export const revokeApiKeyById = async (
  db: Queryable,
  id: string,
  revokedAt: Date = new Date(),
): Promise<boolean> => {
  const result = await db.query(
    `
      UPDATE api_keys
      SET revoked_at = $2
      WHERE id = $1 AND revoked_at IS NULL
    `,
    [id, revokedAt.toISOString()],
  )
  return (result.rowCount ?? 0) > 0
}

export const deleteApiKeyById = async (
  db: Queryable,
  id: string,
): Promise<boolean> => {
  const result = await db.query("DELETE FROM api_keys WHERE id = $1", [id])
  return (result.rowCount ?? 0) > 0
}
