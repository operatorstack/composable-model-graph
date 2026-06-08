import {
  createModelGraph,
  createTransform,
  type GraphRun,
} from "@composable-model-graph/core";
import { exactMatchEvaluator } from "@composable-model-graph/evaluators";
import { withContract, header, selfCheck, type ContractResult } from "./shared.js";

/**
 * Demo A — Sensor / signed-signal aggregation
 *
 * Pipeline:  parse-measurements -> normalize-signal -> aggregate-state
 *
 * Every node returns a valid number[] / number and none throws. But
 * `normalize-signal` has a FAULT: to "remove small noise" it takes abs(v) for
 * any |v| < 50, silently changing -10 to 10. The numeric shape and finiteness
 * are preserved, but the sign — the relation that matters — is corrupted.
 *
 * Expected relation: if the input signal is flipped, the aggregate should flip.
 *   state(-x) = -state(x)
 */

const SENSOR_READINGS = [100, -250, 75, -10];
const EXPECTED_STATE = SENSOR_READINGS.reduce((a, v) => a + v, 0); // -85

const parseMeasurements = createTransform<number[], number[]>({
  id: "parse-measurements",
  name: "parse-measurements",
  run: (readings) => [...readings],
});

const normalizeSignal = createTransform<number[], number[]>({
  id: "normalize-signal",
  name: "normalize-signal",
  // FAULT: "denoise" small readings with abs(). Preserves finite numeric shape,
  // but destroys sign/direction information for small negative readings.
  run: (readings) => readings.map((v) => (Math.abs(v) < 50 ? Math.abs(v) : v)),
});

const aggregateState = createTransform<number[], number>({
  id: "aggregate-state",
  name: "aggregate-state",
  run: (readings) => readings.reduce((acc, v) => acc + v, 0),
});

// Node contracts (declared local expectations) ------------------------------

const sameShapeFinite = (input: number[], output: number[]): ContractResult => {
  if (output.length !== input.length) {
    return { ok: false, detail: `length changed ${input.length} -> ${output.length}` };
  }
  return { ok: output.every(Number.isFinite), detail: "non-finite output" };
};

const signPreserved = (input: number[], output: number[]): ContractResult => {
  for (let i = 0; i < input.length; i++) {
    if (Math.sign(input[i]!) !== Math.sign(output[i]!)) {
      return { ok: false, detail: `sign corrupted at index ${i}: ${input[i]} -> ${output[i]}` };
    }
  }
  return { ok: true };
};

const finiteNumber = (_input: number[], output: number): ContractResult => ({
  ok: Number.isFinite(output),
});

const graph = createModelGraph<number[], number>({
  id: "signed-signal-aggregation",
  name: "signed-signal-aggregation",
  transforms: [
    withContract(parseMeasurements, sameShapeFinite),
    withContract(normalizeSignal, signPreserved),
    withContract(aggregateState, finiteNumber),
  ],
  evaluator: exactMatchEvaluator<number>(),
});

// Trace Relation Check helpers (no oracle needed) ---------------------------

const negate = (x: number[]): number[] => x.map((v) => -v);
const approx = (a: number, b: number): boolean => Math.abs(a - b) < 1e-9;

function relationHolds(outX: unknown, outNegX: unknown): boolean {
  if (Array.isArray(outX) && Array.isArray(outNegX)) {
    return (
      outX.length === outNegX.length &&
      outX.every((v, i) => approx(-(v as number), outNegX[i] as number))
    );
  }
  if (typeof outX === "number" && typeof outNegX === "number") {
    return approx(-outX, outNegX);
  }
  return false;
}

/**
 * Walk two traces and return the first step where the expected relation
 * output(-x) == -output(x) breaks. That step is where the useful signal was
 * corrupted — found without any oracle or declared contract.
 */
function firstRelationBreak(
  runX: GraphRun<number[], number>,
  runNegX: GraphRun<number[], number>,
): number | undefined {
  const n = Math.min(runX.trace.length, runNegX.trace.length);
  for (let i = 0; i < n; i++) {
    if (!relationHolds(runX.trace[i]!.output, runNegX.trace[i]!.output)) return i;
  }
  return undefined;
}

export async function runSensor(): Promise<boolean> {
  header("Demo A — Sensor / signed-signal aggregation");

  const run = await graph.run(SENSOR_READINGS, { target: EXPECTED_STATE });
  const runNeg = await graph.run(negate(SENSOR_READINGS));

  console.log(`\n  pipeline:        parse-measurements -> normalize-signal -> aggregate-state`);
  console.log(`  input:           ${JSON.stringify(SENSOR_READINGS)}`);
  console.log(`  expected state:  ${EXPECTED_STATE}`);
  console.log(`  system output:   ${run.output}`);

  console.log(`\n  Every node ran without error and returned valid shape:`);
  for (const step of run.trace) {
    console.log(`    ${step.transformName.padEnd(20)} output=${JSON.stringify(step.output)}`);
  }

  console.log(`\n  [1] Final Answer Check (needs a known target):`);
  console.log(`    status=${run.evaluation?.status}  (expected ${EXPECTED_STATE}, got ${run.output})`);
  console.log(`    => detects THAT the system output is wrong, not WHERE.`);

  console.log(`\n  [2] Node Contract Check (declared local expectations, read from the trace):`);
  for (const step of run.trace) {
    const ok = step.metadata?.contractOk;
    const detail = step.metadata?.contractDetail;
    const mark = ok === false ? "BROKE" : "ok   ";
    console.log(`    ${mark} ${step.transformName}${detail ? `  (${detail})` : ""}`);
  }
  const faultyStep = run.trace.find((s) => s.metadata?.contractOk === false);
  console.log(`    => trace localization: ${faultyStep?.transformName ?? "none"}`);

  console.log(`\n  [3] Trace Relation Check (no target, no declared contract):`);
  console.log(`    expected relation: output(-x) == -output(x)`);
  const breakIdx = firstRelationBreak(run, runNeg);
  if (breakIdx === undefined) {
    console.log(`    relation holds at every step (no break found)`);
  } else {
    const faulty = run.trace[breakIdx]!;
    console.log(`    first break at step ${breakIdx}: ${faulty.transformName}`);
    console.log(`      output(x)  = ${JSON.stringify(faulty.output)}`);
    console.log(`      output(-x) = ${JSON.stringify(runNeg.trace[breakIdx]!.output)}`);
    console.log(`    => trace localization by inspecting the trace alone.`);
  }

  return selfCheck("sensor", [
    ["final answer check detects failure", run.evaluation?.status === "fail"],
    ["node contract localizes to normalize-signal", faultyStep?.transformId === "normalize-signal"],
    ["trace relation breaks at step 1", breakIdx === 1],
  ]);
}
