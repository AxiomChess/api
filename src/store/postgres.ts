import type { AnalysisResultV1 } from "@axiomchess/analyzer"
import type { Pool } from "pg"

import {
  deleteAnalysisById,
  findCompletedAnalysisByHash,
  getAnalysisById,
  insertAnalysis,
  type AnalysisRow,
  updateAnalysisCompleted,
  updateAnalysisFailed,
  updateAnalysisRunning,
} from "../db/analyses.js"
import type {
  AnalysisRecord,
  AnalysisStore,
  CreateAnalysisInput,
} from "./types.js"

const toRecord = (row: AnalysisRow): AnalysisRecord => {
  return {
    id: row.id,
    status: row.status,
    normalizedPgn: row.normalized_pgn,
    pgnContentHash: row.pgn_content_hash,
    enginePolicyId: row.engine_policy_id,
    result: (row.result_json as AnalysisResultV1 | null) ?? null,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    expiresAt: row.expires_at,
  }
}

export const createPostgresAnalysisStore = (pool: Pool): AnalysisStore => {
  return {
    create: async (input: CreateAnalysisInput): Promise<AnalysisRecord> => {
      const row = await insertAnalysis(pool, {
        status: input.status ?? "queued",
        normalizedPgn: input.normalizedPgn,
        pgnContentHash: input.pgnContentHash,
        ...(input.enginePolicyId !== undefined
          ? { enginePolicyId: input.enginePolicyId }
          : {}),
        expiresAt: input.expiresAt,
      })
      return toRecord(row)
    },
    getById: async (id: string): Promise<AnalysisRecord | null> => {
      const row = await getAnalysisById(pool, id)
      return row ? toRecord(row) : null
    },
    findCompletedByHash: async (
      pgnContentHash: string,
      enginePolicyId: string,
      now?: Date,
    ): Promise<AnalysisRecord | null> => {
      const row = await findCompletedAnalysisByHash(pool, {
        pgnContentHash,
        enginePolicyId,
        ...(now !== undefined ? { now } : {}),
      })
      return row ? toRecord(row) : null
    },
    markRunning: async (id: string): Promise<AnalysisRecord | null> => {
      const row = await updateAnalysisRunning(pool, id)
      return row ? toRecord(row) : null
    },
    markCompleted: async (
      id: string,
      result: AnalysisResultV1,
    ): Promise<AnalysisRecord | null> => {
      const row = await updateAnalysisCompleted(pool, id, result)
      return row ? toRecord(row) : null
    },
    markFailed: async (
      id: string,
      errorCode: string,
      errorMessage: string,
    ): Promise<AnalysisRecord | null> => {
      const row = await updateAnalysisFailed(pool, id, errorCode, errorMessage)
      return row ? toRecord(row) : null
    },
    deleteById: async (id: string): Promise<boolean> => {
      return deleteAnalysisById(pool, id)
    },
  }
}
