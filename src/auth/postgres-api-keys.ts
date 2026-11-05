import type { Pool } from "pg"

import {
  getApiKeyByHash,
  hashApiKey,
  type ApiKeyRow,
} from "../db/api-keys.js"
import type { ApiKeyVerifier, VerifiedApiKey } from "./types.js"

export const createPostgresApiKeyVerifier = (
  pool: Pool,
  pepper: string,
): ApiKeyVerifier => {
  return {
    verify: async (rawKey: string): Promise<VerifiedApiKey | null> => {
      const keyHash = hashApiKey(rawKey, pepper)
      const row: ApiKeyRow | null = await getApiKeyByHash(pool, keyHash)
      if (!row) return null
      if (row.revoked_at !== null) return null
      return { id: row.id, label: row.label }
    },
  }
}
