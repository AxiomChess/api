import {
  buildAnalysisResultV1,
  ENGINE_V1_POLICY,
  extractFeatures,
  type AnalysisResultV1,
} from "@axiomchess/analyzer"

/**
 * Analyzer job boundary. Contract tests inject a mock; production uses the
 * library scorer until a full MultiPV PGN game loop is attached.
 */
export type GameAnalyzer = {
  analyzePgn: (normalizedPgn: string) => Promise<AnalysisResultV1>
}

/**
 * Uses @axiomchess/analyzer scoring on an empty move list (inconclusive /
 * wide uncertainty). Records that engine move eval is not yet applied.
 * shortcut: full UCI-per-ply game loop, when PGN ply extraction lands in analyzer
 */
export const createLibraryGameAnalyzer = (): GameAnalyzer => {
  return {
    analyzePgn: async (_normalizedPgn: string): Promise<AnalysisResultV1> => {
      const features = extractFeatures([])
      const result = buildAnalysisResultV1({
        features,
        depth: ENGINE_V1_POLICY.depthStandard,
      })
      return {
        ...result,
        sampleSizeCaveats: [
          ...result.sampleSizeCaveats,
          "Engine MultiPV ply evaluation is not attached in this API worker build; score reflects empty usable-ply features only.",
        ],
      }
    },
  }
}

export const createMockGameAnalyzer = (
  result: AnalysisResultV1,
): GameAnalyzer => {
  return {
    analyzePgn: async (_normalizedPgn: string): Promise<AnalysisResultV1> => {
      return result
    },
  }
}
