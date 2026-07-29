// Example 19 — render a diagram from a JSON spec.
//
// The terminal viewer draws graphs that are constructed in code. This
// example closes the gap for tools and agents that hold a graph as plain
// data: read a JSON spec (argv path, or stdin with "-"), build the graph
// with identity transforms, and print the deterministic rendering.
//
// Spec shape:
//   {
//     "kind": "graph" | "run" | "comparison",
//     "id": "...", "name": "...",
//     "nodes": [{ "id": "...", "name": "...", "produces": { ... } }],
//     "edges": [{ "src": "...", "dst": "..." }],
//     "options": { "charset", "columns", "direction", "showLifecycle",
//                  "labels", "detail" },
//     "b": { "id", "name", "nodes", "edges", "label" }
//   }
// "edges" omitted = a left-to-right chain in node order. "produces" merges
// into the flowing state so `kind: "run"` shows field diffs. The renderer
// never invents edges, and neither does this loader: the spec is drawn as
// given or rejected with the fault named.

import { readFileSync } from "node:fs";
import {
  createModelGraph,
  createTransform,
  type Connection,
  type ModelGraph,
} from "@composable-model-graph/core";
import {
  renderComparison,
  renderGraph,
  renderRun,
  type TerminalRenderOptions,
} from "@composable-model-graph/terminal";

type State = Record<string, unknown>;

interface NodeSpec {
  id: string;
  name: string;
  produces?: Record<string, unknown>;
}

interface GraphSpec {
  id: string;
  name: string;
  nodes: NodeSpec[];
  edges?: Connection[];
  label?: string;
}

interface Spec extends GraphSpec {
  kind?: "graph" | "run" | "comparison";
  options?: TerminalRenderOptions & {
    showProducedFields?: boolean;
    showEvaluation?: boolean;
    showFeedback?: boolean;
  };
  b?: GraphSpec;
}

function fail(message: string): never {
  console.error(`render-json: ${message}`);
  process.exit(1);
}

function buildGraph(spec: GraphSpec): ModelGraph<State, State> {
  if (!spec.id || !spec.name) fail("a graph spec needs id and name");
  if (!Array.isArray(spec.nodes) || spec.nodes.length === 0) {
    fail("a graph spec needs at least one node");
  }
  const ids = new Set<string>();
  for (const node of spec.nodes) {
    if (!node.id || !node.name) fail("every node needs id and name");
    if (ids.has(node.id)) fail(`duplicate node id ${JSON.stringify(node.id)}`);
    ids.add(node.id);
  }
  for (const edge of spec.edges ?? []) {
    if (!ids.has(edge.src) || !ids.has(edge.dst)) {
      fail(`edge ${edge.src} -> ${edge.dst} references an undeclared node`);
    }
  }
  return createModelGraph<State, State>({
    id: spec.id,
    name: spec.name,
    transforms: spec.nodes.map((node) =>
      createTransform<State, State>({
        id: node.id,
        name: node.name,
        run: (state) => {
          const previous = Array.isArray(state)
            ? Object.assign({}, ...(state as State[]))
            : state;
          return { ...previous, ...(node.produces ?? {}) };
        },
      }),
    ),
    connections: spec.edges,
  });
}

async function main(): Promise<void> {
  const source = process.argv[2];
  if (!source) fail("usage: tsx src/index.ts <spec.json | ->");
  const raw =
    source === "-" ? readFileSync(0, "utf8") : readFileSync(source, "utf8");
  let spec: Spec;
  try {
    spec = JSON.parse(raw) as Spec;
  } catch (error) {
    fail(`spec is not valid JSON: ${(error as Error).message}`);
  }

  // renderGraph derives a node's display text from its transform id. Surface
  // each node's `name` through the `labels` map so the spec's names show;
  // an explicit `options.labels` entry still wins.
  const labelsFor = (s: GraphSpec): Record<string, string> =>
    Object.fromEntries(s.nodes.map((node) => [node.id, node.name]));

  const graph = buildGraph(spec);
  const options = {
    ...spec.options,
    labels: { ...labelsFor(spec), ...(spec.options?.labels ?? {}) },
  };

  switch (spec.kind ?? "graph") {
    case "graph": {
      console.log(renderGraph(graph, options));
      return;
    }
    case "run": {
      const run = await graph.run({});
      // Durations are wall-clock and would make the output nondeterministic.
      console.log(renderRun(graph, run, { ...options, showDuration: false }));
      return;
    }
    case "comparison": {
      if (!spec.b) fail('kind "comparison" needs a second graph under "b"');
      const other = buildGraph(spec.b);
      // renderComparison takes only charset/detail in both languages, so the
      // twins stay byte-identical; comparison nodes show id-derived labels.
      const comparisonOptions = {
        charset: spec.options?.charset,
        detail: spec.options?.detail,
      };
      const [runA, runB] = [await graph.run({}), await other.run({})];
      console.log(
        renderComparison(
          { graph, run: runA, label: spec.label ?? spec.name },
          { graph: other, run: runB, label: spec.b.label ?? spec.b.name },
          comparisonOptions,
        ),
      );
      return;
    }
    default:
      fail(`unknown kind ${JSON.stringify(spec.kind)}`);
  }
}

await main();
