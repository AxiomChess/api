import { createHash } from "node:crypto"

export const hashNormalizedPgn = (normalizedPgn: string): string => {
  return createHash("sha256").update(normalizedPgn, "utf8").digest("hex")
}
