export const DEFAULT_ANALYSIS_RETENTION_DAYS = 30

export const parseRetentionDays = (raw: string | undefined): number => {
  if (raw === undefined || raw.trim().length === 0) {
    return DEFAULT_ANALYSIS_RETENTION_DAYS
  }

  const days = Number(raw)
  if (!Number.isInteger(days) || days < 1) {
    throw new Error(`Invalid ANALYSIS_RETENTION_DAYS: ${raw}`)
  }

  return days
}

export const computeExpiresAt = (
  createdAt: Date,
  retentionDays: number,
): Date => {
  if (!Number.isInteger(retentionDays) || retentionDays < 1) {
    throw new Error(`Invalid retentionDays: ${retentionDays}`)
  }

  const expires = new Date(createdAt.getTime())
  expires.setUTCDate(expires.getUTCDate() + retentionDays)
  return expires
}
