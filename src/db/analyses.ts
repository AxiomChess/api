import type { Pool, PoolClient } from "pg"

type Queryable = Pool | PoolClient

export type AnalysisStatus = "queued" | "running" | "completed" | "failed"

export type AnalysisRow = {
  id: string
  status: AnalysisStatus
  normalized_pgn: string
  pgn_content_hash: string
  engine_policy_id: string
  result_json: unknown
  error_code: string | null
  error_message: string | null
  created_at: Date
  updated_at: Date
  completed_at: Date | null
  expires_at: Date
}

export type InsertAnalysisInput = {
  status?: AnalysisStatus
  normalizedPgn: string
  pgnContentHash: string
  enginePolicyId?: string
  resultJson?: unknown
  errorCode?: string | null
  errorMessage?: string | null
  expiresAt: Date
}

export const insertAnalysis = async (
  db: Queryable,
  input: InsertAnalysisInput,
): Promise<AnalysisRow> => {
  const result = await db.query<AnalysisRow>(
    `
      INSERT INTO analyses (
        status,
        normalized_pgn,
        pgn_content_hash,
        engine_policy_id,
        result_json,
        error_code,
        error_message,
        expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `,
    [
      input.status ?? "queued",
      input.normalizedPgn,
      input.pgnContentHash,
      input.enginePolicyId ?? "engine-v1",
      input.resultJson === undefined ? null : input.resultJson,
      input.errorCode ?? null,
      input.errorMessage ?? null,
      input.expiresAt.toISOString(),
    ],
  )

  const row = result.rows[0]
  if (!row) {
    throw new Error("insertAnalysis returned no row")
  }
  return row
}

export const getAnalysisById = async (
  db: Queryable,
  id: string,
): Promise<AnalysisRow | null> => {
  const result = await db.query<AnalysisRow>(
    "SELECT * FROM analyses WHERE id = $1",
    [id],
  )
  return result.rows[0] ?? null
}

export const findCompletedAnalysisByHash = async (
  db: Queryable,
  input: {
    pgnContentHash: string
    enginePolicyId: string
    now?: Date
  },
): Promise<AnalysisRow | null> => {
  const now = input.now ?? new Date()
  const result = await db.query<AnalysisRow>(
    `
      SELECT *
      FROM analyses
      WHERE pgn_content_hash = $1
        AND engine_policy_id = $2
        AND status = 'completed'
        AND result_json IS NOT NULL
        AND expires_at > $3
      ORDER BY completed_at DESC NULLS LAST
      LIMIT 1
    `,
    [input.pgnContentHash, input.enginePolicyId, now.toISOString()],
  )
  return result.rows[0] ?? null
}

export const updateAnalysisRunning = async (
  db: Queryable,
  id: string,
): Promise<AnalysisRow | null> => {
  const result = await db.query<AnalysisRow>(
    `
      UPDATE analyses
      SET status = 'running',
          updated_at = now()
      WHERE id = $1
      RETURNING *
    `,
    [id],
  )
  return result.rows[0] ?? null
}

export const updateAnalysisCompleted = async (
  db: Queryable,
  id: string,
  resultJson: unknown,
): Promise<AnalysisRow | null> => {
  const result = await db.query<AnalysisRow>(
    `
      UPDATE analyses
      SET status = 'completed',
          result_json = $2,
          error_code = NULL,
          error_message = NULL,
          completed_at = now(),
          updated_at = now()
      WHERE id = $1
      RETURNING *
    `,
    [id, resultJson],
  )
  return result.rows[0] ?? null
}

export const updateAnalysisFailed = async (
  db: Queryable,
  id: string,
  errorCode: string,
  errorMessage: string,
): Promise<AnalysisRow | null> => {
  const result = await db.query<AnalysisRow>(
    `
      UPDATE analyses
      SET status = 'failed',
          result_json = NULL,
          error_code = $2,
          error_message = $3,
          completed_at = now(),
          updated_at = now()
      WHERE id = $1
      RETURNING *
    `,
    [id, errorCode, errorMessage],
  )
  return result.rows[0] ?? null
}

export const deleteAnalysisById = async (
  db: Queryable,
  id: string,
): Promise<boolean> => {
  const result = await db.query("DELETE FROM analyses WHERE id = $1", [id])
  return (result.rowCount ?? 0) > 0
}

export const purgeExpiredAnalyses = async (
  db: Queryable,
  now: Date = new Date(),
): Promise<number> => {
  const result = await db.query(
    "DELETE FROM analyses WHERE expires_at < $1",
    [now.toISOString()],
  )
  return result.rowCount ?? 0
}
