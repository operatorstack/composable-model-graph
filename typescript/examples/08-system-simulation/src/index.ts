import {
  createModelGraph,
  createTransform,
  usefulFlowScore,
} from "@composable-model-graph/core";
import { sigmoid, rankSensitivity } from "@composable-model-graph/math";

/**
 * Example 08 - System simulation (configuration what-if + sensitivity)
 *
 * Simulate one parameterized pipeline across configurations, score each by useful
 * flow (Phi = quality / cost), pick the best, then ask which knob most moves the
 * outcome (sensitivity). Domain-free: the same shape fits a build farm, a data
 * pipeline, or a research loop. It uses only `core` + `math`, so the Python
 * version is identical.
 *
 * Model (a toy with the right shape):
 *   raw quality = (effort - 3) + 0.2 * verifyDepth      bounded to 0..1 via sigmoid
 *   cost        = 1 (base) + 0.5 * effort + 0.3 * parallelism
 *   Phi         = quality / cost
 * Quality has diminishing returns (sigmoid), cost grows linearly, so Phi peaks at
 * a finite effort: spending more eventually costs more than it is worth.
 */

type Knobs = Record<string, number>;

// The model, as pure functions shared by the graph and the sensitivity objective.
const rawQualityOf = (k: Knobs): number => (k.effort ?? 0) - 3 + 0.2 * (k.verifyDepth ?? 0);
const costOf = (k: Knobs): number => 1 + 0.5 * (k.effort ?? 0) + 0.3 * (k.parallelism ?? 0);

// The pipeline as a graph: each stage records its slice of cost; the last stage
// emits the raw (pre-sigmoid) quality. This is what makes the run inspectable.
const ingest = createTransform<Knobs, Knobs>({
  id: "ingest",
  name: "Ingest",
  run: (k, ctx) => {
    ctx.recordSignal?.("cost", 1);
    return k;
  },
});

const processStage = createTransform<Knobs, Knobs>({
  id: "process",
  name: "Process",
  run: (k, ctx) => {
    ctx.recordSignal?.("cost", 0.5 * (k.effort ?? 0));
    return k;
  },
});

const verify = createTransform<Knobs, number>({
  id: "verify",
  name: "Verify",
  run: (k, ctx) => {
    ctx.recordSignal?.("cost", 0.3 * (k.parallelism ?? 0));
    return rawQualityOf(k);
  },
});

const pipeline = createModelGraph<Knobs, number>({
  id: "system-simulation",
  name: "System Simulation",
  transforms: [ingest, processStage, verify],
});

// Run one config through the graph; Phi is computed from the trace's cost signals
// and the bounded quality.
async function runConfig(k: Knobs): Promise<{ phi: number; quality: number; cost: number }> {
  const run = await pipeline.run(k);
  const cost = run.trace.reduce((sum, step) => sum + Number(step.metadata?.cost ?? 0), 0);
  const quality = sigmoid.forward(run.output);
  const { score } = usefulFlowScore(quality, cost);
  return { phi: score, quality, cost };
}

// The same Phi as a pure (sync) objective, for sensitivity. It uses the shared
// model functions, so it agrees with the graph path (asserted below).
const phiOf = (k: Knobs): number =>
  usefulFlowScore(sigmoid.forward(rawQualityOf(k)), costOf(k)).score;

// 1. SWEEP: vary the effort knob, score each config by Phi, pick the best.
const fixed = { parallelism: 4, verifyDepth: 1 };
console.log("1. SWEEP  -  Phi = quality / cost across effort (best earns its cost)");
let best = { effort: 0, phi: -Infinity };
for (let effort = 1; effort <= 6; effort++) {
  const { phi, quality, cost } = await runConfig({ effort, ...fixed });
  console.log(
    `   effort ${effort}: quality ${quality.toFixed(3)}  cost ${cost.toFixed(2)}  Phi ${phi.toFixed(3)}`,
  );
  if (phi > best.phi) best = { effort, phi };
}
console.log(`   best: effort ${best.effort} (Phi ${best.phi.toFixed(3)}). Beyond it, cost outruns quality.\n`);

// 2. SENSITIVITY: at the current config, which knob moves Phi most ("what to tune next").
const current: Knobs = { effort: 2, parallelism: 4, verifyDepth: 1 };
console.log("2. SENSITIVITY  -  d(Phi)/d(knob) at the current config (what to tune next)");
const ranked = rankSensitivity(current, phiOf);
for (const r of ranked) {
  const dir = r.gradient >= 0 ? "raise" : "lower";
  console.log(`   ${r.name.padEnd(12)} gradient ${r.gradient.toFixed(4)}  -> ${dir} it`);
}
console.log(`   tune first: ${ranked[0]?.name ?? "n/a"} (largest magnitude).\n`);

// 3. SELF-CHECK
const graphPhi = (await runConfig(current)).phi;
const checks: Array<[string, boolean]> = [
  ["sweep picks effort 5", best.effort === 5],
  ["sensitivity ranks effort first", ranked[0]?.name === "effort"],
  ["graph Phi agrees with model Phi", Math.abs(graphPhi - phiOf(current)) < 1e-9],
];
let ok = true;
for (const [label, pass] of checks) {
  console.log(`   ${pass ? "ok  " : "FAIL"} ${label}`);
  if (!pass) ok = false;
}
console.log(ok ? "\nPASS" : "\nFAIL");
if (!ok) process.exitCode = 1;
