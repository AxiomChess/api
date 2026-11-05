import type { AnalysisResultV1 } from "@axiomchess/analyzer"

export type AnalysisStatus = "queued" | "running" | "completed" | "failed"

export type AnalysisRecord = {
  id: string
  status: AnalysisStatus
  normalizedPgn: string
  pgnContentHash: string
  enginePolicyId: string
  result: AnalysisResultV1 | null
  errorCode: string | null
  errorMessage: string | null
  createdAt: Date
  updatedAt: Date
  completedAt: Date | null
  expiresAt: Date
}

export type CreateAnalysisInput = {
  normalizedPgn: string
  pgnContentHash: string
  enginePolicyId?: string
  expiresAt: Date
  status?: AnalysisStatus
}

export type AnalysisStore = {
  create: (input: CreateAnalysisInput) => Promise<AnalysisRecord>
  getById: (id: string) => Promise<AnalysisRecord | null>
  markRunning: (id: string) => Promise<AnalysisRecord | null>
  markCompleted: (
    id: string,
    result: AnalysisResultV1,
  ) => Promise<AnalysisRecord | null>
  markFailed: (
    id: string,
    errorCode: string,
    errorMessage: string,
  ) => Promise<AnalysisRecord | null>
}
