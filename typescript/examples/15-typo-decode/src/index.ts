import {
  type CandidateState,
  type TransitionCost,
  decodePath,
} from "@composable-model-graph/estimation";

/**
 * Example 15 — Typo decoding (a text / sequence-labeling problem)
 *
 * Recover the intended word from a mistyped one. At each position the
 * candidates are the typed letter (score 0, it's what you saw) plus its
 * keyboard neighbors (score -1, plausible slips). The transition cost is 0 for a
 * letter pair the language allows and 1 for one it does not (a tiny bigram
 * "language model"). The decode trades a small per-key penalty for a coherent
 * word.
 *
 * With free transitions (weight 0) it just echoes what was typed; with the
 * bigram model it corrects the slip. No probabilities, no dictionary lookup —
 * the same trellis decode as tracking and HMMs, over letters.
 */

// Keyboard neighbours (partial QWERTY, only the letters this example needs).
const NEIGHBORS: Record<string, string[]> = {
  c: ["x", "d", "f", "v"],
  h: ["g", "y", "u", "j", "n", "b"],
  s: ["a", "w", "e", "d", "x", "z"],
  i: ["u", "j", "k", "o"],
  r: ["e", "d", "f", "t"],
};

// Allowed letter pairs — the bigrams of the intended word "chair".
const ALLOWED = new Set(["ch", "ha", "ai", "ir"]);

const TYPED = "chsir"; // intended "chair"; the 'a' slipped to its neighbour 's'

const trellis: CandidateState[][] = [...TYPED].map((typed) => {
  const letters = [typed, ...(NEIGHBORS[typed] ?? [])];
  return letters.map((letter, k) => ({
    id: letter,
    score: k === 0 ? 0 : -1, // typed letter is free; a neighbour costs 1
    value: letter,
  }));
});

const cost: TransitionCost = (prev, next) =>
  ALLOWED.has(`${prev.value as string}${next.value as string}`) ? 0 : 1;

const word = (ids: string[]): string => ids.join("");

console.log("Typo decoding: recover the intended word from a mistyped one\n");
console.log(`  typed:                 ${[...TYPED].join(" ")}   ("${TYPED}")`);

const echo = decodePath(trellis, { transitionCost: cost, transitionWeight: 0 });
const corrected = decodePath(trellis, { transitionCost: cost, transitionWeight: 1 });

console.log(`  weight 0 (per-key):    ${echo.stateIds.join(" ")}   ("${word(echo.stateIds)}")`);
console.log(`  weight 1 (+ bigrams):  ${corrected.stateIds.join(" ")}   ("${word(corrected.stateIds)}")`);

console.log("\n  correction:");
for (let t = 0; t < TYPED.length; t++) {
  if (echo.stateIds[t] !== corrected.stateIds[t]) {
    console.log(
      `    position ${t}: typed '${echo.stateIds[t]}' -> '${corrected.stateIds[t]}' (neighbour that fits the allowed bigrams)`,
    );
  }
}

console.log(
  "\nReading: read key by key, the slip stands ('chsir'). Read as a word, the",
);
console.log(
  "neighbour 'a' pays one key penalty but removes two disallowed letter pairs -",
);
console.log("so the decode recovers 'chair'.");
