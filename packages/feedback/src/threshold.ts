import { createFeedbackResolver } from "@composable-model-graph/core";
import type { FeedbackResolver } from "@composable-model-graph/core";

/** Options for {@link thresholdFeedbackResolver}. */
export interface ThresholdFeedbackResolverOptions {
  id?: string;
  name?: string;
  /** Score at or above which the run is accepted. */
  acceptScore: number;
  /**
   * Optional score below which the run should be retried. Scores between
   * `retryScore` and `acceptScore` map to `adjust`. When omitted, anything
   * below `acceptScore` maps to `adjust`.
   */
  retryScore?: number;
}

/**
 * Decide a feedback action from the evaluation score.
 *
 *   score >= acceptScore                 -> accept
 *   retryScore set and score < retryScore -> retry
 *   otherwise (score present)             -> adjust
 *   score absent                          -> custom (inspect)
 */
export function thresholdFeedbackResolver<I = unknown, O = unknown>(
  options: ThresholdFeedbackResolverOptions,
): FeedbackResolver<I, O> {
  const { acceptScore, retryScore } = options;

  return createFeedbackResolver<I, O>({
    id: options.id ?? "threshold-feedback",
    name: options.name ?? "Threshold Feedback",
    resolve: (run) => {
      const score = run.evaluation?.score;
      if (score === undefined) {
        return {
          kind: "custom",
          reason: "no score to threshold",
          signal: { action: "inspect" },
        };
      }
      if (score >= acceptScore) {
        return { kind: "accept", reason: `score ${score} >= ${acceptScore}` };
      }
      if (retryScore !== undefined && score < retryScore) {
        return { kind: "retry", reason: `score ${score} < ${retryScore}` };
      }
      return { kind: "adjust", reason: `score ${score} < ${acceptScore}` };
    },
  });
}
