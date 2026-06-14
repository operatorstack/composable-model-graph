import {
  createModelGraph,
  createTransform,
  usefulFlowScore,
} from "@composable-model-graph/core";
import { rankSensitivity } from "@composable-model-graph/math";

/**
 * Example 09 - Best time to implement (a task graph that schedules itself)
 *
 * A backlog is a dependency graph: each task has a value, a cost, and the tasks it
 * waits on. Given that graph, the best time to start a task falls out of the
 * structure, no flat to-do list required:
 *   - READY    a task whose dependencies are all done (you can start it now)
 *   - Phi      value / cost, so the ready set sorts by what earns its cost first
 *   - critical path  the longest dependency chain by cost: it sets the finish time
 *   - sensitivity    completing which task raises the most downstream value/cost
 *
 * This is the RAW, deterministic engine: task state (done / not, value, cost, deps)
 * is given as data, so every number here is hand-checkable. A later layer lets a
 * model JUDGE that state from evidence (done or not, value, cost) and feed this same
 * engine, at the `assess` seam below. The graph stays the exact, inspectable part;
 * the model only supplies the fuzzy inputs. It uses only `core` + `math`, so the
 * Python version is identical.
 */

type Status = "done" | "todo";

interface Task {
  id: string;
  title: string;
  status: Status;
  value: number;
  cost: number;
  deps: string[];
}

// The seed backlog: a generic small software project shipping v1. It includes the
// canonical case - a task BLOCKED on an unbuilt dependency you do not want to forget
// ("move assets into object storage" waits on "build the storage adapter"). The
// planner holds it and surfaces it only once the blocker is done.
const TASKS: Task[] = [
  { id: "scaffold", title: "Set up project scaffold", status: "done", value: 3, cost: 1, deps: [] },
  { id: "ci", title: "Set up CI", status: "todo", value: 5, cost: 2, deps: ["scaffold"] },
  { id: "auth", title: "Add authentication", status: "todo", value: 8, cost: 4, deps: ["scaffold"] },
  { id: "storage-adapter", title: "Build the storage adapter", status: "todo", value: 4, cost: 3, deps: ["scaffold"] },
  { id: "api-docs", title: "Write API docs", status: "todo", value: 3, cost: 1, deps: ["auth"] },
  { id: "move-assets", title: "Move assets into object storage", status: "todo", value: 8, cost: 2, deps: ["storage-adapter"] },
  { id: "tests", title: "Write integration tests", status: "todo", value: 5, cost: 3, deps: ["auth", "storage-adapter"] },
  { id: "ship-v1", title: "Ship v1", status: "todo", value: 10, cost: 2, deps: ["ci", "api-docs", "move-assets", "tests"] },
];

// Model helpers (pure, shared by the graph and the analyses below).
const byId = new Map<string, Task>(TASKS.map((t) => [t.id, t]));
const get = (id: string): Task => byId.get(id) as Task;
const isDone = (id: string): boolean => get(id).status === "done";
const phiOf = (t: Task): number => usefulFlowScore(t.value, t.cost).score;
const unmetDeps = (t: Task): string[] => t.deps.filter((d) => !isDone(d));

interface Plan {
  done: string[];
  ready: string[]; // sorted by Phi, descending
  blocked: Array<{ id: string; until: string[] }>;
  order: string[]; // recommended order = the ready set by Phi
  doNow: string | null;
  criticalPath: string[];
  criticalCost: number;
}

// Critical path: the longest dependency chain by summed cost. It is the lower bound
// on finish time, so tasks on it gate the schedule even when their Phi is modest.
function longestCostPath(): { path: string[]; cost: number } {
  const memo = new Map<string, { dist: number; via: string | null }>();
  const dist = (id: string): { dist: number; via: string | null } => {
    const cached = memo.get(id);
    if (cached) return cached;
    const t = get(id);
    let best = { dist: t.cost, via: null as string | null };
    for (const d of t.deps) {
      const through = t.cost + dist(d).dist;
      if (through > best.dist) best = { dist: through, via: d };
    }
    memo.set(id, best);
    return best;
  };
  let endId = TASKS[0]?.id ?? "";
  let endDist = -Infinity;
  for (const t of TASKS) {
    const d = dist(t.id).dist;
    if (d > endDist) {
      endDist = d;
      endId = t.id;
    }
  }
  const path: string[] = [];
  let cur: string | null = endId;
  while (cur) {
    path.unshift(cur);
    cur = dist(cur).via;
  }
  return { path, cost: endDist };
}

// Sensitivity objective: total value/cost currently AVAILABLE to work on. A task is
// available in proportion to how done its dependencies are (product of their
// progress). Nudging a task toward done and watching this rise is its unblock power.
function totalAvailablePhi(progress: Record<string, number>): number {
  let sum = 0;
  for (const t of TASKS) {
    let avail = 1;
    for (const d of t.deps) avail *= progress[d] ?? 0;
    sum += phiOf(t) * avail;
  }
  return sum;
}

// Which not-yet-done tasks does completing `id` directly unblock (it is their last
// remaining dependency)?
function directlyUnblocks(id: string): string[] {
  return TASKS.filter(
    (t) => t.status === "todo" && t.deps.includes(id) && unmetDeps(t).length === 1 && unmetDeps(t)[0] === id,
  ).map((t) => t.id);
}

// The pipeline as a cmg ModelGraph: assess -> classify -> prioritize. Each stage
// records a signal, so the run's trace shows how the plan was built. `assess` is the
// seam where a model will later JUDGE state; here it is the identity.
const assess = createTransform<Task[], Task[]>({
  id: "assess",
  name: "Assess",
  run: (tasks, ctx) => {
    ctx.recordSignal?.("tasks", tasks.length);
    return tasks; // Phase 2: a model fills status / value / cost / deps from evidence.
  },
});

const classify = createTransform<Task[], Plan>({
  id: "classify",
  name: "Classify",
  run: (tasks, ctx) => {
    const done: string[] = [];
    const ready: string[] = [];
    const blocked: Array<{ id: string; until: string[] }> = [];
    for (const t of tasks) {
      if (t.status === "done") done.push(t.id);
      else if (unmetDeps(t).length === 0) ready.push(t.id);
      else blocked.push({ id: t.id, until: unmetDeps(t) });
    }
    ctx.recordSignal?.("ready", ready.length);
    return { done, ready, blocked, order: [], doNow: null, criticalPath: [], criticalCost: 0 };
  },
});

const prioritize = createTransform<Plan, Plan>({
  id: "prioritize",
  name: "Prioritize",
  run: (plan, ctx) => {
    const order = [...plan.ready].sort((a, b) => phiOf(get(b)) - phiOf(get(a)) || a.localeCompare(b));
    const { path, cost } = longestCostPath();
    ctx.recordSignal?.("critical_cost", cost);
    return { ...plan, order, doNow: order[0] ?? null, criticalPath: path, criticalCost: cost };
  },
});

const planner = createModelGraph<Task[], Plan>({
  id: "best-time-to-implement",
  name: "Best Time To Implement",
  transforms: [assess, classify, prioritize],
});

// Formatting helpers so TS and Python print byte-identical output.
const ID_W = 16;
const TITLE_W = 32;
const f2 = (x: number): string => x.toFixed(2);
const signed = (x: number): string => (x >= 0 ? "+" : "-") + f2(Math.abs(x));
const line = (s: string): void => console.log(s.replace(/\s+$/, ""));

const run = await planner.run(TASKS);
const plan = run.output;

line("Best-time-to-implement: a task graph that schedules itself (the AI judges state later)");
line("");

line("1. STATE  -  done, ready, or blocked, derived from dependencies");
for (const id of plan.done) {
  const t = get(id);
  line(`   done    ${id.padEnd(ID_W)}${t.title.padEnd(TITLE_W)}`);
}
for (const id of plan.order.length ? plan.order : plan.ready) {
  const t = get(id);
  line(`   ready   ${id.padEnd(ID_W)}${t.title.padEnd(TITLE_W)}Phi ${f2(phiOf(t))}`);
}
for (const b of plan.blocked) {
  const t = get(b.id);
  line(`   blocked ${b.id.padEnd(ID_W)}${t.title.padEnd(TITLE_W)}until: ${b.until.join(", ")}`);
}
line("");

line("2. DO NOW  -  the ready set by Phi = value / cost (what earns its cost first)");
plan.order.forEach((id, i) => {
  const t = get(id);
  line(`   ${i + 1}. ${id.padEnd(ID_W)}Phi ${f2(phiOf(t))}  (value ${t.value}, cost ${t.cost})`);
});
line("");

line("3. CRITICAL PATH  -  the longest dependency chain by cost (it sets the finish time)");
line(`   ${plan.criticalPath.join(" -> ")}   cost ${plan.criticalCost}`);
const onPath = plan.criticalPath.filter((id) => get(id).status === "todo");
line(`   on it: ${onPath.join(", ")}. Start these early even if their Phi is not the highest.`);
line("");

line("4. WHAT UNBLOCKS THE MOST  -  sensitivity: completing X raises total available value/cost");
const doneProgress: Record<string, number> = {};
const todoKnobs: Record<string, number> = {};
for (const t of TASKS) {
  if (t.status === "done") doneProgress[t.id] = 1;
  else todoKnobs[t.id] = 0;
}
const unblock = rankSensitivity(todoKnobs, (knobs) => totalAvailablePhi({ ...doneProgress, ...knobs }));
for (const r of unblock) {
  const opens = directlyUnblocks(r.name);
  const tail = opens.length ? `  (unblocks ${opens.join(", ")})` : "";
  line(`   ${r.name.padEnd(ID_W)}${signed(r.gradient)}${tail}`);
}
line(`   tune first: ${unblock[0]?.name ?? "n/a"} (largest unblock).`);
line("");

// 5. SELF-CHECK - every claim is hand-derivable from the seed data above.
line("5. SELF-CHECK");
const readySorted = [...plan.ready].sort();
const moveAssets = plan.blocked.find((b) => b.id === "move-assets");
const checks: Array<[string, boolean]> = [
  ["ready set is auth, ci, storage-adapter", JSON.stringify(readySorted) === JSON.stringify(["auth", "ci", "storage-adapter"])],
  ["do-now top is ci (highest Phi)", plan.doNow === "ci"],
  ["move-assets blocked until storage-adapter", !!moveAssets && JSON.stringify(moveAssets.until) === JSON.stringify(["storage-adapter"])],
  ["critical path is scaffold -> auth -> tests -> ship-v1 (cost 10)", plan.criticalPath.join(" -> ") === "scaffold -> auth -> tests -> ship-v1" && plan.criticalCost === 10],
  ["top unblock is storage-adapter", unblock[0]?.name === "storage-adapter"],
];
let ok = true;
for (const [label, pass] of checks) {
  line(`   ${pass ? "ok  " : "FAIL"} ${label}`);
  if (!pass) ok = false;
}
line(ok ? "\nPASS" : "\nFAIL");
if (!ok) process.exitCode = 1;
