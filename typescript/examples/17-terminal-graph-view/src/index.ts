import {
  createEvaluator,
  createFeedbackResolver,
  createModelGraph,
  createTransform,
  usefulFlowScore,
} from "@composable-model-graph/core";
import {
  renderComparison,
  renderDecodedPath,
  renderGraph,
  renderRun,
  renderSensitivity,
  renderUsefulFlow,
} from "@composable-model-graph/terminal";
import { decodePath } from "@composable-model-graph/estimation";
import { rankSensitivity } from "@composable-model-graph/math";

interface ProcessingState {
  request?: string;
  parse?: string;
  schema?: string;
  validation?: string;
  route?: string;
  localResult?: string;
  systemResult?: string;
}

const input = createTransform<ProcessingState, ProcessingState>({
  id: "receive",
  name: "Collect input",
  run: (state) => ({ ...state, request: "Create report" }),
});
const parse = createTransform<ProcessingState, ProcessingState>({
  id: "parse",
  name: "Parse payload and schema",
  run: (state) => ({
    ...state,
    parse: "Structured request",
    schema: "Report request v1",
  }),
});
const validation = createTransform<ProcessingState, ProcessingState>({
  id: "validation",
  name: "Validate payload",
  run: (state) => ({ ...state, validation: "Accepted" }),
});
const route = createTransform<ProcessingState, ProcessingState>({
  id: "route",
  name: "Select route",
  run: (state) => ({ ...state, route: "Report worker" }),
});
const result = createTransform<ProcessingState, ProcessingState>({
  id: "result",
  name: "Produce local and system results",
  run: (state) => ({
    ...state,
    localResult: "Report created",
    systemResult: "Audit record stored",
  }),
});

const graph = createModelGraph<ProcessingState, ProcessingState>({
  id: "request-processing",
  name: "Request processing",
  transforms: [input, parse, validation, route, result],
});

const policy = createTransform<unknown, unknown>({
  id: "policy",
  name: "Check policy",
  run: (value) => value,
});
const capacity = createTransform<unknown, unknown>({
  id: "capacity",
  name: "Check capacity",
  run: (value) => value,
});
const decide = createTransform<unknown[], unknown>({
  id: "decide",
  name: "Decide route",
  run: (values) => values,
});
const dag = createModelGraph({
  id: "routing-decision",
  name: "Routing decision",
  transforms: [policy, capacity, decide],
  connections: [
    { src: "policy", dst: "decide" },
    { src: "capacity", dst: "decide" },
  ],
});

const scoreOutput = createEvaluator<number>({
  id: "score-output",
  name: "Score output",
  evaluate: (output) => ({
    status: output >= 10 ? "pass" : "partial",
    score: output / 20,
  }),
});
const evaluationGraph = createModelGraph<number, number>({
  id: "evaluation-model",
  name: "Evaluation model",
  transforms: [
    createTransform({
      id: "normalize",
      name: "Normalize input",
      run: (value: number) => value,
    }),
  ],
  evaluator: scoreOutput,
});
const feedbackGraph = createModelGraph<number, number>({
  id: "feedback-model",
  name: "Feedback model",
  transforms: [
    createTransform({
      id: "transform-chain",
      name: "Run transform chain",
      run: (value: number) => value,
    }),
  ],
  evaluator: scoreOutput,
  feedbackResolver: createFeedbackResolver({
    id: "status-feedback",
    name: "Resolve status",
    resolve: (run) => ({
      kind: run.evaluation?.status === "pass" ? "accept" : "adjust",
      reason: "Respond to the evaluated output",
    }),
  }),
});
const graphA = createModelGraph<number, number>({
  id: "candidate-a",
  name: "Candidate A",
  transforms: [
    createTransform({
      id: "graph-a",
      name: "Run graph A",
      run: (value: number) => value + 1,
    }),
  ],
  evaluator: createEvaluator({
    id: "score-a",
    name: "Score A",
    evaluate: () => ({ status: "partial", score: 0.6 }),
  }),
});
const graphB = createModelGraph<number, number>({
  id: "candidate-b",
  name: "Candidate B",
  transforms: [
    createTransform({
      id: "graph-b",
      name: "Run graph B",
      run: (value: number) => value + 2,
    }),
  ],
  evaluator: createEvaluator({
    id: "score-b",
    name: "Score B",
    evaluate: () => ({ status: "pass", score: 0.9 }),
  }),
});

function section(title: string, content: string): void {
  console.log(`== ${title} ==`);
  console.log(content);
  console.log("");
}

section("1. Sequential Model", renderGraph(graph, { columns: 160 }));
section(
  "2. State Projection Model",
  renderRun(graph, await graph.run({}), { columns: 160 }),
);
section(
  "3. Evaluation Model",
  renderRun(evaluationGraph, await evaluationGraph.run(12), { columns: 80 }),
);
section(
  "4. Feedback Model",
  renderRun(feedbackGraph, await feedbackGraph.run(12), { columns: 160 }),
);
section("5. Branching Model", renderGraph(dag, { columns: 80 }));

const runA = await graphA.run(10);
const runB = await graphB.run(10);
section(
  "6. Comparison Model",
  renderComparison(
    { graph: graphA, run: runA, label: "Graph A" },
    { graph: graphB, run: runB, label: "Graph B" },
  ),
);

const decoded = decodePath([
  [
    { id: "idle", score: 3 },
    { id: "busy", score: 1 },
  ],
  [
    { id: "idle", score: 1 },
    { id: "ready", score: 4 },
  ],
  [
    { id: "ready", score: 5 },
    { id: "done", score: 2 },
  ],
]);
section("7. Decoded Path", renderDecodedPath(decoded));

const ranked = rankSensitivity(
  { capacity: 2, latency: 1 },
  (knobs) => 2 * (knobs.capacity ?? 0) + 3 * (knobs.latency ?? 0),
  1,
);
section("8. Sensitivity", renderSensitivity(ranked));

section(
  "9. Useful Flow",
  renderUsefulFlow(usefulFlowScore(8, 4)),
);
