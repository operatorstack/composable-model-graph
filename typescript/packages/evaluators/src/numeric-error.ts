import { createEvaluator } from "@composable-model-graph/core";
import type { Evaluator } from "@composable-model-graph/core";

/** Options for {@link numericErrorEvaluator}. */
export interface NumericErrorEvaluatorOptions {
  id?: string;
  name?: string;
  /** Error magnitude at or below which the result is a `pass`. */
  passThreshold: number;
  /**
   * Optional error magnitude at or below which the result is `partial`.
   * Must be greater than `passThreshold`. When omitted, anything above
   * `passThreshold` is a `fail`.
   */
  partialThreshold?: number;
}

/**
 * Evaluate a numeric error value.
 *
 * The evaluated output IS the error value. The score is monotonically
 * decreasing in the error magnitude:
 *
 *   score = 1 / (1 + |error|)
 */
export function numericErrorEvaluator(
  options: NumericErrorEvaluatorOptions,
): Evaluator<number> {
  const { passThreshold, partialThreshold } = options;

  return createEvaluator<number>({
    id: options.id ?? "numeric-error",
    name: options.name ?? "Numeric Error",
    evaluate: (output) => {
      const error = Math.abs(output);
      const score = 1 / (1 + error);

      let status: "pass" | "partial" | "fail";
      if (error <= passThreshold) {
        status = "pass";
      } else if (partialThreshold !== undefined && error <= partialThreshold) {
        status = "partial";
      } else {
        status = "fail";
      }

      return {
        status,
        score,
        error,
        messages: [`error ${error} -> ${status} (score ${score.toFixed(4)})`],
        evidence: [{ label: "error", value: error, source: "numeric-error" }],
      };
    },
  });
}
