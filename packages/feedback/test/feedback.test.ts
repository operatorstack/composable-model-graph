import { describe, expect, it } from "vitest";

import type {
  EvaluationStatus,
  GraphRun,
  RunContext,
} from "@composable-model-graph/core";
import {
  defaultFeedbackResolver,
  thresholdFeedbackResolver,
} from "@composable-model-graph/feedback";

const context: RunContext = { runId: "test-run" };

function runWith(
  evaluation?: { status: EvaluationStatus; score?: number },
): GraphRun<unknown, unknown> {
  return {
    input: null,
    output: null,
    trace: [],
    evaluation,
  };
}

describe("defaultFeedbackResolver", () => {
  const resolver = defaultFeedbackResolver();

  it("maps pass -> accept", async () => {
    const action = await resolver.resolve(runWith({ status: "pass" }), context);
    expect(action.kind).toBe("accept");
  });

  it("maps partial -> adjust", async () => {
    const action = await resolver.resolve(
      runWith({ status: "partial" }),
      context,
    );
    expect(action.kind).toBe("adjust");
  });

  it("maps fail -> retry", async () => {
    const action = await resolver.resolve(runWith({ status: "fail" }), context);
    expect(action.kind).toBe("retry");
  });

  it("maps unknown -> custom inspect", async () => {
    const action = await resolver.resolve(
      runWith({ status: "unknown" }),
      context,
    );
    expect(action.kind).toBe("custom");
    expect(action.reason).toBe("inspect");
  });

  it("treats a missing evaluation as custom inspect", async () => {
    const action = await resolver.resolve(runWith(), context);
    expect(action.kind).toBe("custom");
  });
});

describe("thresholdFeedbackResolver", () => {
  it("accepts when score meets acceptScore", async () => {
    const resolver = thresholdFeedbackResolver({ acceptScore: 0.8 });
    const action = await resolver.resolve(
      runWith({ status: "pass", score: 0.9 }),
      context,
    );
    expect(action.kind).toBe("accept");
  });

  it("retries when score is below retryScore", async () => {
    const resolver = thresholdFeedbackResolver({
      acceptScore: 0.8,
      retryScore: 0.4,
    });
    const action = await resolver.resolve(
      runWith({ status: "fail", score: 0.2 }),
      context,
    );
    expect(action.kind).toBe("retry");
  });

  it("adjusts for scores between retry and accept", async () => {
    const resolver = thresholdFeedbackResolver({
      acceptScore: 0.8,
      retryScore: 0.4,
    });
    const action = await resolver.resolve(
      runWith({ status: "partial", score: 0.6 }),
      context,
    );
    expect(action.kind).toBe("adjust");
  });

  it("inspects when no score is present", async () => {
    const resolver = thresholdFeedbackResolver({ acceptScore: 0.8 });
    const action = await resolver.resolve(
      runWith({ status: "unknown" }),
      context,
    );
    expect(action.kind).toBe("custom");
  });
});
