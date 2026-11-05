import type { AnalysisRecord, AnalysisStore } from "../store/types.js"

export const CACHE_HIT_HEADER = "X-Cache"
export const DEFAULT_ENGINE_POLICY_ID = "engine-v1"

export type CacheLookupResult =
  | { hit: true; record: AnalysisRecord }
  | { hit: false }

/**
 * Response cache by content hash of (normalized PGN + engine policy id).
 * Uses completed, non-expired analysis rows as the cache store.
 */
export const lookupCompletedAnalysisCache = async (
  store: AnalysisStore,
  input: {
    pgnContentHash: string
    enginePolicyId?: string
    now?: Date
  },
): Promise<CacheLookupResult> => {
  const enginePolicyId = input.enginePolicyId ?? DEFAULT_ENGINE_POLICY_ID
  const record = await store.findCompletedByHash(
    input.pgnContentHash,
    enginePolicyId,
    input.now,
  )
  if (!record) return { hit: false }
  return { hit: true, record }
}
