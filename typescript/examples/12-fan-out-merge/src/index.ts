import {
  createModelGraph,
  createTransform,
  type GraphRun,
  type RunContext,
} from "@composable-model-graph/core";
import { numericErrorEvaluator } from "@composable-model-graph/evaluators";
import { defaultFeedbackResolver } from "@composable-model-graph/feedback";

/**
 * Example 12 — Fan-out + merge (a DAG, not a line)
 *
 * One reading is estimated two independent ways, then reconciled:
 *
 *        reading
 *        /      \
 *   physics    empirical      (fan-out: two estimators, same input)
 *        \      /
 *       reconcile              (merge: receives [physicsOut, empiricalOut])
 *
 * The reconcile node's output IS the disagreement between the two estimates.
 * A numericErrorEvaluator turns that into pass/partial/fail, and a
 * defaultFeedbackResolver turns THAT into an action: agree -> accept the
 * reconciled value; diverge -> retry (re-measure). No target needed — the two
 * models check each other.
 *
 * This is the whole DAG surface in one run: `connections`, topological order,
 * a merge node fed the array of its predecessors' outputs, and evaluation +
 * feedback applied to the final output of a non-linear graph.
 */

// A physical calibration model: estimate = 3 * reading + 5.
const physicsModel = createTransform<number, number>({
  id: "physics-model",
  name: "Physics model",
  run: (reading) => 3 * reading + 5,
});

// An empirical lookup: same base curve plus a measured per-reading adjustment.
// Most readings agree with physics; reading 40 is where the table diverges.
const ADJUSTMENT: Record<number, number> = { 10: 0, 20: 2, 30: 0, 40: 20 };
const empiricalTable = createTransform<number, number>({
  id: "empirical-table",
  name: "Empirical table",
  run: (reading) => 3 * reading + 5 + (ADJUSTMENT[reading] ?? 0),
});

// Merge: reconcile the two estimates. Output = their disagreement; record the
// reconciled midpoint as a signal for the caller.
const reconcile = createTransform<number[], number>({
  id: "reconcile",
  name: "Reconcile estimates",
  run: (estimates, ctx: RunContext) => {
    const [a, b] = estimates as [number, number];
    ctx.recordSignal?.("reconciled", Math.trunc((a + b) / 2));
    return Math.abs(a - b);
  },
});

const graph = createModelGraph<number, number>({
  id: "fan-out-merge",
  name: "Reconcile two estimates",
  transforms: [physicsModel, empiricalTable, reconcile],
  connections: [
    { src: "physics-model", dst: "reconcile" },
    { src: "empirical-table", dst: "reconcile" },
  ],
  // disagreement <= 5 passes; <= 10 is partial; above that fails.
  evaluator: numericErrorEvaluator({ passThreshold: 5, partialThreshold: 10 }),
  feedbackResolver: defaultFeedbackResolver<number, number>(),
});

// Print a number without a trailing ".0" so TS and Python outputs match.
const fmt = (x: number): string => (Number.isInteger(x) ? String(x) : String(x));

function report(reading: number, run: GraphRun<number, number>): void {
  console.log(`reading ${reading}`);
  console.log("  trace:");
  for (const step of run.trace) {
    const input = Array.isArray(step.input)
      ? `[${step.input.join(", ")}]`
      : fmt(step.input as number);
    console.log(
      `    ${step.transformName.padEnd(18)} in=${input.padEnd(12)} out=${fmt(step.output as number)}`,
    );
  }
  const reconcileStep = run.trace.find((s) => s.transformId === "reconcile");
  const reconciled = reconcileStep?.metadata?.reconciled as number;
  console.log(`  reconciled estimate: ${fmt(reconciled)}`);
  console.log(
    `  evaluation: ${run.evaluation?.status}  score=${run.evaluation?.score?.toFixed(4)}  error=${fmt(run.evaluation?.error ?? 0)}`,
  );
  console.log(
    `  feedback: ${run.feedback?.kind}  (${run.feedback?.reason})`,
  );
  console.log("");
}

console.log("Fan-out + merge: reconcile two independent estimates of one reading\n");

const readings = [10, 20, 30, 40];
for (const reading of readings) {
  report(reading, await graph.run(reading));
}

console.log(
  "Reading: physics and empirical agree on 10/20/30 (accept the reconciled value);",
);
console.log(
  "they diverge at 40 (disagreement 20 -> fail -> retry: the models flag a bad reading).",
);
