import {
  type CandidateState,
  type TransitionCost,
  decodePath,
  decodePathFixedLag,
} from "@composable-model-graph/estimation";

/**
 * Example 13 — Track snapping (tracking / signal processing)
 *
 * A noisy 1-D sensor is sampled over time; we snap the track to a discrete grid
 * of levels. Each step, every grid level is a candidate scored by how close it
 * is to the reading: score = -(reading - level)^2 (0 is a perfect match). The
 * transition cost is (levelDelta)^2 — big jumps between consecutive levels are
 * implausible.
 *
 * The reading at step 3 spikes. With free transitions the snap copies the
 * sensor and follows the spike; with a transition penalty it holds the track
 * and treats the spike as noise. This is the estimation primitive doing what a
 * tracker does — no probabilities required.
 */

const GRID = [0, 1, 2, 3, 4, 5];
const READINGS = [1, 1, 2, 5, 2, 1, 1]; // spike at step 3

// One trellis step per reading: every grid level is a candidate.
const trellis: CandidateState[][] = READINGS.map((reading) =>
  GRID.map((level) => ({
    id: String(level),
    score: -((reading - level) ** 2),
    value: level,
  })),
);

const cost: TransitionCost = (prev, next) =>
  ((prev.value as number) - (next.value as number)) ** 2;

// render whole numbers without a trailing ".0" (TS/Python byte-parity)
const fmt = (x: number): string => String(x);

const line = (label: string, ids: string[], total: number): void => {
  console.log(`  ${label.padEnd(30)} ${ids.join(" ")}   total ${fmt(total)}`);
};

console.log("Track snapping: fit a noisy 1-D sensor track to a discrete grid\n");
console.log(`  readings (grid 0..5):          ${READINGS.join(" ")}   <- spike at step 3\n`);

const free = decodePath(trellis, { transitionCost: cost, transitionWeight: 0 });
const smooth = decodePath(trellis, { transitionCost: cost, transitionWeight: 1 });
const causal = decodePathFixedLag(trellis, 0, { transitionCost: cost, transitionWeight: 1 });
const lookahead = decodePathFixedLag(trellis, 2, { transitionCost: cost, transitionWeight: 1 });

line("weight 0 (trust each reading):", free.stateIds, free.totalScore);
line("weight 1 (stay coherent):", smooth.stateIds, smooth.totalScore);
line("fixed-lag 0 (causal filter):", causal.stateIds, causal.totalScore);
line("fixed-lag 2 (2-step lookahead):", lookahead.stateIds, lookahead.totalScore);

console.log("\n  per-step split (weight 1): level  score  transitionCost  cumulative");
for (const step of smooth.steps) {
  console.log(
    `    step ${step.stepIndex}  level ${step.stateId}   ${fmt(step.score).padStart(3)}   ${fmt(step.transitionCost).padStart(3)}          ${fmt(step.cumulativeScore)}`,
  );
}

console.log(
  "\nReading: with free transitions the snap copies the sensor and takes the spike",
);
console.log(
  "up to level 5; with a transition penalty it holds the track and reads the spike",
);
console.log(
  "as noise. Full lookahead sees the spike is a detour; the causal filter is the",
);
console.log("cheapest build and commits from the past alone.");
