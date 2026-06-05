import { createFeedbackResolver } from "@composable-model-graph/core";
import type { FeedbackResolver } from "@composable-model-graph/core";

/** Options for {@link defaultFeedbackResolver}. */
export interface DefaultFeedbackResolverOptions {
  id?: string;
  name?: string;
}

/**
 * Map an evaluation status to a feedback action:
 *
 *   pass    -> accept
 *   partial -> adjust
 *   fail    -> retry
 *   unknown -> custom (inspect)
 *
 * A run with no evaluation is treated as `unknown`.
 */
export function defaultFeedbackResolver<I = unknown, O = unknown>(
  options: DefaultFeedbackResolverOptions = {},
): FeedbackResolver<I, O> {
  return createFeedbackResolver<I, O>({
    id: options.id ?? "default-feedback",
    name: options.name ?? "Default Feedback",
    resolve: (run) => {
      const status = run.evaluation?.status ?? "unknown";
      switch (status) {
        case "pass":
          return { kind: "accept", reason: "evaluation passed" };
        case "partial":
          return { kind: "adjust", reason: "evaluation partial" };
        case "fail":
          return { kind: "retry", reason: "evaluation failed" };
        default:
          return {
            kind: "custom",
            reason: "inspect",
            signal: { action: "inspect" },
          };
      }
    },
  });
}
