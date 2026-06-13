import type { EvaluationStatus, GraphRun, TraceStep } from "./types.js";

/** Aggregated value of one numeric signal across two runs. */
export interface SignalDelta {
  /** Total for run A. */
  a: number;
  /** Total for run B. */
  b: number;
  /** `b - a`. Negative means B used less of the signal. */
  delta: number;
}

/** A structured, domain-neutral comparison of two graph runs. */
export interface RunComparison {
  /** Which run is better by evaluation, or `tie`. */
  better: "a" | "b" | "tie";
  /** Human-readable explanation of the verdict. */
  reason: string;
  /** Evaluation status of each run. */
  status: { a?: EvaluationStatus; b?: EvaluationStatus };
  /** Evaluation score of each run and `b - a` (higher is better). */
  score: { a?: number; b?: number; delta?: number };
  /** Evaluation error of each run and `b - a` (lower is better). */
  error: { a?: number; b?: number; delta?: number };
  /**
   * Numeric signals aggregated across each run's trace. `durationMs` is always
   * present; any numeric value recorded via `recordSignal` (e.g. `tokens`,
   * `costUsd`) is summed per key.
   */
  signals: Record<string, SignalDelta>;
  /**
   * Index of the first trace step where the runs diverge (by transform id or
   * output). Undefined when both traces are identical step-for-step.
   */
  divergedAtStep?: number;
}

const STATUS_RANK: Record<EvaluationStatus, number> = {
  pass: 3,
  partial: 2,
  fail: 1,
  unknown: 0,
};

/** Sum `durationMs` plus every numeric `metadata` signal across a trace. */
function aggregateSignals(trace: ReadonlyArray<TraceStep>): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const step of trace) {
    totals.durationMs = (totals.durationMs ?? 0) + step.durationMs;
    if (!step.metadata) {
      continue;
    }
    for (const [key, value] of Object.entries(step.metadata)) {
      if (typeof value === "number" && Number.isFinite(value)) {
        totals[key] = (totals[key] ?? 0) + value;
      }
    }
  }
  return totals;
}

function diffSignals(
  a: Record<string, number>,
  b: Record<string, number>,
): Record<string, SignalDelta> {
  const signals: Record<string, SignalDelta> = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const av = a[key] ?? 0;
    const bv = b[key] ?? 0;
    signals[key] = { a: av, b: bv, delta: bv - av };
  }
  return signals;
}

function firstDivergentStep(
  a: ReadonlyArray<TraceStep>,
  b: ReadonlyArray<TraceStep>,
): number | undefined {
  const shared = Math.min(a.length, b.length);
  for (let i = 0; i < shared; i++) {
    const sa = a[i]!;
    const sb = b[i]!;
    if (
      sa.transformId !== sb.transformId ||
      JSON.stringify(sa.output) !== JSON.stringify(sb.output)
    ) {
      return i;
    }
  }
  return a.length === b.length ? undefined : shared;
}

/**
 * Compare two completed graph runs.
 *
 * The verdict ranks by evaluation status first (pass > partial > fail >
 * unknown), then by higher score, then by lower error. Signals are aggregated
 * but never decide the verdict — they describe the cost of each run so the
 * caller can weigh quality against capacity (tokens, cost, latency).
 */
export function compareRuns<I, O>(
  a: GraphRun<I, O>,
  b: GraphRun<I, O>,
): RunComparison {
  const statusA = a.evaluation?.status;
  const statusB = b.evaluation?.status;
  const scoreA = a.evaluation?.score;
  const scoreB = b.evaluation?.score;
  const errorA = a.evaluation?.error;
  const errorB = b.evaluation?.error;

  let better: RunComparison["better"] = "tie";
  let reason = "runs are equivalent on the available evaluation";

  const rankA = statusA ? STATUS_RANK[statusA] : -1;
  const rankB = statusB ? STATUS_RANK[statusB] : -1;

  if (rankA !== rankB) {
    better = rankB > rankA ? "b" : "a";
    reason = `${better.toUpperCase()} has the better status (${statusA ?? "none"} vs ${statusB ?? "none"})`;
  } else if (scoreA !== undefined && scoreB !== undefined && scoreA !== scoreB) {
    better = scoreB > scoreA ? "b" : "a";
    reason = `${better.toUpperCase()} has the higher score (${scoreA} vs ${scoreB})`;
  } else if (errorA !== undefined && errorB !== undefined && errorA !== errorB) {
    better = errorB < errorA ? "b" : "a";
    reason = `${better.toUpperCase()} has the lower error (${errorA} vs ${errorB})`;
  }

  return {
    better,
    reason,
    status: { a: statusA, b: statusB },
    score: {
      a: scoreA,
      b: scoreB,
      delta:
        scoreA !== undefined && scoreB !== undefined
          ? scoreB - scoreA
          : undefined,
    },
    error: {
      a: errorA,
      b: errorB,
      delta:
        errorA !== undefined && errorB !== undefined
          ? errorB - errorA
          : undefined,
    },
    signals: diffSignals(aggregateSignals(a.trace), aggregateSignals(b.trace)),
    divergedAtStep: firstDivergentStep(a.trace, b.trace),
  };
}
