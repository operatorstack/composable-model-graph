import { createEvaluator, type Evaluator } from "@composable-model-graph/core";

import type { ConstraintEvaluatorOptions } from "./types.js";

/**
 * Adapt findings to CMG evaluation only through the caller's interpretation.
 * The package supplies no default status or policy mapping.
 */
export function createConstraintEvaluator<O, T = unknown, F = unknown>(
  options: ConstraintEvaluatorOptions<O, T, F>,
): Evaluator<O, T> {
  return createEvaluator<O, T>({
    id: options.id ?? "constraints",
    name: options.name ?? "Constraints",
    evaluate: async (output, target, context) => {
      const report = await options.constraints.check(output, {
        runId: context.runId,
        metadata: context.metadata,
      });
      return options.interpret(report, output, target, context);
    },
  });
}
