import type { EvaluationResult, RunContext } from "@composable-model-graph/core";
import {
  compositeEvaluator,
  exactMatchEvaluator,
  numericErrorEvaluator,
  thresholdEvaluator,
} from "@composable-model-graph/evaluators";

/**
 * Example 05 — Evaluators
 *
 * Each generic evaluator turns an output (plus optional target) into a
 * structured EvaluationResult:
 *
 *   output (+ target) -> Evaluator -> { status, score?, error?, ... }
 *
 * This example exercises every evaluator in the package directly. Evaluators
 * are normally attached to a ModelGraph, but they are plain objects and can be
 * called on their own — which is exactly what makes runs inspectable.
 */

const context: RunContext = { runId: "example-05" };

function show(title: string, result: EvaluationResult): void {
  const parts = [`status=${result.status}`];
  if (result.score !== undefined) {
    parts.push(`score=${result.score.toFixed(4)}`);
  }
  if (result.error !== undefined) {
    parts.push(`error=${result.error}`);
  }
  console.log(`${title.padEnd(34)} ${parts.join("  ")}`);
}

console.log("== thresholdEvaluator ==");
// Pass when value >= threshold (default direction).
const atLeast = thresholdEvaluator({ threshold: 0.5 });
show("atLeast(0.5) <- 0.8", await atLeast.evaluate(0.8, undefined, context));
show("atLeast(0.5) <- 0.2", await atLeast.evaluate(0.2, undefined, context));

// Pass when value <= threshold (e.g. "latency budget").
const atMost = thresholdEvaluator({ threshold: 100, direction: "atMost" });
show("atMost(100) <- 80", await atMost.evaluate(80, undefined, context));
show("atMost(100) <- 150", await atMost.evaluate(150, undefined, context));

console.log("\n== numericErrorEvaluator ==");
// The evaluated value IS the error. score = 1 / (1 + |error|).
const errorEval = numericErrorEvaluator({
  passThreshold: 0.1,
  partialThreshold: 0.5,
});
show("error 0.05 (pass)", await errorEval.evaluate(0.05, undefined, context));
show("error 0.30 (partial)", await errorEval.evaluate(0.3, undefined, context));
show("error 1.00 (fail)", await errorEval.evaluate(1, undefined, context));

console.log("\n== exactMatchEvaluator ==");
// Structural equality between output and target.
const match = exactMatchEvaluator<number[]>();
show("[1,2,3] vs [1,2,3]", await match.evaluate([1, 2, 3], [1, 2, 3], context));
show("[1,2,3] vs [1,2,4]", await match.evaluate([1, 2, 3], [1, 2, 4], context));

console.log("\n== compositeEvaluator ==");
// Worst status wins; scores are averaged; messages/evidence concatenated.
const composite = compositeEvaluator<number>({
  evaluators: [
    thresholdEvaluator({ id: "floor", name: "Floor", threshold: 0.5 }),
    thresholdEvaluator({ id: "ceiling", name: "Ceiling", threshold: 1 }),
  ],
});
const compositeResult = await composite.evaluate(0.8, undefined, context);
show("floor(0.5) + ceiling(1) <- 0.8", compositeResult);
console.log("  messages:", JSON.stringify(compositeResult.messages));
