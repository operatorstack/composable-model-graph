import { describe, expect, it } from "vitest";

import {
  createEvaluator,
  createFeedbackResolver,
  createModelGraph,
  createTransform,
} from "@composable-model-graph/core";

const addOne = createTransform<number, number>({
  id: "add-one",
  name: "Add One",
  run: (input) => input + 1,
});

const double = createTransform<number, number>({
  id: "double",
  name: "Double",
  run: (input) => input * 2,
});

describe("createModelGraph", () => {
  it("runs transforms in order", async () => {
    const graph = createModelGraph<number, number>({
      id: "g",
      name: "Graph",
      transforms: [addOne, double],
    });

    // (3 + 1) * 2 = 8, order matters.
    const run = await graph.run(3);
    expect(run.output).toBe(8);
  });

  it("records a trace step for every transform", async () => {
    const graph = createModelGraph<number, number>({
      id: "g",
      name: "Graph",
      transforms: [addOne, double],
    });

    const run = await graph.run(3);

    expect(run.trace).toHaveLength(2);
    expect(run.trace[0]).toMatchObject({
      transformId: "add-one",
      transformName: "Add One",
      input: 3,
      output: 4,
    });
    expect(run.trace[1]).toMatchObject({
      transformId: "double",
      input: 4,
      output: 8,
    });
    for (const step of run.trace) {
      expect(step.finishedAt).toBeGreaterThanOrEqual(step.startedAt);
      expect(step.durationMs).toBe(step.finishedAt - step.startedAt);
    }
  });

  it("returns the final output and original input", async () => {
    const graph = createModelGraph<number, number>({
      id: "g",
      name: "Graph",
      transforms: [addOne, double],
    });

    const run = await graph.run(10);
    expect(run.input).toBe(10);
    expect(run.output).toBe(22);
  });

  it("attaches evaluation when an evaluator is present", async () => {
    const evaluator = createEvaluator<number>({
      id: "is-even",
      name: "Is Even",
      evaluate: (output) => ({
        status: output % 2 === 0 ? "pass" : "fail",
        score: output % 2 === 0 ? 1 : 0,
      }),
    });

    const graph = createModelGraph<number, number>({
      id: "g",
      name: "Graph",
      transforms: [addOne, double],
      evaluator,
    });

    const run = await graph.run(3);
    expect(run.evaluation).toEqual({ status: "pass", score: 1 });
  });

  it("attaches feedback when a feedback resolver is present", async () => {
    const evaluator = createEvaluator<number>({
      id: "is-even",
      name: "Is Even",
      evaluate: (output) => ({
        status: output % 2 === 0 ? "pass" : "fail",
      }),
    });

    const feedbackResolver = createFeedbackResolver<number, number>({
      id: "resolver",
      name: "Resolver",
      resolve: (run) => ({
        kind: run.evaluation?.status === "pass" ? "accept" : "retry",
      }),
    });

    const graph = createModelGraph<number, number>({
      id: "g",
      name: "Graph",
      transforms: [addOne, double],
      evaluator,
      feedbackResolver,
    });

    const run = await graph.run(3);
    expect(run.feedback).toEqual({ kind: "accept" });
  });

  it("threads target from options into the run context", async () => {
    const evaluator = createEvaluator<number, number>({
      id: "matches-target",
      name: "Matches Target",
      evaluate: (output, target) => ({
        status: output === target ? "pass" : "fail",
      }),
    });

    const graph = createModelGraph<number, number>({
      id: "g",
      name: "Graph",
      transforms: [addOne, double],
      evaluator,
    });

    const run = await graph.run(3, { target: 8 });
    expect(run.evaluation?.status).toBe("pass");
  });
});
