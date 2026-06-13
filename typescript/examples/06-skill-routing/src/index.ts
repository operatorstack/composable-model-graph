import {
  compareRuns,
  createModelGraph,
  createTransform,
  type GraphRun,
  type ModelGraph,
  type RunComparison,
} from "@composable-model-graph/core";
import { exactMatchEvaluator } from "@composable-model-graph/evaluators";

/**
 * Example 06 — Skill Routing (inspect + compare)
 *
 * The thesis in one runnable demo: a model-powered system becomes inspectable
 * and comparable when it is a graph. We route coding tasks to the right "skill"
 * two ways and compare the runs:
 *
 *   Graph A  task -> naive keyword route -> skill            (no structured context)
 *   Graph B  task -> extract requirements -> select skill    (structured context)
 *
 * Each step records signals (tokens, cost) via ctx.recordSignal. An exact-match
 * evaluator scores chosen-skill vs expected-skill. The report shows accuracy,
 * cost, latency, and WHERE error enters in the trace — not just a final number.
 */

interface Skill {
  /** Skill identifier (also the routing answer). */
  id: string;
  /** The single obvious keyword a naive router keys on. */
  primary: string;
  /** Full keyword set a structured router scores against. */
  tags: string[];
}

interface RoutingTask {
  taskText: string;
  expectedSkill: string;
}

const SKILLS: Skill[] = [
  {
    id: "payment-webhook-skill",
    primary: "webhook",
    tags: ["webhook", "stripe", "idempotency", "payment", "signature", "charge"],
  },
  {
    id: "auth-session-skill",
    primary: "auth",
    tags: ["auth", "login", "session", "jwt", "oauth", "token", "password"],
  },
  {
    id: "db-migration-skill",
    primary: "migration",
    tags: ["migration", "schema", "sql", "drizzle", "postgres", "index", "column"],
  },
  {
    id: "ui-form-skill",
    primary: "form",
    tags: ["form", "react", "validation", "input", "component", "field", "submit"],
  },
  {
    id: "email-notification-skill",
    primary: "email",
    tags: ["email", "smtp", "template", "notification", "send", "inbox"],
  },
];

const TASKS: RoutingTask[] = [
  { taskText: "Fix Stripe webhook idempotency failing test", expectedSkill: "payment-webhook-skill" },
  { taskText: "Webhook endpoint returns 200 but charge not marked paid", expectedSkill: "payment-webhook-skill" },
  { taskText: "Stripe signature verification rejects valid events", expectedSkill: "payment-webhook-skill" },
  { taskText: "Login session expires too early after refresh", expectedSkill: "auth-session-skill" },
  { taskText: "JWT token not validated on protected routes", expectedSkill: "auth-session-skill" },
  { taskText: "Users stay logged in after password reset", expectedSkill: "auth-session-skill" },
  { taskText: "Schema migration drops column on rollback", expectedSkill: "db-migration-skill" },
  { taskText: "Postgres index not created after deploy", expectedSkill: "db-migration-skill" },
  { taskText: "Drizzle schema out of sync with database", expectedSkill: "db-migration-skill" },
  { taskText: "Form validation passes on empty required input", expectedSkill: "ui-form-skill" },
  { taskText: "React component re-renders and clears field value", expectedSkill: "ui-form-skill" },
  { taskText: "Submit button stays disabled after valid entry", expectedSkill: "ui-form-skill" },
  { taskText: "Email template renders broken on mobile inbox", expectedSkill: "email-notification-skill" },
  { taskText: "SMTP send fails silently for notification queue", expectedSkill: "email-notification-skill" },
  { taskText: "Index page form submit triggers a payment charge", expectedSkill: "ui-form-skill" },
];

/** Cost per token (USD). Static demo rate; only the relative cost matters. */
const RATE = 0.00002;
const REGISTRY_TOKENS = SKILLS.reduce((n, s) => n + s.tags.length, 0);

const words = (text: string): string[] => text.split(/\s+/).filter(Boolean);
const round6 = (x: number): number => Math.round(x * 1e6) / 1e6;

// ----- Graph A: naive single-keyword routing (no structured context) -----

const naiveRoute = createTransform<RoutingTask, string>({
  id: "naive-route",
  name: "Naive keyword route",
  run: (task, ctx) => {
    const tokens = words(task.taskText).length;
    ctx.recordSignal?.("tokens", tokens);
    ctx.recordSignal?.("costUsd", round6(tokens * RATE));

    const text = task.taskText.toLowerCase();
    const hit = SKILLS.find((s) => text.includes(s.primary));
    // No keyword matched: fall back to the most common skill (a naive prior).
    return hit ? hit.id : SKILLS[0]!.id;
  },
});

const graphA: ModelGraph<RoutingTask, string> = createModelGraph<RoutingTask, string>({
  id: "skill-route-a",
  name: "Graph A — naive route",
  transforms: [naiveRoute],
  evaluator: exactMatchEvaluator<string>(),
});

// ----- Graph B: structured routing (extract requirements, score all tags) -----

interface Requirements {
  text: string;
  keywords: string[];
}

const extractRequirements = createTransform<RoutingTask, Requirements>({
  id: "extract-requirements",
  name: "Extract requirements",
  run: (task, ctx) => {
    const keywords = words(task.taskText).map((w) => w.toLowerCase());
    ctx.recordSignal?.("tokens", keywords.length);
    ctx.recordSignal?.("requirementCount", keywords.length);
    return { text: task.taskText, keywords };
  },
});

const selectSkill = createTransform<Requirements, string>({
  id: "select-skill",
  name: "Select skill (tag overlap)",
  run: (req, ctx) => {
    // Structured routing reads the whole skill registry as context: more
    // tokens/cost than Graph A, but the signal it buys is higher accuracy.
    const tokens = req.keywords.length + REGISTRY_TOKENS;
    ctx.recordSignal?.("tokens", tokens);
    ctx.recordSignal?.("costUsd", round6(tokens * RATE));

    const text = req.text.toLowerCase();
    let best = SKILLS[0]!;
    let bestScore = -1;
    for (const skill of SKILLS) {
      const score = skill.tags.filter((tag) => text.includes(tag)).length;
      if (score > bestScore) {
        bestScore = score;
        best = skill;
      }
    }
    return best.id;
  },
});

const graphB: ModelGraph<RoutingTask, string> = createModelGraph<RoutingTask, string>({
  id: "skill-route-b",
  name: "Graph B — structured route",
  transforms: [extractRequirements, selectSkill],
  evaluator: exactMatchEvaluator<string>(),
});

// ----- Run both graphs over the static task set -----

async function runOverTasks(
  graph: ModelGraph<RoutingTask, string>,
  tasks: RoutingTask[],
): Promise<GraphRun<RoutingTask, string>[]> {
  const runs: GraphRun<RoutingTask, string>[] = [];
  for (const task of tasks) {
    runs.push(await graph.run(task, { target: task.expectedSkill }));
  }
  return runs;
}

interface Totals {
  pass: number;
  total: number;
  accuracy: number;
  tokens: number;
  costUsd: number;
  durationMs: number;
}

function totals(runs: GraphRun<RoutingTask, string>[]): Totals {
  let pass = 0;
  let tokens = 0;
  let costUsd = 0;
  let durationMs = 0;
  for (const run of runs) {
    if (run.evaluation?.status === "pass") pass++;
    for (const step of run.trace) {
      durationMs += step.durationMs;
      const m = step.metadata ?? {};
      if (typeof m.tokens === "number") tokens += m.tokens;
      if (typeof m.costUsd === "number") costUsd += m.costUsd;
    }
  }
  return {
    pass,
    total: runs.length,
    accuracy: runs.length === 0 ? 0 : pass / runs.length,
    tokens,
    costUsd: round6(costUsd),
    durationMs,
  };
}

const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;

function printComparison(label: string, cmp: RunComparison): void {
  console.log(`\n${label}`);
  console.log(`  verdict:       ${cmp.better}  (${cmp.reason})`);
  console.log(`  status:        A=${cmp.status.a} B=${cmp.status.b}`);
  console.log(`  score delta:   ${cmp.score.delta ?? "n/a"}`);
  const cost = cmp.signals.costUsd;
  const toks = cmp.signals.tokens;
  if (toks) console.log(`  tokens:        A=${toks.a} B=${toks.b} (delta ${toks.delta})`);
  if (cost) console.log(`  costUsd:       A=${cost.a} B=${cost.b} (delta ${round6(cost.delta)})`);
  console.log(`  diverged@step: ${cmp.divergedAtStep ?? "none"}`);
}

const runsA = await runOverTasks(graphA, TASKS);
const runsB = await runOverTasks(graphB, TASKS);

const tA = totals(runsA);
const tB = totals(runsB);

console.log("Skill Routing — Graph A (naive) vs Graph B (structured)\n");
console.log("Per-task (expected | A | B):");
TASKS.forEach((task, i) => {
  const a = runsA[i]!;
  const b = runsB[i]!;
  const aMark = a.evaluation?.status === "pass" ? "ok  " : "FAIL";
  const bMark = b.evaluation?.status === "pass" ? "ok  " : "FAIL";
  console.log(
    `  ${task.taskText.slice(0, 46).padEnd(48)} ${task.expectedSkill.padEnd(24)} A:${aMark} ${String(a.output).padEnd(24)} B:${bMark} ${b.output}`,
  );
});

console.log("\nAggregate:");
console.log(`  accuracy:   A ${pct(tA.accuracy)}   B ${pct(tB.accuracy)}   (${(tB.accuracy - tA.accuracy >= 0 ? "+" : "")}${((tB.accuracy - tA.accuracy) * 100).toFixed(1)}pp)`);
console.log(`  tokens:     A ${tA.tokens}        B ${tB.tokens}`);
console.log(`  costUsd:    A ${tA.costUsd}    B ${tB.costUsd}`);
console.log(`  durationMs: A ${tA.durationMs}        B ${tB.durationMs}  (wall-clock; tiny for a static demo)`);

// Trace-level failure localization for Graph B.
const failedB = runsB.filter((r) => r.evaluation?.status === "fail");
const extractOkInFailures = failedB.filter((r) => {
  const ex = r.trace.find((s) => s.transformId === "extract-requirements");
  const rc = ex?.metadata?.requirementCount;
  return typeof rc === "number" && rc > 0;
}).length;

console.log("\nTrace-level failure localization (Graph B):");
console.log(`  failed runs: ${failedB.length}/${tB.total}`);
console.log(`  of those, requirement-extraction succeeded in ${extractOkInFailures}/${failedB.length}`);
console.log(`  => error enters at the 'select-skill' step, not 'extract-requirements'`);

// Two representative comparisons: one where B wins, one where A wins (honest).
const bWinsIndex = TASKS.findIndex(
  (_t, i) => runsA[i]!.evaluation?.status === "fail" && runsB[i]!.evaluation?.status === "pass",
);
if (bWinsIndex >= 0) {
  printComparison(
    `compareRuns — task "${TASKS[bWinsIndex]!.taskText}" (B should win):`,
    compareRuns(runsA[bWinsIndex]!, runsB[bWinsIndex]!),
  );
}

const aWinsIndex = TASKS.findIndex(
  (_t, i) => runsA[i]!.evaluation?.status === "pass" && runsB[i]!.evaluation?.status === "fail",
);
if (aWinsIndex >= 0) {
  printComparison(
    `compareRuns — task "${TASKS[aWinsIndex]!.taskText}" (A wins; B's tie-break weakness):`,
    compareRuns(runsA[aWinsIndex]!, runsB[aWinsIndex]!),
  );
}

console.log(
  "\nReading: B is far more accurate but spends more tokens/cost (the registry context).",
);
console.log(
  "The trace shows the tradeoff and where error enters — the system is inspectable, not vibe-based.",
);
