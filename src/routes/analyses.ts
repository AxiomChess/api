import { Hono } from "hono"

import { ApiError, toErrorBody } from "../errors.js"
import type { RequestIdVariables } from "../http/request-id.js"
import type { AnalysisRecord, AnalysisStore } from "../store/types.js"

const toPublicAnalysis = (row: AnalysisRecord) => {
  return {
    id: row.id,
    status: row.status,
    enginePolicyId: row.enginePolicyId,
    result: row.result,
    error:
      row.errorCode === null
        ? null
        : {
            code: row.errorCode,
            message: row.errorMessage ?? "",
          },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt.toISOString(),
  }
}

export const createAnalysesRoutes = (store: AnalysisStore): Hono<{
  Variables: RequestIdVariables
}> => {
  const app = new Hono<{ Variables: RequestIdVariables }>()

  app.get("/v1/analyses/:id", async (c) => {
    const requestId = c.get("requestId")
    const id = c.req.param("id")

    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        id,
      )
    ) {
      const error = new ApiError({
        code: "validation_error",
        message: "Analysis id must be a UUID",
        status: 400,
      })
      return c.json(toErrorBody(error, requestId), 400)
    }

    const row = await store.getById(id)
    if (!row) {
      const error = new ApiError({
        code: "not_found",
        message: "Analysis not found",
        status: 404,
      })
      return c.json(toErrorBody(error, requestId), 404)
    }

    return c.json(toPublicAnalysis(row))
  })

  return app
}
