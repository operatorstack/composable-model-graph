import { createEvaluator } from "@composable-model-graph/core";
import type {
  EvaluationResult,
  EvaluationStatus,
  Evaluator,
  Evidence,
} from "@composable-model-graph/core";

/** Options for {@link compositeEvaluator}. */
export interface CompositeEvaluatorOptions<O, T> {
  id?: string;
  name?: string;
  /** Sub-evaluators run against the same output/target/context. */
  evaluators: ReadonlyArray<Evaluator<O, T>>;
}

// Lower index = "worse". The combined status is the worst observed status.
const STATUS_SEVERITY: Record<EvaluationStatus, number> = {
  fail: 0,
  partial: 1,
  unknown: 2,
  pass: 3,
};

function combineStatuses(statuses: EvaluationStatus[]): EvaluationStatus {
  if (statuses.length === 0) {
    return "unknown";
  }
  return statuses.reduce((worst, current) =>
    STATUS_SEVERITY[current] < STATUS_SEVERITY[worst] ? current : worst,
  );
}

/**
 * Combine several evaluators into one.
 *
 * - status: the worst status across all sub-results (`fail` < `partial` <
 *   `unknown` < `pass`).
 * - score: the mean of all defined sub-scores.
 * - error: the maximum of all defined sub-errors.
 * - messages / evidence: concatenated from every sub-result.
 */
export function compositeEvaluator<O, T = unknown>(
  options: CompositeEvaluatorOptions<O, T>,
): Evaluator<O, T> {
  return createEvaluator<O, T>({
    id: options.id ?? "composite",
    name: options.name ?? "Composite",
    evaluate: async (output, target, context) => {
      const results = await Promise.all(
        options.evaluators.map((evaluator) =>
          evaluator.evaluate(output, target, context),
        ),
      );

      const statuses = results.map((result) => result.status);
      const scores = results
        .map((result) => result.score)
        .filter((score): score is number => typeof score === "number");
      const errors = results
        .map((result) => result.error)
        .filter((error): error is number => typeof error === "number");

      const messages = results.flatMap((result) => result.messages ?? []);
      const evidence: Evidence[] = results.flatMap(
        (result) => result.evidence ?? [],
      );

      const combined: EvaluationResult = {
        status: combineStatuses(statuses),
      };
      if (scores.length > 0) {
        combined.score =
          scores.reduce((sum, value) => sum + value, 0) / scores.length;
      }
      if (errors.length > 0) {
        combined.error = Math.max(...errors);
      }
      if (messages.length > 0) {
        combined.messages = messages;
      }
      if (evidence.length > 0) {
        combined.evidence = evidence;
      }
      return combined;
    },
  });
}
