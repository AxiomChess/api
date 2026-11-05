export type AuthKind = "anonymous" | "api_key"

export type AuthContext = {
  kind: AuthKind
  /** Stable subject for rate-limit partitions: `ip:<addr>` or `key:<id>`. */
  subjectId: string
  apiKeyId: string | null
  label: string | null
}

export type VerifiedApiKey = {
  id: string
  label: string
}

/**
 * Looks up a raw API key. Implementations MUST hash before storage lookup;
 * raw keys must never be persisted.
 */
export type ApiKeyVerifier = {
  verify: (rawKey: string) => Promise<VerifiedApiKey | null>
}

export type AuthVariables = {
  auth: AuthContext
}
