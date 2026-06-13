import { describe, expect, it } from "vitest";

import type { RunContext } from "@composable-model-graph/core";
import {
  compositeEvaluator,
  exactMatchEvaluator,
  numericErrorEvaluator,
  thresholdEvaluator,
} from "@composable-model-graph/evaluators";

const context: RunContext = { runId: "test-run" };

describe("thresholdEvaluator", () => {
  it("passes when the value meets the threshold", async () => {
    const evaluator = thresholdEvaluator({ threshold: 0.5 });
    const result = await evaluator.evaluate(0.8, undefined, context);
    expect(result.status).toBe("pass");
    expect(result.score).toBe(1);
  });

  it("fails when the value misses the threshold", async () => {
    const evaluator = thresholdEvaluator({ threshold: 0.5 });
    const result = await evaluator.evaluate(0.2, undefined, context);
    expect(result.status).toBe("fail");
    expect(result.score).toBe(0);
  });

  it("supports an atMost direction", async () => {
    const evaluator = thresholdEvaluator({ threshold: 1, direction: "atMost" });
    expect((await evaluator.evaluate(0.5, undefined, context)).status).toBe(
      "pass",
    );
    expect((await evaluator.evaluate(2, undefined, context)).status).toBe(
      "fail",
    );
  });
});

describe("numericErrorEvaluator", () => {
  it("scores the error as 1 / (1 + error)", async () => {
    const evaluator = numericErrorEvaluator({ passThreshold: 0.1 });
    const result = await evaluator.evaluate(1, undefined, context);
    expect(result.score).toBeCloseTo(0.5, 12);
    expect(result.error).toBe(1);
  });

  it("classifies pass / partial / fail by threshold", async () => {
    const evaluator = numericErrorEvaluator({
      passThreshold: 0.1,
      partialThreshold: 0.5,
    });
    expect((await evaluator.evaluate(0.05, undefined, context)).status).toBe(
      "pass",
    );
    expect((await evaluator.evaluate(0.3, undefined, context)).status).toBe(
      "partial",
    );
    expect((await evaluator.evaluate(0.9, undefined, context)).status).toBe(
      "fail",
    );
  });
});

describe("exactMatchEvaluator", () => {
  it("passes on structurally equal values", async () => {
    const evaluator = exactMatchEvaluator<number[]>();
    const result = await evaluator.evaluate([1, 2, 3], [1, 2, 3], context);
    expect(result.status).toBe("pass");
  });

  it("fails on different values", async () => {
    const evaluator = exactMatchEvaluator<number[]>();
    const result = await evaluator.evaluate([1, 2, 3], [1, 2, 4], context);
    expect(result.status).toBe("fail");
  });
});

describe("compositeEvaluator", () => {
  it("combines to the worst status and averages scores", async () => {
    const evaluator = compositeEvaluator<number>({
      evaluators: [
        thresholdEvaluator({ threshold: 0.5 }), // pass on 0.8 -> score 1
        thresholdEvaluator({ threshold: 1, direction: "atLeast" }), // fail on 0.8 -> score 0
      ],
    });
    const result = await evaluator.evaluate(0.8, undefined, context);
    expect(result.status).toBe("fail");
    expect(result.score).toBeCloseTo(0.5, 12);
  });

  it("passes when all sub-evaluators pass", async () => {
    const evaluator = compositeEvaluator<number>({
      evaluators: [
        thresholdEvaluator({ threshold: 0.5 }),
        thresholdEvaluator({ threshold: 0.1 }),
      ],
    });
    const result = await evaluator.evaluate(0.8, undefined, context);
    expect(result.status).toBe("pass");
    expect(result.score).toBe(1);
  });
});
