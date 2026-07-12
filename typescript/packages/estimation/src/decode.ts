import type {
  CandidateState,
  DecodeOptions,
  DecodedPath,
  DecodedStep,
  TransitionCost,
} from "./types.js";

type Steps = ReadonlyArray<ReadonlyArray<CandidateState>>;

const NEG_INF = Number.NEGATIVE_INFINITY;
const ZERO_COST: TransitionCost = () => 0;

function validate(steps: Steps): void {
  if (steps.length === 0) {
    throw new Error("trellis has no steps");
  }
  for (let t = 0; t < steps.length; t++) {
    if (steps[t]!.length === 0) {
      throw new Error(`trellis step ${t} has no candidate states`);
    }
  }
}

/**
 * Forward Viterbi accumulation. `locked` pins chosen steps to a single state
 * index (used by the fixed-lag decoder); unlocked steps consider all states.
 */
function forward(
  steps: Steps,
  weight: number,
  cost: TransitionCost,
  locked: Map<number, number>,
): { cum: number[][]; back: number[][] } {
  const cum: number[][] = [];
  const back: number[][] = [];
  for (let t = 0; t < steps.length; t++) {
    const width = steps[t]!.length;
    cum[t] = new Array<number>(width).fill(NEG_INF);
    back[t] = new Array<number>(width).fill(-1);
    const lock = locked.get(t);
    const allowed = (j: number): boolean => lock === undefined || lock === j;

    if (t === 0) {
      for (let j = 0; j < width; j++) {
        if (allowed(j)) {
          cum[0]![j] = steps[0]![j]!.score;
        }
      }
      continue;
    }

    const prev = steps[t - 1]!;
    for (let j = 0; j < width; j++) {
      if (!allowed(j)) {
        continue;
      }
      let best = NEG_INF;
      let bestI = -1;
      for (let i = 0; i < prev.length; i++) {
        if (cum[t - 1]![i] === NEG_INF) {
          continue; // unreachable predecessor (e.g. locked out)
        }
        const val =
          cum[t - 1]![i]! - weight * cost(prev[i]!, steps[t]![j]!, t);
        if (val > best) {
          // strict > => lowest predecessor index wins ties
          best = val;
          bestI = i;
        }
      }
      cum[t]![j] = steps[t]![j]!.score + best;
      back[t]![j] = bestI;
    }
  }
  return { cum, back };
}

/** Index of the max value in the final step (lowest index wins ties). */
function argmaxFinal(cum: number[][]): number {
  const last = cum[cum.length - 1]!;
  let best = NEG_INF;
  let bestJ = 0;
  for (let j = 0; j < last.length; j++) {
    if (last[j]! > best) {
      best = last[j]!;
      bestJ = j;
    }
  }
  return bestJ;
}

/** Recover chosen state indices for steps 0..t by following backpointers. */
function backtrack(back: number[][], t: number, j: number): number[] {
  const idx = new Array<number>(t + 1);
  idx[t] = j;
  for (let s = t; s > 0; s--) {
    idx[s - 1] = back[s]![idx[s]!]!;
  }
  return idx;
}

/** Build the reported path (scores, per-step transition cost, cumulative). */
function buildPath(
  steps: Steps,
  idx: number[],
  weight: number,
  cost: TransitionCost,
): DecodedPath {
  const out: DecodedStep[] = [];
  let cumulative = 0;
  for (let t = 0; t < steps.length; t++) {
    const state = steps[t]![idx[t]!]!;
    const tc = t === 0 ? 0 : cost(steps[t - 1]![idx[t - 1]!]!, state, t);
    cumulative += state.score - (t === 0 ? 0 : weight * tc);
    out.push({
      stepIndex: t,
      state,
      stateId: state.id,
      score: state.score,
      transitionCost: tc,
      cumulativeScore: cumulative,
    });
  }
  return {
    steps: out,
    stateIds: out.map((s) => s.stateId),
    totalScore: cumulative,
  };
}

/**
 * Full-path (Viterbi) decode: the single best path through the whole trellis.
 * A choice at one step may be revised by evidence at any later step.
 */
export function decodePath(steps: Steps, options: DecodeOptions = {}): DecodedPath {
  validate(steps);
  const weight = options.transitionWeight ?? 1;
  const cost = options.transitionCost ?? ZERO_COST;
  const { cum, back } = forward(steps, weight, cost, new Map());
  const jFinal = argmaxFinal(cum);
  const idx = backtrack(back, steps.length - 1, jFinal);
  return buildPath(steps, idx, weight, cost);
}

/**
 * Causal decode for streaming: commit the state at step `t - lag` once `lag`
 * more steps have been seen. `lag = 0` is pure filtering (commit each step from
 * the past alone); `lag >= steps.length - 1` reproduces {@link decodePath}.
 */
export function decodePathFixedLag(
  steps: Steps,
  lag: number,
  options: DecodeOptions = {},
): DecodedPath {
  validate(steps);
  if (lag < 0) {
    throw new Error("lag must be >= 0");
  }
  const weight = options.transitionWeight ?? 1;
  const cost = options.transitionCost ?? ZERO_COST;
  const T = steps.length;
  const committed = new Map<number, number>();

  for (let t = 0; t < T; t++) {
    const prefix = steps.slice(0, t + 1);
    const { cum, back } = forward(prefix, weight, cost, committed);
    if (t >= lag) {
      const k = t - lag;
      const jT = argmaxFinal(cum);
      const path = backtrack(back, t, jT);
      committed.set(k, path[k]!);
    }
  }

  // Commit any remaining (tail) steps from the full backtrack under constraints.
  const { cum, back } = forward(steps, weight, cost, committed);
  const full = backtrack(back, T - 1, argmaxFinal(cum));
  const idx = new Array<number>(T);
  for (let k = 0; k < T; k++) {
    idx[k] = committed.has(k) ? committed.get(k)! : full[k]!;
  }
  return buildPath(steps, idx, weight, cost);
}
