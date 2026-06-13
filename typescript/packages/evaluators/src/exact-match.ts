import { createEvaluator } from "@composable-model-graph/core";
import type { Evaluator } from "@composable-model-graph/core";

import { deepEqual } from "./deep-equal.js";

/** Options for {@link exactMatchEvaluator}. */
export interface ExactMatchEvaluatorOptions {
  id?: string;
  name?: string;
}

/**
 * Pass when the output structurally equals the target, otherwise fail.
 */
export function exactMatchEvaluator<O>(
  options: ExactMatchEvaluatorOptions = {},
): Evaluator<O, O> {
  return createEvaluator<O, O>({
    id: options.id ?? "exact-match",
    name: options.name ?? "Exact Match",
    evaluate: (output, target) => {
      const matched = deepEqual(output, target);
      return {
        status: matched ? "pass" : "fail",
        score: matched ? 1 : 0,
        messages: [matched ? "output matches target" : "output differs from target"],
        evidence: [
          { label: "output", value: output, source: "exact-match" },
          { label: "target", value: target, source: "exact-match" },
        ],
      };
    },
  });
}
