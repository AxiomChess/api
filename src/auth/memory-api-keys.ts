import { randomUUID } from "node:crypto"

import { hashApiKey } from "../db/api-keys.js"
import type { ApiKeyVerifier, VerifiedApiKey } from "./types.js"

type MemoryKeyRow = {
  id: string
  keyHash: string
  label: string
  revokedAt: Date | null
}

export type MemoryApiKeyStore = ApiKeyVerifier & {
  /** Returns the raw key once (mint). Only the hash is retained. */
  mint: (input?: { label?: string; rawKey?: string }) => {
    id: string
    rawKey: string
    keyHash: string
  }
  revoke: (id: string) => boolean
  /** Test helper: returns stored hashes only (never raw keys). */
  storedHashes: () => string[]
}

export const createMemoryApiKeyStore = (pepper: string): MemoryApiKeyStore => {
  const rows = new Map<string, MemoryKeyRow>()

  const mint = (input: { label?: string; rawKey?: string } = {}) => {
    const rawKey = input.rawKey ?? `axc_test_${randomUUID().replace(/-/gu, "")}`
    const keyHash = hashApiKey(rawKey, pepper)
    const id = randomUUID()
    rows.set(id, {
      id,
      keyHash,
      label: input.label ?? "",
      revokedAt: null,
    })
    return { id, rawKey, keyHash }
  }

  const verify = async (rawKey: string): Promise<VerifiedApiKey | null> => {
    const keyHash = hashApiKey(rawKey, pepper)
    for (const row of rows.values()) {
      if (row.keyHash !== keyHash) continue
      if (row.revokedAt !== null) return null
      return { id: row.id, label: row.label }
    }
    return null
  }

  const revoke = (id: string): boolean => {
    const row = rows.get(id)
    if (!row || row.revokedAt !== null) return false
    row.revokedAt = new Date()
    return true
  }

  const storedHashes = (): string[] => {
    return [...rows.values()].map((row) => row.keyHash)
  }

  return { mint, verify, revoke, storedHashes }
}
