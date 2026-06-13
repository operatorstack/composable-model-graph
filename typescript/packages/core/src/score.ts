/**
 * Useful-flow scoring: Phi = Q / C.
 *
 * The principle (network flow / operations research). Treat a run as flow from a
 * source (the task) to an accepted sink (a verified result). Not all of that flow
 * is useful: some budget is spent on cost (tokens, time, money, retries). The
 * useful-flow score is the quality that reaches the sink per unit of cost spent to
 * get it:
 *
 *   Phi = Q / C
 *
 * where Q aggregates quality (correctness, completeness, confidence, ...) and C
 * aggregates cost (tokens, latency, money, retries, ...). This is the one quantity
 * three fields already share a name for: an engineer's "useful output per dollar,"
 * an OR analyst's "throughput per unit capacity," and a systems reading of
 * max-flow where the bottleneck caps the useful flow. Higher Phi is a better run;
 * comparing Phi across configurations is the cheapest honest way to ask "which one
 * earns its cost?"
 *
 * It is a scoring lens, not a theorem: you choose the terms and weights of Q and
 * C. combineCost / combineQuality make that choice explicit and inspectable.
 */
export interface UsefulFlowScore {
  /** Aggregate quality reaching the accepted sink. */
  quality: number;
  /** Aggregate cost spent. */
  cost: number;
  /** Phi = quality / cost (0 when cost <= 0, to avoid blow-ups). */
  score: number;
}

/** Phi(run) = Q / C. Returns 0 when cost is non-positive. */
export function usefulFlowScore(quality: number, cost: number): UsefulFlowScore {
  const score = cost > 0 ? quality / cost : 0;
  return { quality, cost, score };
}

/** Named numeric terms (e.g. `{ tokens: 1200, latency: 0.4 }`). */
export type Terms = Record<string, number>;
/** Per-term weights; missing weights count as 0. */
export type Weights = Record<string, number>;

/**
 * Default cost weighting: count raw token/compute cost only. A domain re-weights
 * to also value latency, money, retries, human effort, or risk.
 */
const DEFAULT_COST_WEIGHTS: Weights = {
  tokens: 1,
  latency: 0,
  money: 0,
  retries: 0,
  human: 0,
  risk: 0,
};

/**
 * Weighted sum of named cost terms: C = sum_k weight[k] * term[k]. Missing terms
 * count as 0, so a caller only supplies what it has.
 */
export function combineCost(terms: Terms, weights: Weights = {}): number {
  const w = { ...DEFAULT_COST_WEIGHTS, ...weights };
  return Object.keys(w).reduce((sum, k) => sum + (terms[k] ?? 0) * (w[k] ?? 0), 0);
}

/** Default quality weighting: each named quality term counts equally. */
const DEFAULT_QUALITY_WEIGHTS: Weights = {
  correctness: 1,
  completeness: 1,
  confidence: 1,
  relation: 1,
  scope: 1,
};

/** Weighted sum of named quality terms: Q = sum_k weight[k] * term[k]. */
export function combineQuality(terms: Terms, weights: Weights = {}): number {
  const w = { ...DEFAULT_QUALITY_WEIGHTS, ...weights };
  return Object.keys(w).reduce((sum, k) => sum + (terms[k] ?? 0) * (w[k] ?? 0), 0);
}
