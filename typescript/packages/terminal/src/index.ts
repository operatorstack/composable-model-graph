import {
  compareRuns,
  type EvaluationResult,
  type GraphRun,
  type ModelGraph,
  type TraceStep,
} from "@composable-model-graph/core";

export type TerminalDirection = "auto" | "horizontal" | "vertical";
export type TerminalCharset = "unicode" | "ascii";
export type TerminalDetail = "summary" | "full";

export interface TerminalRenderOptions {
  labels?: Readonly<Record<string, string>>;
  columns?: number;
  direction?: TerminalDirection;
  charset?: TerminalCharset;
  showLifecycle?: boolean;
  detail?: TerminalDetail;
}

export interface TerminalRunRenderOptions extends TerminalRenderOptions {
  showProducedFields?: boolean;
  showDuration?: boolean;
  showEvaluation?: boolean;
  showFeedback?: boolean;
}

interface StateDiff {
  added: string[];
  changed: string[];
  removed: string[];
}

interface NodeProjection {
  id: string;
  label: string;
  branches: string[];
  kind: "boundary" | "transform" | "evaluator" | "feedback";
}

interface EdgeProjection {
  src: string;
  dst: string;
}

export interface TerminalComparisonSide<I, O> {
  graph: ModelGraph<I, O>;
  run: GraphRun<I, O>;
  label?: string;
}

export interface TerminalDecodedStep {
  stepIndex: number;
  stateId: string;
  score: number;
  transitionCost: number;
  cumulativeScore: number;
  state?: { value?: unknown };
}

export interface TerminalDecodedPath {
  steps: ReadonlyArray<TerminalDecodedStep>;
  totalScore: number;
}

export type TerminalSensitivity =
  | { at: number; value: number; gradient: number }
  | {
      prediction: number;
      target: number;
      error: number;
      sensitivity: number;
      updateSignal: number;
    }
  | ReadonlyArray<{ name: string; gradient: number; magnitude: number }>;

export interface TerminalUsefulFlow {
  quality: number;
  cost: number;
  score: number;
}

function isSensitivityRanking(
  result: TerminalSensitivity,
): result is ReadonlyArray<{
  name: string;
  gradient: number;
  magnitude: number;
}> {
  return Array.isArray(result);
}

interface Glyphs {
  topLeft: string;
  topRight: string;
  bottomLeft: string;
  bottomRight: string;
  horizontal: string;
  vertical: string;
  arrowRight: string;
  arrowDown: string;
  tee: string;
  elbow: string;
}

const UNICODE: Glyphs = {
  topLeft: "┌",
  topRight: "┐",
  bottomLeft: "└",
  bottomRight: "┘",
  horizontal: "─",
  vertical: "│",
  arrowRight: "▶",
  arrowDown: "▼",
  tee: "├",
  elbow: "└",
};

const ASCII: Glyphs = {
  topLeft: "+",
  topRight: "+",
  bottomLeft: "+",
  bottomRight: "+",
  horizontal: "-",
  vertical: "|",
  arrowRight: ">",
  arrowDown: "v",
  tee: "+",
  elbow: "+",
};

function readableLabel(value: string): string {
  const words = value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
  return words.length === 0 ? value : words[0]!.toUpperCase() + words.slice(1);
}

function normalized(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

// Derive a short, deterministic code from a display label. Multi-word labels
// use the initials of each word; a single word uses its first letter plus its
// leading consonants. The result is uppercased and clamped to 4 chars.
function baseCode(label: string): string {
  const words = label
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .split(/\s+/)
    .filter((word) => /[a-zA-Z0-9]/.test(word));
  if (words.length >= 2) {
    return words
      .map((word) => word.replace(/[^a-zA-Z0-9]/g, "")[0] ?? "")
      .join("")
      .slice(0, 4)
      .toUpperCase();
  }
  const word = (words[0] ?? label).replace(/[^a-zA-Z0-9]/g, "");
  if (word.length === 0) return label.toUpperCase();
  const consonants = [word[0]!, ...[...word.slice(1)].filter((c) => !/[aeiou]/i.test(c))];
  const code = consonants.join("").slice(0, 3).toUpperCase();
  return code.length >= 2 ? code : word.slice(0, 3).toUpperCase();
}

// Assign each node a unique short code, in node order (collisions get the
// shortest numeric suffix that stays unique) — deterministic for a given set.
function abbreviateNodes(nodes: NodeProjection[]): {
  nodes: NodeProjection[];
  legend: Array<{ code: string; label: string }>;
} {
  const used = new Set<string>();
  const legend: Array<{ code: string; label: string }> = [];
  const abbreviated = nodes.map((node) => {
    if (node.kind !== "transform") return node;
    let code = baseCode(node.label);
    if (used.has(code)) {
      let suffix = 2;
      while (used.has(`${code}${suffix}`)) suffix += 1;
      code = `${code}${suffix}`;
    }
    used.add(code);
    if (code !== node.label) legend.push({ code, label: node.label });
    return { ...node, label: code };
  });
  return { nodes: abbreviated, legend };
}

function legendBlock(legend: Array<{ code: string; label: string }>): string {
  return ["", "Legend", ...legend.map((entry) => `  ${entry.code} = ${entry.label}`)].join(
    "\n",
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function stateDiff(step: TraceStep): StateDiff {
  if (!isPlainRecord(step.input) || !isPlainRecord(step.output)) {
    return { added: [], changed: [], removed: [] };
  }
  const before = step.input;
  const after = step.output;
  const beforeKeys = new Set(Object.keys(before));
  const afterKeys = new Set(Object.keys(after));
  return {
    added: [...afterKeys].filter((key) => !beforeKeys.has(key)).sort(),
    changed: [...afterKeys]
      .filter(
        (key) => beforeKeys.has(key) && !Object.is(before[key], after[key]),
      )
      .sort(),
    removed: [...beforeKeys].filter((key) => !afterKeys.has(key)).sort(),
  };
}

function resolveColumns(columns: number | undefined): number {
  if (columns !== undefined) {
    if (!Number.isInteger(columns) || columns <= 0) {
      throw new Error("terminal columns must be a positive integer");
    }
    return columns;
  }
  return process.stdout.columns || 80;
}

function validateLabels<I, O>(
  graph: ModelGraph<I, O>,
  labels: Readonly<Record<string, string>>,
): void {
  const ids = new Set(graph.transforms.map((transform) => transform.id));
  for (const id of Object.keys(labels).sort()) {
    if (!ids.has(id)) {
      throw new Error(`terminal label references unknown transform id: ${id}`);
    }
  }
}

function projections<I, O>(
  graph: ModelGraph<I, O>,
  labels: Readonly<Record<string, string>>,
  run?: GraphRun<I, O>,
  showProducedFields = false,
): NodeProjection[] {
  const steps = new Map(
    run?.trace.map((step) => [step.transformId, step] as const) ?? [],
  );
  return graph.transforms.map((transform) => {
    const explicitLabel = labels[transform.id];
    let label = explicitLabel ?? readableLabel(transform.id);
    const diff = steps.has(transform.id)
      ? stateDiff(steps.get(transform.id)!)
      : { added: [], changed: [], removed: [] };
    const owner = normalized(transform.id);
    const branches = showProducedFields
      ? diff.added
          .filter((key) => normalized(key) !== owner)
          .map(readableLabel)
      : [];
    if (
      explicitLabel === undefined &&
      branches.length > 1 &&
      branches.every((branch) => normalized(branch).endsWith(owner)) &&
      !label.endsWith("s")
    ) {
      label += "s";
    }
    return { id: transform.id, label, branches, kind: "transform" };
  });
}

function topologicalOrder<I, O>(graph: ModelGraph<I, O>): string[] {
  if (!graph.connections?.length) {
    return graph.transforms.map((transform) => transform.id);
  }
  const successors = new Map(
    graph.transforms.map((transform) => [transform.id, [] as string[]]),
  );
  const indegree = new Map(
    graph.transforms.map((transform) => [transform.id, 0]),
  );
  for (const edge of graph.connections) {
    successors.get(edge.src)?.push(edge.dst);
    indegree.set(edge.dst, (indegree.get(edge.dst) ?? 0) + 1);
  }
  const queue = graph.transforms
    .map((transform) => transform.id)
    .filter((id) => indegree.get(id) === 0);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const successor of successors.get(id) ?? []) {
      indegree.set(successor, (indegree.get(successor) ?? 0) - 1);
      if (indegree.get(successor) === 0) queue.push(successor);
    }
  }
  return order;
}

function explicitLinearOrder<I, O>(
  graph: ModelGraph<I, O>,
): string[] | undefined {
  const connections = graph.connections;
  const transformIds = graph.transforms.map((transform) => transform.id);
  if (!connections?.length || transformIds.length < 2) return undefined;
  if (connections.length !== transformIds.length - 1) return undefined;

  const known = new Set(transformIds);
  const successors = new Map(transformIds.map((id) => [id, [] as string[]]));
  const indegree = new Map(transformIds.map((id) => [id, 0]));
  const seenEdges = new Set<string>();
  for (const edge of connections) {
    if (!known.has(edge.src) || !known.has(edge.dst)) return undefined;
    const edgeKey = `${edge.src}\0${edge.dst}`;
    if (seenEdges.has(edgeKey)) return undefined;
    seenEdges.add(edgeKey);
    successors.get(edge.src)!.push(edge.dst);
    indegree.set(edge.dst, indegree.get(edge.dst)! + 1);
  }

  const roots = transformIds.filter((id) => indegree.get(id) === 0);
  if (roots.length !== 1) return undefined;
  const order: string[] = [];
  const visited = new Set<string>();
  let current: string | undefined = roots[0];
  while (current !== undefined) {
    if (visited.has(current)) return undefined;
    visited.add(current);
    order.push(current);
    const next = successors.get(current)!;
    if (next.length > 1) return undefined;
    current = next[0];
  }
  return order.length === transformIds.length ? order : undefined;
}

function lifecycleProjection<I, O>(
  graph: ModelGraph<I, O>,
  transformNodes: NodeProjection[],
  run: GraphRun<I, O> | undefined,
  options: TerminalRunRenderOptions,
): { nodes: NodeProjection[]; edges?: EdgeProjection[] } {
  const linearOrder = explicitLinearOrder(graph);
  const nodesById = new Map(transformNodes.map((node) => [node.id, node]));
  const orderedTransformNodes = linearOrder
    ? linearOrder.map((id) => nodesById.get(id)!)
    : transformNodes;
  if (options.showLifecycle === false) {
    return {
      nodes: orderedTransformNodes,
      edges:
        graph.connections?.length && !linearOrder
          ? [...graph.connections]
          : undefined,
    };
  }
  const input: NodeProjection = {
    id: "$input",
    label: "Input",
    branches: [],
    kind: "boundary",
  };
  const output: NodeProjection = {
    id: "$output",
    label: "Output",
    branches: [],
    kind: "boundary",
  };
  const nodes = [input, ...orderedTransformNodes, output];
  const edges: EdgeProjection[] = [];
  const order = topologicalOrder(graph);
  if (graph.connections?.length) {
    const destinations = new Set(graph.connections.map((edge) => edge.dst));
    for (const id of order.filter((candidate) => !destinations.has(candidate))) {
      edges.push({ src: input.id, dst: id });
    }
    edges.push(...graph.connections);
  } else {
    for (let index = 0; index < order.length - 1; index += 1) {
      edges.push({ src: order[index]!, dst: order[index + 1]! });
    }
    if (order.length) edges.push({ src: input.id, dst: order[0]! });
  }
  if (order.length) {
    edges.push({ src: order.at(-1)!, dst: output.id });
  } else {
    edges.push({ src: input.id, dst: output.id });
  }
  let previous = output.id;
  if (graph.evaluator && options.showEvaluation !== false) {
    const evaluator: NodeProjection = {
      id: "$evaluation",
      label: run?.evaluation
        ? `Evaluation: ${run.evaluation.status}`
        : "Evaluation",
      branches: [],
      kind: "evaluator",
    };
    nodes.push(evaluator);
    edges.push({ src: previous, dst: evaluator.id });
    previous = evaluator.id;
  }
  if (graph.feedbackResolver && options.showFeedback !== false) {
    const feedback: NodeProjection = {
      id: "$feedback",
      label: run?.feedback ? `Feedback: ${run.feedback.kind}` : "Feedback",
      branches: [],
      kind: "feedback",
    };
    nodes.push(feedback);
    edges.push({ src: previous, dst: feedback.id });
  }
  const isSimpleChain =
    !graph.connections?.length ||
    graph.transforms.length === 0 ||
    linearOrder !== undefined;
  return { nodes, edges: isSimpleChain ? undefined : edges };
}

function boxLines(node: NodeProjection, glyphs: Glyphs): string[] {
  const innerWidth = node.label.length + 2;
  return [
    glyphs.topLeft + glyphs.horizontal.repeat(innerWidth) + glyphs.topRight,
    `${glyphs.vertical} ${node.label} ${glyphs.vertical}`,
    glyphs.bottomLeft + glyphs.horizontal.repeat(innerWidth) + glyphs.bottomRight,
  ];
}

function horizontalLayout(nodes: NodeProjection[], glyphs: Glyphs): string {
  if (nodes.length === 0) {
    return "";
  }
  const boxes = nodes.map((node) => boxLines(node, glyphs));
  const connector = glyphs.horizontal.repeat(3) + glyphs.arrowRight;
  const lines = [
    boxes.map((box) => box[0]).join("    "),
    boxes.map((box) => box[1]).join(connector),
    boxes.map((box) => box[2]).join("    "),
  ];

  const centers: number[] = [];
  let offset = 0;
  for (let index = 0; index < boxes.length; index += 1) {
    const width = boxes[index]![0]!.length;
    centers.push(offset + Math.floor(width / 2));
    offset += width + (index < boxes.length - 1 ? 4 : 0);
  }
  const branchRows: Array<Map<number, string>> = [];
  for (let index = 0; index < nodes.length; index += 1) {
    const branches = nodes[index]!.branches;
    const center = centers[index]!;
    if (branches.length === 1) {
      branchRows[0] ??= new Map();
      branchRows[1] ??= new Map();
      branchRows[0]!.set(center, glyphs.arrowDown);
      branchRows[1]!.set(
        Math.max(0, center - Math.floor(branches[0]!.length / 2)),
        branches[0]!,
      );
    } else {
      for (let branchIndex = 0; branchIndex < branches.length; branchIndex += 1) {
        branchRows[branchIndex] ??= new Map();
        const marker =
          branchIndex === branches.length - 1 ? glyphs.elbow : glyphs.tee;
        branchRows[branchIndex]!.set(
          center,
          `${marker}${glyphs.horizontal} ${branches[branchIndex]}`,
        );
      }
    }
  }
  for (const row of branchRows) {
    if (!row) continue;
    let rendered = "";
    for (const [column, content] of [...row.entries()].sort(
      ([a], [b]) => a - b,
    )) {
      rendered = rendered.padEnd(column, " ") + content;
    }
    lines.push(rendered.trimEnd());
  }
  return lines.join("\n");
}

function verticalLayout(
  nodes: NodeProjection[],
  glyphs: Glyphs,
  edges?: ReadonlyArray<{ src: string; dst: string }>,
): string {
  const lines: string[] = [];
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]!;
    lines.push(...boxLines(node, glyphs));
    for (let branchIndex = 0; branchIndex < node.branches.length; branchIndex += 1) {
      const marker =
        branchIndex === node.branches.length - 1 ? glyphs.elbow : glyphs.tee;
      lines.push(`  ${marker}${glyphs.horizontal} ${node.branches[branchIndex]}`);
    }
    if (index < nodes.length - 1 && !edges) {
      lines.push(`  ${glyphs.arrowDown}`);
    }
  }
  if (edges) {
    const nodeLabels = new Map(nodes.map((node) => [node.id, node.label]));
    lines.push("", "Edges");
    for (const edge of edges) {
      lines.push(
        `  ${nodeLabels.get(edge.src) ?? readableLabel(edge.src)} ${glyphs.horizontal}${glyphs.arrowRight} ${nodeLabels.get(edge.dst) ?? readableLabel(edge.dst)}`,
      );
    }
  }
  return lines.join("\n");
}

function simpleDiamondLayout(
  nodes: NodeProjection[],
  glyphs: Glyphs,
  edges: ReadonlyArray<{ src: string; dst: string }>,
): string | undefined {
  if (
    nodes.length !== 3 ||
    edges.length !== 2 ||
    edges[0]!.dst !== edges[1]!.dst ||
    edges[0]!.src === edges[1]!.src
  ) {
    return undefined;
  }
  const labels = new Map(nodes.map((node) => [node.id, node.label]));
  const first = labels.get(edges[0]!.src);
  const second = labels.get(edges[1]!.src);
  const sink = labels.get(edges[0]!.dst);
  if (!first || !second || !sink) {
    return undefined;
  }
  const left = [`[${first}]`, `[${second}]`];
  const leftWidth = Math.max(...left.map((label) => label.length));
  return [
    `${left[0]!.padEnd(leftWidth)} ${glyphs.horizontal}${glyphs.topRight}`,
    `${" ".repeat(leftWidth + 2)}${glyphs.tee}${glyphs.horizontal}${glyphs.arrowRight} [${sink}]`,
    `${left[1]!.padEnd(leftWidth)} ${glyphs.horizontal}${glyphs.bottomRight}`,
  ].join("\n");
}

function lifecycleDiamondLayout(
  nodes: NodeProjection[],
  glyphs: Glyphs,
  edges: ReadonlyArray<EdgeProjection>,
): string | undefined {
  const labels = new Map(nodes.map((node) => [node.id, node.label]));
  if (!labels.has("$input") || !labels.has("$output")) return undefined;
  const roots = edges
    .filter((edge) => edge.src === "$input")
    .map((edge) => edge.dst);
  if (roots.length !== 2) return undefined;
  const firstTargets = edges
    .filter((edge) => edge.src === roots[0])
    .map((edge) => edge.dst);
  const secondTargets = edges
    .filter((edge) => edge.src === roots[1])
    .map((edge) => edge.dst);
  if (
    firstTargets.length !== 1 ||
    secondTargets.length !== 1 ||
    firstTargets[0] !== secondTargets[0]
  ) {
    return undefined;
  }
  const sink = firstTargets[0]!;
  if (!edges.some((edge) => edge.src === sink && edge.dst === "$output")) {
    return undefined;
  }
  const input = `[${labels.get("$input")}]`;
  const output = `[${labels.get("$output")}]`;
  const first = `[${labels.get(roots[0]!)}]`;
  const second = `[${labels.get(roots[1]!)}]`;
  const merged = `[${labels.get(sink)}]`;
  const prefix = " ".repeat(input.length + 5);
  const branchWidth = Math.max(first.length, second.length);
  return [
    `${prefix}${glyphs.topLeft}${glyphs.horizontal}${glyphs.arrowRight} ${first.padEnd(branchWidth)} ${glyphs.horizontal}${glyphs.topRight}`,
    `${input} ${glyphs.horizontal.repeat(3)}${glyphs.arrowRight} ${glyphs.tee}${" ".repeat(branchWidth + 4)}${glyphs.tee}${glyphs.horizontal}${glyphs.arrowRight} ${merged} ${glyphs.horizontal.repeat(3)}${glyphs.arrowRight} ${output}`,
    `${prefix}${glyphs.bottomLeft}${glyphs.horizontal}${glyphs.arrowRight} ${second.padEnd(branchWidth)} ${glyphs.horizontal}${glyphs.bottomRight}`,
  ].join("\n");
}

function architecture<I, O>(
  graph: ModelGraph<I, O>,
  options: TerminalRunRenderOptions,
  run?: GraphRun<I, O>,
  showProducedFields = false,
): string {
  const labels = options.labels ?? {};
  validateLabels(graph, labels);
  if (
    options.direction !== undefined &&
    !["auto", "horizontal", "vertical"].includes(options.direction)
  ) {
    throw new Error(`unknown terminal direction: ${String(options.direction)}`);
  }
  if (
    options.charset !== undefined &&
    !["unicode", "ascii"].includes(options.charset)
  ) {
    throw new Error(`unknown terminal charset: ${String(options.charset)}`);
  }
  const transformNodes = projections(
    graph,
    labels,
    run,
    showProducedFields,
  );
  const projection = lifecycleProjection(graph, transformNodes, run, options);
  const nodes = projection.nodes;
  const glyphs = options.charset === "ascii" ? ASCII : UNICODE;
  const columns = resolveColumns(options.columns);
  const direction = options.direction ?? "auto";
  const edges = projection.edges;

  if (edges) {
    // The widest compact diamond (lifecycle, then simple) that fits `columns`.
    const diamondFor = (ns: NodeProjection[]): string | undefined => {
      const lifecycle = lifecycleDiamondLayout(ns, glyphs, edges);
      if (
        lifecycle &&
        Math.max(...lifecycle.split("\n").map((line) => line.length)) <= columns
      ) {
        return lifecycle;
      }
      const simple = simpleDiamondLayout(ns, glyphs, edges);
      if (
        simple &&
        Math.max(...simple.split("\n").map((line) => line.length)) <= columns
      ) {
        return simple;
      }
      return undefined;
    };
    if (direction !== "vertical") {
      const full = diamondFor(nodes);
      if (full) return full;
    }
    // Auto only: if a full-label diamond overflows, retry with short codes and
    // append a legend before giving up on the compact shape.
    if (direction === "auto") {
      const { nodes: abbreviated, legend } = abbreviateNodes(nodes);
      if (legend.length) {
        const compact = diamondFor(abbreviated);
        if (compact) return `${compact}\n${legendBlock(legend)}`;
      }
    }
    if (direction === "horizontal") {
      const diamond = simpleDiamondLayout(nodes, glyphs, edges);
      const diamondWidth = diamond
        ? Math.max(...diamond.split("\n").map((line) => line.length))
        : 0;
      if (diamond && diamondWidth > columns) {
        throw new Error(
          `horizontal terminal layout requires ${diamondWidth} columns; received ${columns}`,
        );
      }
      throw new Error(
        "horizontal terminal layout is unavailable for this DAG shape",
      );
    }
    return verticalLayout(nodes, glyphs, edges);
  }

  const horizontal = horizontalLayout(nodes, glyphs);
  const widest = Math.max(0, ...horizontal.split("\n").map((line) => line.length));
  if (direction === "horizontal") {
    if (widest > columns) {
      throw new Error(
        `horizontal terminal layout requires ${widest} columns; received ${columns}`,
      );
    }
    return horizontal;
  }
  // Auto only: a wide chain gets short codes + a legend before the vertical
  // fallback, so a near-linear flow stays a single readable row.
  if (direction === "auto" && widest > columns) {
    const { nodes: abbreviated, legend } = abbreviateNodes(nodes);
    if (legend.length) {
      const compact = horizontalLayout(abbreviated, glyphs);
      const compactWidth = Math.max(
        0,
        ...compact.split("\n").map((line) => line.length),
      );
      if (compactWidth <= columns) return `${compact}\n${legendBlock(legend)}`;
    }
  }
  if (direction === "vertical" || widest > columns) {
    return verticalLayout(nodes, glyphs);
  }
  return horizontal;
}

/** Render the executable structure declared by a ModelGraph. */
export function renderGraph<I, O>(
  graph: ModelGraph<I, O>,
  options: TerminalRenderOptions = {},
): string {
  return architecture(graph, options);
}

/** Render graph structure plus state changes from a completed GraphRun. */
export function renderRun<I, O>(
  graph: ModelGraph<I, O>,
  run: GraphRun<I, O>,
  options: TerminalRunRenderOptions = {},
): string {
  const lines = [
    graph.name,
    "",
    architecture(
      graph,
      options,
      run,
      options.showProducedFields !== false,
    ),
    "",
    "Run",
  ];
  for (let index = 0; index < run.trace.length; index += 1) {
    const step = run.trace[index]!;
    const diff = stateDiff(step);
    const changes = [
      ...diff.added.map((key) => `+ ${key}`),
      ...diff.changed.map((key) => `~ ${key}`),
      ...diff.removed.map((key) => `- ${key}`),
    ];
    const duration =
      options.showDuration === true ? ` (${step.durationMs}ms)` : "";
    lines.push(
      `  ${index + 1}. ${step.transformName}${duration}${changes.length ? `  ${changes.join(", ")}` : ""}`,
    );
    if (options.detail === "full" && step.metadata) {
      for (const [key, value] of Object.entries(step.metadata).sort(
        ([a], [b]) => a.localeCompare(b),
      )) {
        lines.push(`     ${key}: ${displayValue(value)}`);
      }
    }
  }
  if (options.showEvaluation !== false && run.evaluation) {
    lines.push("", evaluationSummary(run.evaluation));
    if (options.detail === "full") {
      for (const message of run.evaluation.messages ?? []) {
        lines.push(`  Message: ${message}`);
      }
      for (const evidence of run.evaluation.evidence ?? []) {
        lines.push(
          `  Evidence: ${evidence.label} = ${displayValue(evidence.value)}${evidence.source ? ` (${evidence.source})` : ""}`,
        );
      }
    }
  }
  if (options.showFeedback !== false && run.feedback) {
    lines.push(
      `Feedback: ${run.feedback.kind}${run.feedback.reason ? ` — ${run.feedback.reason}` : ""}`,
    );
    if (options.detail === "full" && run.feedback.signal !== undefined) {
      lines.push(`  Signal: ${displayValue(run.feedback.signal)}`);
    }
  }
  return lines.join("\n");
}

function displayValue(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(stableValue(value)) ?? String(value);
  } catch {
    return String(value);
  }
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (isPlainRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value);
}

function evaluationSummary(evaluation: EvaluationResult): string {
  const values = [`Evaluation: ${evaluation.status}`];
  if (evaluation.score !== undefined) {
    values.push(`score=${formatNumber(evaluation.score)}`);
  }
  if (evaluation.error !== undefined) {
    values.push(`error=${formatNumber(evaluation.error)}`);
  }
  return values.join("  ");
}

function analysisGlyphs(options: TerminalRenderOptions): Glyphs {
  return options.charset === "ascii" ? ASCII : UNICODE;
}

/** Render two graph runs converging on their CMG comparison verdict. */
export function renderComparison<I, O>(
  a: TerminalComparisonSide<I, O>,
  b: TerminalComparisonSide<I, O>,
  options: TerminalRenderOptions = {},
): string {
  const glyphs = analysisGlyphs(options);
  const comparison = compareRuns(a.run, b.run);
  const labelA = a.label ?? a.graph.name;
  const labelB = b.label ?? b.graph.name;
  const leftWidth = Math.max(labelA.length, labelB.length) + 2;
  const verdict = `Compare: ${comparison.better.toUpperCase()}`;
  const lines = [
    `[${labelA}]`.padEnd(leftWidth + 2) + `${glyphs.horizontal}${glyphs.topRight}`,
    `${" ".repeat(leftWidth + 3)}${glyphs.tee}${glyphs.horizontal}${glyphs.arrowRight} [${verdict}]`,
    `[${labelB}]`.padEnd(leftWidth + 2) + `${glyphs.horizontal}${glyphs.bottomRight}`,
    `Reason: ${comparison.reason}`,
  ];
  if (options.detail === "full") {
    lines.push(
      `Scores: A=${displayValue(comparison.score.a)} B=${displayValue(comparison.score.b)} delta=${displayValue(comparison.score.delta)}`,
    );
    for (const [key, signal] of Object.entries(comparison.signals).sort(
      ([left], [right]) => left.localeCompare(right),
    )) {
      lines.push(
        `Signal ${key}: A=${formatNumber(signal.a)} B=${formatNumber(signal.b)} delta=${formatNumber(signal.delta)}`,
      );
    }
  }
  return lines.join("\n");
}

/** Render a decoded state path and its cumulative score. */
export function renderDecodedPath(
  path: TerminalDecodedPath,
  options: TerminalRenderOptions = {},
): string {
  const glyphs = analysisGlyphs(options);
  const connector = ` ${glyphs.horizontal}${glyphs.arrowRight} `;
  const states = path.steps.map((step) => `[${step.stateId}]`).join(connector);
  const lines = [states, `Total score: ${formatNumber(path.totalScore)}`];
  if (options.detail === "full") {
    for (const step of path.steps) {
      lines.push(
        `  ${step.stepIndex}. ${step.stateId} score=${formatNumber(step.score)} transition=${formatNumber(step.transitionCost)} cumulative=${formatNumber(step.cumulativeScore)}${step.state?.value !== undefined ? ` value=${displayValue(step.state.value)}` : ""}`,
      );
    }
  }
  return lines.join("\n");
}

/** Render a scalar/update sensitivity or a ranked knob-sensitivity list. */
export function renderSensitivity(
  result: TerminalSensitivity,
  options: TerminalRenderOptions = {},
): string {
  const glyphs = analysisGlyphs(options);
  if (isSensitivityRanking(result)) {
    const lines = ["Sensitivity ranking"];
    for (let index = 0; index < result.length; index += 1) {
      const item = result[index]!;
      lines.push(
        `  ${index + 1}. ${item.name} ${glyphs.horizontal}${glyphs.arrowRight} gradient=${formatNumber(item.gradient)} magnitude=${formatNumber(item.magnitude)}`,
      );
    }
    return lines.join("\n");
  }
  if ("updateSignal" in result) {
    return [
      `[Prediction ${formatNumber(result.prediction)}] ${glyphs.horizontal}${glyphs.arrowRight} [Error ${formatNumber(result.error)}] ${glyphs.horizontal}${glyphs.arrowRight} [Update ${formatNumber(result.updateSignal)}]`,
      `Target: ${formatNumber(result.target)}  Sensitivity: ${formatNumber(result.sensitivity)}`,
    ].join("\n");
  }
  return [
    `[At ${formatNumber(result.at)}] ${glyphs.horizontal}${glyphs.arrowRight} [Value ${formatNumber(result.value)}] ${glyphs.horizontal}${glyphs.arrowRight} [Gradient ${formatNumber(result.gradient)}]`,
  ].join("\n");
}

/** Render quality and cost converging on a useful-flow score. */
export function renderUsefulFlow(
  result: TerminalUsefulFlow,
  options: TerminalRenderOptions = {},
): string {
  const glyphs = analysisGlyphs(options);
  const quality = `[Quality ${formatNumber(result.quality)}]`;
  const cost = `[Cost ${formatNumber(result.cost)}]`;
  const width = Math.max(quality.length, cost.length);
  return [
    `${quality.padEnd(width)} ${glyphs.horizontal}${glyphs.topRight}`,
    `${" ".repeat(width + 2)}${glyphs.tee}${glyphs.horizontal}${glyphs.arrowRight} [Score ${formatNumber(result.score)}]`,
    `${cost.padEnd(width)} ${glyphs.horizontal}${glyphs.bottomRight}`,
  ].join("\n");
}
