import {
  compareRuns,
  createModelGraph,
  createTransform,
  type GraphRun,
  type ModelGraph,
  type RunComparison,
} from "@composable-model-graph/core";
import {
  type CandidateState,
  type DecodedPath,
  type TransitionCost,
  decodePath,
} from "@composable-model-graph/estimation";
import { exactMatchEvaluator } from "@composable-model-graph/evaluators";
import { defaultFeedbackResolver } from "@composable-model-graph/feedback";

/**
 * Example 16 - Estimation inside an inspectable graph.
 *
 * The same noisy track runs through two graph configurations:
 *
 *   readings -> build trellis -> decode path -> summarize
 *
 * Graph A trusts each reading independently. Graph B charges for implausible
 * jumps. Evaluation checks the final path against ground truth, feedback turns
 * that result into an action, and compareRuns explains where the runs diverge.
 */

interface TrackingInput {
  readings: number[];
  grid: number[];
}

const INPUT: TrackingInput = {
  readings: [1, 1, 2, 5, 2, 1, 1],
  grid: [0, 1, 2, 3, 4, 5],
};
const TARGET = "1 1 2 3 2 1 1";

function numericStateValue(state: CandidateState): number {
  if (typeof state.value === "number") {
    return state.value;
  }
  throw new Error(`state ${state.id} has no numeric value`);
}

const transitionCost: TransitionCost = (previous, next) => {
  return (numericStateValue(previous) - numericStateValue(next)) ** 2;
};

const buildTrellis = createTransform<TrackingInput, CandidateState[][]>({
  id: "build-trellis",
  name: "Build candidate trellis",
  run: (input) => {
    return input.readings.map((reading) => {
      return input.grid.map((level) => {
        return {
          id: String(level),
          score: -((reading - level) ** 2),
          value: level,
        };
      });
    });
  },
});

const summarize = createTransform<DecodedPath, string>({
  id: "summarize",
  name: "Summarize decoded path",
  run: (path) => {
    return path.stateIds.join(" ");
  },
});

function createTrackingGraph(
  id: string,
  name: string,
  transitionWeight: number,
): ModelGraph<TrackingInput, string> {
  const decode = createTransform<CandidateState[][], DecodedPath>({
    id: "decode-path",
    name: "Decode best path",
    run: (trellis, context) => {
      const path = decodePath(trellis, {
        transitionCost,
        transitionWeight,
      });
      context.recordSignal?.("pathScore", path.totalScore);
      return path;
    },
  });

  return createModelGraph<TrackingInput, string>({
    id,
    name,
    transforms: [buildTrellis, decode, summarize],
    evaluator: exactMatchEvaluator<string>(),
    feedbackResolver: defaultFeedbackResolver<TrackingInput, string>(),
  });
}

function pathScore(run: GraphRun<TrackingInput, string>): number {
  const decodeStep = run.trace.find((step) => {
    return step.transformId === "decode-path";
  });
  const score = decodeStep?.metadata?.pathScore;
  if (typeof score === "number") {
    return score;
  }
  throw new Error("decode-path did not record pathScore");
}

function printRun(
  label: string,
  transitionWeight: number,
  run: GraphRun<TrackingInput, string>,
): void {
  console.log(`${label} (transitionWeight=${transitionWeight})`);
  console.log(`  path:       ${run.output}`);
  console.log(`  trace:      ${run.trace.map((step) => {
    return step.transformId;
  }).join(" -> ")}`);
  console.log(`  pathScore:  ${pathScore(run)}`);
  console.log(
    `  evaluation: ${run.evaluation?.status ?? "none"} (score=${run.evaluation?.score ?? "none"})`,
  );
  console.log(
    `  feedback:   ${run.feedback?.kind ?? "none"} (${run.feedback?.reason ?? "none"})`,
  );
}

function printComparison(comparison: RunComparison): void {
  const scoreDelta = comparison.score.delta;
  const pathScoreDelta = comparison.signals.pathScore;
  console.log("compareRuns(A, B)");
  console.log(`  verdict:       ${comparison.better} (${comparison.reason})`);
  console.log(`  score delta:   ${scoreDelta ?? "none"}`);
  if (pathScoreDelta) {
    console.log(
      `  pathScore:     A=${pathScoreDelta.a} B=${pathScoreDelta.b} delta=${pathScoreDelta.delta}`,
    );
  }
  console.log(`  diverged@step: ${comparison.divergedAtStep ?? "none"} (decode-path)`);
}

const graphA = createTrackingGraph(
  "pointwise-track",
  "Pointwise track",
  0,
);
const graphB = createTrackingGraph(
  "coherent-track",
  "Coherent track",
  1,
);

const runA = await graphA.run(INPUT, { target: TARGET });
const runB = await graphB.run(INPUT, { target: TARGET });

console.log("Estimation in a ModelGraph: local evidence vs sequence coherence\n");
console.log(`readings:     ${INPUT.readings.join(" ")}`);
console.log(`ground truth: ${TARGET}\n`);
printRun("Graph A - trust each reading", 0, runA);
console.log("");
printRun("Graph B - prefer a coherent path", 1, runB);
console.log("");
printComparison(compareRuns(runA, runB));
console.log(
  "\nReading: the graph makes the estimator measurable and actionable. The trace",
);
console.log(
  "locates the first difference at decode-path; evaluation prefers B's coherent",
);
console.log("path, and feedback changes from retry to accept.");
