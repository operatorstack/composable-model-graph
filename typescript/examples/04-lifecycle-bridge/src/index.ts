import { createModelGraph, createTransform } from "@composable-model-graph/core";
import { thresholdEvaluator } from "@composable-model-graph/evaluators";
import { defaultFeedbackResolver } from "@composable-model-graph/feedback";

/**
 * Example 04 — Lifecycle Bridge (generic)
 *
 *   Raw Run Data
 *     -> Signal Extraction
 *     -> Measured State
 *     -> Evaluation
 *     -> Feedback Action
 *
 * This example is intentionally domain-free. It only shows how the same
 * primitive — transform + trace + evaluation + feedback — can model a generic
 * "observe, measure, evaluate, decide" lifecycle. No harness concepts appear
 * here; the private harness is built elsewhere on top of these primitives.
 */

interface RawRunRecord {
  ok: boolean;
  durationMs: number;
}

interface ExtractedSignals {
  total: number;
  successes: number;
  meanDurationMs: number;
}

const rawData: RawRunRecord[] = [
  { ok: true, durationMs: 120 },
  { ok: true, durationMs: 98 },
  { ok: false, durationMs: 210 },
  { ok: true, durationMs: 105 },
  { ok: true, durationMs: 130 },
];

const signalExtraction = createTransform<RawRunRecord[], ExtractedSignals>({
  id: "signal-extraction",
  name: "Signal Extraction",
  run: (records) => {
    const total = records.length;
    const successes = records.filter((record) => record.ok).length;
    const meanDurationMs =
      total === 0
        ? 0
        : records.reduce((sum, record) => sum + record.durationMs, 0) / total;
    return { total, successes, meanDurationMs };
  },
});

const measuredState = createTransform<ExtractedSignals, number>({
  id: "measured-state",
  name: "Measured State",
  run: (signals) =>
    signals.total === 0 ? 0 : signals.successes / signals.total,
});

const graph = createModelGraph<RawRunRecord[], number>({
  id: "lifecycle-bridge",
  name: "Lifecycle Bridge",
  transforms: [signalExtraction, measuredState],
  evaluator: thresholdEvaluator({
    id: "success-rate",
    name: "Success Rate",
    threshold: 0.8,
  }),
  feedbackResolver: defaultFeedbackResolver<RawRunRecord[], number>(),
});

const run = await graph.run(rawData);

console.log("Raw Run Data    ->", JSON.stringify(run.input));
console.log("Signal Extraction ->", JSON.stringify(run.trace[0]?.output));
console.log("Measured State  ->", run.output);
console.log("Evaluation      ->", JSON.stringify(run.evaluation));
console.log("Feedback Action ->", JSON.stringify(run.feedback));
