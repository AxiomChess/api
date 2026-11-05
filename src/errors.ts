export type ApiErrorBody = {
  code: string
  message: string
  details?: unknown
  requestId: string
}

export class ApiError extends Error {
  readonly code: string
  readonly status: number
  readonly details?: unknown

  constructor(input: {
    code: string
    message: string
    status: number
    details?: unknown
  }) {
    super(input.message)
    this.name = "ApiError"
    this.code = input.code
    this.status = input.status
    if ("details" in input) {
      this.details = input.details
    }
  }
}

export const toErrorBody = (
  error: ApiError,
  requestId: string,
): ApiErrorBody => {
  const body: ApiErrorBody = {
    code: error.code,
    message: error.message,
    requestId,
  }
  if (error.details !== undefined) {
    body.details = error.details
  }
  return body
}
