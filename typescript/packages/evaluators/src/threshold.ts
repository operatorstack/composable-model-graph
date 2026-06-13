import { createEvaluator } from "@composable-model-graph/core";
import type { Evaluator } from "@composable-model-graph/core";

/** Options for {@link thresholdEvaluator}. */
export interface ThresholdEvaluatorOptions {
  id?: string;
  name?: string;
  /** The threshold the output is compared against. */
  threshold: number;
  /**
   * Pass condition relative to the threshold.
   * - `"atLeast"` (default): pass when `output >= threshold`.
   * - `"atMost"`: pass when `output <= threshold`.
   */
  direction?: "atLeast" | "atMost";
}

/**
 * Pass / fail an output by comparing it to a numeric threshold.
 */
export function thresholdEvaluator(
  options: ThresholdEvaluatorOptions,
): Evaluator<number> {
  const direction = options.direction ?? "atLeast";
  const { threshold } = options;

  return createEvaluator<number>({
    id: options.id ?? "threshold",
    name: options.name ?? "Threshold",
    evaluate: (output) => {
      const passed =
        direction === "atLeast" ? output >= threshold : output <= threshold;
      return {
        status: passed ? "pass" : "fail",
        score: passed ? 1 : 0,
        messages: [
          `value ${output} ${passed ? "meets" : "misses"} threshold ${threshold} (${direction})`,
        ],
        evidence: [
          { label: "value", value: output, source: "threshold" },
          { label: "threshold", value: threshold, source: "threshold" },
        ],
      };
    },
  });
}
