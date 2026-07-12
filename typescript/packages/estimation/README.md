# @composable-model-graph/estimation

Decode the best **path** through a sequence of per-step candidate states — the
shared skeleton of Viterbi decoding, HMM inference, and fixed-lag smoothing,
with the probability story left optional. No dependency on the rest of the
library; it is a pure algorithm over plain data.

```ts
import { decodePath, decodePathFixedLag } from "@composable-model-graph/estimation";

const steps = [
  [{ id: "a", score: 5 }, { id: "b", score: 0 }],
  [{ id: "a", score: 3 }, { id: "b", score: 6 }],
];

// full (Viterbi) decode; transition cost penalizes changing state
const path = decodePath(steps, {
  transitionCost: (prev, next) => (prev.id === next.id ? 0 : 4),
  transitionWeight: 1,
});
path.stateIds;    // best path
path.totalScore;  // sum(score) - weight * sum(cost)
path.steps;       // per-step: score, transitionCost paid, cumulativeScore

// causal variant for streaming (lag 0 = filtering; lag >= T-1 == decodePath)
decodePathFixedLag(steps, 1, { /* same options */ });
```

- `transitionWeight` is the one knob: `0` makes the decode the independent
  per-step argmax; larger values smooth over a noisy step whose neighbours
  disagree.
- The `DecodedPath` exposes *why* each state won — its own score, the transition
  cost paid to enter it, and the cumulative path score.

See [`docs/06-sequential-estimation.md`](../../../docs/06-sequential-estimation.md)
for the theory and a worked example, and examples `13`–`15` for the primitive in
tracking, hidden-state inference, and text.
