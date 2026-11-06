import { randomUUID } from "node:crypto"

import type { AnalysisResultV1 } from "@axiomchess/analyzer"

import type {
  AnalysisRecord,
  AnalysisStore,
  CreateAnalysisInput,
} from "./types.js"

export const createMemoryAnalysisStore = (): AnalysisStore => {
  const rows = new Map<string, AnalysisRecord>()

  const create = async (
    input: CreateAnalysisInput,
  ): Promise<AnalysisRecord> => {
    const now = new Date()
    const record: AnalysisRecord = {
      id: randomUUID(),
      status: input.status ?? "queued",
      normalizedPgn: input.normalizedPgn,
      pgnContentHash: input.pgnContentHash,
      enginePolicyId: input.enginePolicyId ?? "engine-v1",
      result: null,
      errorCode: null,
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      expiresAt: input.expiresAt,
    }
    rows.set(record.id, record)
    return record
  }

  const getById = async (id: string): Promise<AnalysisRecord | null> => {
    return rows.get(id) ?? null
  }

  const findCompletedByHash = async (
    pgnContentHash: string,
    enginePolicyId: string,
    now: Date = new Date(),
  ): Promise<AnalysisRecord | null> => {
    let best: AnalysisRecord | null = null
    for (const row of rows.values()) {
      if (row.status !== "completed") continue
      if (row.pgnContentHash !== pgnContentHash) continue
      if (row.enginePolicyId !== enginePolicyId) continue
      if (row.expiresAt.getTime() <= now.getTime()) continue
      if (row.result === null) continue
      if (
        best === null ||
        (row.completedAt?.getTime() ?? 0) > (best.completedAt?.getTime() ?? 0)
      ) {
        best = row
      }
    }
    return best
  }

  const markRunning = async (id: string): Promise<AnalysisRecord | null> => {
    const current = rows.get(id)
    if (!current) return null
    const next: AnalysisRecord = {
      ...current,
      status: "running",
      updatedAt: new Date(),
    }
    rows.set(id, next)
    return next
  }

  const markCompleted = async (
    id: string,
    result: AnalysisResultV1,
  ): Promise<AnalysisRecord | null> => {
    const current = rows.get(id)
    if (!current) return null
    const now = new Date()
    const next: AnalysisRecord = {
      ...current,
      status: "completed",
      result,
      errorCode: null,
      errorMessage: null,
      updatedAt: now,
      completedAt: now,
    }
    rows.set(id, next)
    return next
  }

  const markFailed = async (
    id: string,
    errorCode: string,
    errorMessage: string,
  ): Promise<AnalysisRecord | null> => {
    const current = rows.get(id)
    if (!current) return null
    const now = new Date()
    const next: AnalysisRecord = {
      ...current,
      status: "failed",
      result: null,
      errorCode,
      errorMessage,
      updatedAt: now,
      completedAt: now,
    }
    rows.set(id, next)
    return next
  }

  const deleteById = async (id: string): Promise<boolean> => {
    return rows.delete(id)
  }

  return {
    create,
    getById,
    findCompletedByHash,
    markRunning,
    markCompleted,
    markFailed,
    deleteById,
  }
}
