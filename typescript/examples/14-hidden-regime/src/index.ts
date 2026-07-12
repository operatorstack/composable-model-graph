import {
  type CandidateState,
  type TransitionCost,
  decodePath,
} from "@composable-model-graph/estimation";

/**
 * Example 14 — Hidden regime (a hidden-state sequence)
 *
 * A machine runs in one of three hidden regimes — idle, normal, overload — and
 * we only see a coarse sensor symbol each tick (low / mid / high power draw).
 * We recover the regime sequence. Each step's candidates are the three regimes,
 * scored by how well they explain the observed symbol; the transition cost
 * penalizes regime changes (by how far they jump: idle=0, normal=1, overload=2).
 *
 * This is the Viterbi / HMM story told without any probability prerequisite: a
 * single spurious "mid" reading inside an overload run should not flip the
 * inferred regime, because the transition model makes the round trip too
 * expensive. With free transitions (weight 0) it flips; with the transition
 * model it holds.
 */

const REGIMES = ["idle", "normal", "overload"];
const REGIME_LEVEL: Record<string, number> = { idle: 0, normal: 1, overload: 2 };

// Emission score: how well each regime explains an observed symbol (higher = better).
const EMISSION: Record<string, Record<string, number>> = {
  idle: { low: 2, mid: 0, high: -2 },
  normal: { low: 0, mid: 2, high: 0 },
  overload: { low: -2, mid: 0, high: 2 },
};

const OBSERVATIONS = ["low", "high", "high", "mid", "high", "high", "low"];

const trellis: CandidateState[][] = OBSERVATIONS.map((symbol) =>
  REGIMES.map((regime) => ({
    id: regime,
    score: EMISSION[regime]![symbol]!,
    value: REGIME_LEVEL[regime]!,
  })),
);

// Cost of a regime change: a flat penalty for switching at all, plus how far it
// jumps. Staying put is free. Tuned so a one-tick blip can't pay for the round
// trip out of a regime and back, but a sustained shift still can.
const cost: TransitionCost = (prev, next) => {
  const d = Math.abs((prev.value as number) - (next.value as number));
  return d === 0 ? 0 : d + 1;
};

console.log("Hidden regime: infer idle / normal / overload from sensor symbols\n");
console.log(`  observed symbols:  ${OBSERVATIONS.join("  ")}`);
console.log("");

const free = decodePath(trellis, { transitionCost: cost, transitionWeight: 0 });
const inferred = decodePath(trellis, { transitionCost: cost, transitionWeight: 1 });

console.log(`  weight 0 (per-symbol):   ${free.stateIds.join("  ")}`);
console.log(`  weight 1 (with regime):  ${inferred.stateIds.join("  ")}`);

console.log("\n  the divergent tick:");
for (let t = 0; t < OBSERVATIONS.length; t++) {
  if (free.stateIds[t] !== inferred.stateIds[t]) {
    console.log(
      `    step ${t} saw "${OBSERVATIONS[t]}": per-symbol reads ${free.stateIds[t]}, but the sequence stays ${inferred.stateIds[t]}`,
    );
  }
}

console.log(
  "\nReading: the lone \"mid\" during the overload run is a blip. Judged alone it",
);
console.log(
  "looks like normal; judged as part of the sequence, staying in overload is",
);
console.log("cheaper than dropping to normal and climbing back.");
