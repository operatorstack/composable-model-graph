import { createModelGraph, createTransform } from "@composable-model-graph/core";
import { exactMatchEvaluator } from "@composable-model-graph/evaluators";
import { withContract, header, selfCheck, type ContractResult } from "./shared.js";

/**
 * Demo B — Dependency graph / execution ordering
 *
 * Pipeline:  parse-dependencies -> normalize-edges -> topological-sort -> execution-plan
 *
 * `normalize-edges` has a FAULT: it silently reverses one dependency edge. Every
 * stage keeps a valid shape (Edge[] -> Edge[] -> Node[] -> Plan) and nothing
 * throws. The final plan is still a valid ordering of the tasks — but it violates
 * the system contract that holds the pipeline together:
 *
 *   for every "A depends on B", B must appear before A in the plan.
 *
 * This is domain-general: build systems, package managers, schedulers, DAG
 * engines, compilers, and agent task graphs all share this ordering contract.
 */

type Edge = { from: string; to: string }; // "from depends on to" => to before from

const RAW_DEPENDENCIES = [
  "compile-api depends on generate-types",
  "test-api depends on compile-api",
  "deploy-api depends on test-api",
];

const CORRECT_PLAN = ["generate-types", "compile-api", "test-api", "deploy-api"];

const edgeKey = (e: Edge): string => `${e.from} depends on ${e.to}`;
const edgeSet = (edges: Edge[]): Set<string> => new Set(edges.map(edgeKey));

function nodesInOrder(edges: Edge[]): string[] {
  const seen: string[] = [];
  for (const e of edges) {
    if (!seen.includes(e.from)) seen.push(e.from);
    if (!seen.includes(e.to)) seen.push(e.to);
  }
  return seen;
}

/** Deterministic Kahn topological sort; ties broken by first-appearance order. */
function topoSort(edges: Edge[]): string[] {
  const nodes = nodesInOrder(edges);
  const indegree = new Map<string, number>(nodes.map((n) => [n, 0]));
  const dependents = new Map<string, string[]>(nodes.map((n) => [n, []]));
  for (const e of edges) {
    // e.to must come before e.from: edge to -> from
    dependents.get(e.to)!.push(e.from);
    indegree.set(e.from, indegree.get(e.from)! + 1);
  }
  const ready = nodes.filter((n) => indegree.get(n) === 0);
  const order: string[] = [];
  while (ready.length > 0) {
    const n = ready.shift()!;
    order.push(n);
    for (const d of dependents.get(n)!) {
      indegree.set(d, indegree.get(d)! - 1);
      if (indegree.get(d) === 0) ready.push(d);
    }
    ready.sort((a, b) => nodes.indexOf(a) - nodes.indexOf(b));
  }
  return order;
}

const parseDependencies = createTransform<string[], Edge[]>({
  id: "parse-dependencies",
  name: "parse-dependencies",
  run: (specs) =>
    specs.map((s) => {
      const [from, to] = s.split(" depends on ");
      return { from: from!.trim(), to: to!.trim() };
    }),
});

const normalizeEdges = createTransform<Edge[], Edge[]>({
  id: "normalize-edges",
  name: "normalize-edges",
  // FAULT: "canonicalize" edges but silently reverse the first one. Output is
  // still a valid Edge[] of the same length; direction (the relation) is lost.
  run: (edges) =>
    edges.map((e, i) => (i === 0 ? { from: e.to, to: e.from } : { ...e })),
});

const topologicalSort = createTransform<Edge[], string[]>({
  id: "topological-sort",
  name: "topological-sort",
  run: (edges) => topoSort(edges),
});

const executionPlan = createTransform<string[], string[]>({
  id: "execution-plan",
  name: "execution-plan",
  run: (order) => [...order],
});

// Node contracts -------------------------------------------------------------

const everySpecParsed = (input: string[], output: Edge[]): ContractResult => ({
  ok: output.length === input.length,
  detail: `parsed ${output.length}/${input.length} specs`,
});

const edgesPreserved = (input: Edge[], output: Edge[]): ContractResult => {
  const before = edgeSet(input);
  const after = edgeSet(output);
  const changed = [...before].filter((e) => !after.has(e));
  if (changed.length > 0) {
    return { ok: false, detail: `dependency direction corrupted: "${changed[0]}"` };
  }
  return { ok: true };
};

const planIsPermutation = (input: Edge[], output: string[]): ContractResult => {
  const nodes = new Set(nodesInOrder(input));
  const ok = output.length === nodes.size && output.every((n) => nodes.has(n));
  return { ok, detail: ok ? undefined : "plan is not a permutation of the nodes" };
};

const samePlanSet = (input: string[], output: string[]): ContractResult => ({
  ok: input.length === output.length && input.every((n) => output.includes(n)),
});

const graph = createModelGraph<string[], string[]>({
  id: "dependency-ordering",
  name: "dependency-ordering",
  transforms: [
    withContract(parseDependencies, everySpecParsed),
    withContract(normalizeEdges, edgesPreserved),
    withContract(topologicalSort, planIsPermutation),
    withContract(executionPlan, samePlanSet),
  ],
  evaluator: exactMatchEvaluator<string[]>(),
});

export async function runDependency(): Promise<boolean> {
  header("Demo B — Dependency graph / execution ordering");

  const run = await graph.run(RAW_DEPENDENCIES, { target: CORRECT_PLAN });
  const plan = run.output;

  console.log(`\n  pipeline:        parse-dependencies -> normalize-edges -> topological-sort -> execution-plan`);
  console.log(`  dependencies:`);
  for (const s of RAW_DEPENDENCIES) console.log(`    ${s}`);
  console.log(`  correct plan:    ${CORRECT_PLAN.join(" -> ")}`);
  console.log(`  system plan:     ${plan.join(" -> ")}`);

  console.log(`\n  Every node ran without error and returned valid shape (nothing threw).`);

  console.log(`\n  [1] Final Answer Check (needs the known-correct plan):`);
  console.log(`    status=${run.evaluation?.status}`);
  console.log(`    => detects THAT the plan is wrong, not WHERE.`);

  console.log(`\n  [2] Node Contract Check (declared local expectations, read from the trace):`);
  for (const step of run.trace) {
    const ok = step.metadata?.contractOk;
    const detail = step.metadata?.contractDetail;
    const mark = ok === false ? "BROKE" : "ok   ";
    console.log(`    ${mark} ${step.transformName}${detail && ok === false ? `  (${detail})` : ""}`);
  }
  const faultyStep = run.trace.find((s) => s.metadata?.contractOk === false);
  console.log(`    => trace localization: ${faultyStep?.transformName ?? "none"}`);

  // [3] Trace Relation Check — no external answer key. The plan must respect the
  // dependencies the system itself parsed. Read the parsed (true) edges from the
  // trace, then check the final plan against them.
  const parsedEdges = run.trace.find((s) => s.transformId === "parse-dependencies")!
    .output as Edge[];
  const indexOf = (n: string): number => plan.indexOf(n);
  const violations = parsedEdges.filter((e) => indexOf(e.to) >= indexOf(e.from));

  // Localize: first trace step whose Edge[] output diverges from the parsed edges.
  const trueSet = edgeSet(parsedEdges);
  const divergingStep = run.trace.find((s) => {
    const out = s.output;
    if (!Array.isArray(out) || out.length === 0 || typeof out[0] !== "object") return false;
    const after = edgeSet(out as Edge[]);
    return after.size !== trueSet.size || [...trueSet].some((e) => !after.has(e));
  });

  console.log(`\n  [3] Trace Relation Check (no answer key — internal consistency):`);
  console.log(`    expected relation: for every "A depends on B", index(B) < index(A)`);
  if (violations.length === 0) {
    console.log(`    relation holds for every parsed dependency`);
  } else {
    for (const v of violations) {
      console.log(`    violated: "${edgeKey(v)}" but ${v.to}@${indexOf(v.to)} is after ${v.from}@${indexOf(v.from)}`);
    }
    console.log(`    first node whose edges diverge from the parsed truth: ${divergingStep?.transformName ?? "none"}`);
    console.log(`    => trace localization: ${divergingStep?.transformName ?? "none"}`);
  }

  return selfCheck("dependency", [
    ["final answer check detects failure", run.evaluation?.status === "fail"],
    ["node contract localizes to normalize-edges", faultyStep?.transformId === "normalize-edges"],
    ["trace relation detects an ordering violation", violations.length > 0],
    ["trace relation localizes to normalize-edges", divergingStep?.transformId === "normalize-edges"],
  ]);
}
