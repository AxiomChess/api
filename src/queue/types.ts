export type AnalysisJobHandler = (analysisId: string) => Promise<void>

export type AnalysisJobQueue = {
  readonly backend: "in-process" | "redis"
  enqueue: (analysisId: string) => Promise<void>
  depth: () => number
  close: () => Promise<void>
}
