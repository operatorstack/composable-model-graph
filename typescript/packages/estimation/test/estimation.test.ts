import { describe, expect, it } from "vitest";

import {
  type CandidateState,
  type TransitionCost,
  decodePath,
  decodePathFixedLag,
} from "@composable-model-graph/estimation";

/**
 * Fixture = the worked example in docs/06-sequential-estimation.md. Three steps,
 * three states per step whose ids double as positions 0/1/2 on a line, cost =
 * |position delta|, and a noise spike at step 1.
 *
 *   scores        pos0  pos1  pos2
 *     step 0        5     0     0
 *     step 1        3     0     6      <- spike at pos 2
 *     step 2        8     0     0
 *
 *   cum[0] = [ 5, 0, 0 ], cum[1] = [ 8, 4, 9 ], cum[2] = [16, 8, 9 ]
 *   best final pos0 (16), full path 0,0,0.
 */
function fixture(): CandidateState[][] {
  const s = (pos: number, score: number): CandidateState => ({
    id: String(pos),
    score,
    value: pos,
  });
  return [
    [s(0, 5), s(1, 0), s(2, 0)],
    [s(0, 3), s(1, 0), s(2, 6)],
    [s(0, 8), s(1, 0), s(2, 0)],
  ];
}

const cost: TransitionCost = (prev, next) =>
  Math.abs((prev.value as number) - (next.value as number));

describe("decodePath", () => {
  it("rejects the spike with the full path (w=1)", () => {
    const path = decodePath(fixture(), { transitionCost: cost, transitionWeight: 1 });
    expect(path.stateIds).toEqual(["0", "0", "0"]);
    expect(path.totalScore).toBe(16);
    expect(path.steps.map((s) => s.cumulativeScore)).toEqual([5, 8, 16]);
    expect(path.steps.map((s) => s.transitionCost)).toEqual([0, 0, 0]);
  });

  it("is per-step argmax when transitionWeight = 0", () => {
    const path = decodePath(fixture(), { transitionCost: cost, transitionWeight: 0 });
    expect(path.stateIds).toEqual(["0", "2", "0"]); // chases the spike
  });

  it("breaks ties toward the lowest index", () => {
    const s = (i: number, score: number): CandidateState => ({ id: `a${i}`, score });
    const path = decodePath([
      [s(0, 1), s(1, 1)],
      [s(0, 1), s(1, 1)],
    ]);
    expect(path.stateIds).toEqual(["a0", "a0"]);
  });

  it("defaults to zero transition cost", () => {
    const path = decodePath([
      [{ id: "x", score: 1 }, { id: "y", score: 3 }],
      [{ id: "p", score: 5 }, { id: "q", score: 2 }],
    ]);
    expect(path.stateIds).toEqual(["y", "p"]);
    expect(path.totalScore).toBe(8);
  });

  it("handles single-step and single-candidate trellises", () => {
    expect(decodePath([[{ id: "only", score: 2 }]]).stateIds).toEqual(["only"]);
    expect(
      decodePath([[{ id: "a", score: 1 }], [{ id: "b", score: 1 }]]).stateIds,
    ).toEqual(["a", "b"]);
  });

  it("throws on an empty trellis or an empty step", () => {
    expect(() => decodePath([])).toThrow("trellis has no steps");
    expect(() => decodePath([[{ id: "a", score: 1 }], []])).toThrow(
      "trellis step 1 has no candidate states",
    );
  });
});

describe("decodePathFixedLag", () => {
  it("equals decodePath at full lookahead (lag = T-1)", () => {
    const full = decodePath(fixture(), { transitionCost: cost, transitionWeight: 1 });
    const lag2 = decodePathFixedLag(fixture(), 2, {
      transitionCost: cost,
      transitionWeight: 1,
    });
    expect(lag2.stateIds).toEqual(full.stateIds);
    expect(lag2.totalScore).toBe(full.totalScore);
  });

  it("is greedy filtering at lag 0 (commits the spike)", () => {
    const path = decodePathFixedLag(fixture(), 0, {
      transitionCost: cost,
      transitionWeight: 1,
    });
    expect(path.stateIds).toEqual(["0", "2", "0"]);
    expect(path.totalScore).toBe(15);
  });

  it("has enough lookahead at lag 1 to reject the spike", () => {
    const path = decodePathFixedLag(fixture(), 1, {
      transitionCost: cost,
      transitionWeight: 1,
    });
    expect(path.stateIds).toEqual(["0", "0", "0"]);
  });

  it("throws on a negative lag", () => {
    expect(() => decodePathFixedLag([[{ id: "a", score: 1 }]], -1)).toThrow(
      "lag must be >= 0",
    );
  });
});
