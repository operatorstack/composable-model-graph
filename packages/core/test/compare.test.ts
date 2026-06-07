import { describe, expect, it } from "vitest";

import {
  compareRuns,
  createEvaluator,
  createModelGraph,
  createTransform,
} from "@composable-model-graph/core";

const evenEvaluator = createEvaluator<number>({
  id: "is-even",
  name: "Is Even",
  evaluate: (output) => ({
    status: output % 2 === 0 ? "pass" : "fail",
    score: output % 2 === 0 ? 1 : 0,
  }),
});

describe("trace signals via recordSignal", () => {
  it("records signals into TraceStep.metadata", async () => {
    const metered = createTransform<number, number>({
      id: "metered",
      name: "Metered",
      run: (input, ctx) => {
        ctx.recordSignal?.("tokens", 12);
        ctx.recordSignal?.("costUsd", 0.5);
        return input + 1;
      },
    });

    const graph = createModelGraph<number, number>({
      id: "g",
      name: "Graph",
      transforms: [metered],
    });

    const run = await graph.run(1);
    expect(run.trace[0]?.metadata).toEqual({ tokens: 12, costUsd: 0.5 });
  });

  it("omits metadata when no signal is recorded", async () => {
    const plain = createTransform<number, number>({
      id: "plain",
      name: "Plain",
      run: (input) => input + 1,
    });

    const graph = createModelGraph<number, number>({
      id: "g",
      name: "Graph",
      transforms: [plain],
    });

    const run = await graph.run(1);
    expect(run.trace[0]?.metadata).toBeUndefined();
  });
});

describe("compareRuns", () => {
  it("prefers the run with the better status and reports signal deltas", async () => {
    const passTransform = createTransform<number, number>({
      id: "to-even",
      name: "To Even",
      run: (input, ctx) => {
        ctx.recordSignal?.("tokens", 5);
        return input * 2; // even -> pass
      },
    });
    const failTransform = createTransform<number, number>({
      id: "to-odd",
      name: "To Odd",
      run: (input, ctx) => {
        ctx.recordSignal?.("tokens", 20);
        return input * 2 + 1; // odd -> fail
      },
    });

    const graphPass = createModelGraph<number, number>({
      id: "pass",
      name: "Pass",
      transforms: [passTransform],
      evaluator: evenEvaluator,
    });
    const graphFail = createModelGraph<number, number>({
      id: "fail",
      name: "Fail",
      transforms: [failTransform],
      evaluator: evenEvaluator,
    });

    const a = await graphFail.run(3); // fail, tokens 20
    const b = await graphPass.run(3); // pass, tokens 5

    const cmp = compareRuns(a, b);
    expect(cmp.better).toBe("b");
    expect(cmp.status).toEqual({ a: "fail", b: "pass" });
    expect(cmp.signals.tokens).toEqual({ a: 20, b: 5, delta: -15 });
    expect(cmp.divergedAtStep).toBe(0);
  });

  it("returns a tie for equivalent runs", async () => {
    const t = createTransform<number, number>({
      id: "double",
      name: "Double",
      run: (input) => input * 2,
    });
    const graph = createModelGraph<number, number>({
      id: "g",
      name: "Graph",
      transforms: [t],
      evaluator: evenEvaluator,
    });

    const a = await graph.run(3);
    const b = await graph.run(3);
    const cmp = compareRuns(a, b);
    expect(cmp.better).toBe("tie");
    expect(cmp.divergedAtStep).toBeUndefined();
  });
});
