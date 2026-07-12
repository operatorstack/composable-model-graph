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

  it("runs sequentially when connections is an empty array (regression)", async () => {
    const graph = createModelGraph<number, number>({
      id: "g",
      name: "Graph",
      transforms: [addOne, double],
      connections: [],
    });
    const run = await graph.run(3);
    expect(run.output).toBe(8);
  });
});

describe("createModelGraph (DAG)", () => {
  const a = createTransform<number, number>({
    id: "a",
    name: "A",
    run: (input) => input + 1,
  });
  const b = createTransform<number, number>({
    id: "b",
    name: "B",
    run: (input) => input * 10,
  });
  const merge = createTransform<number[], number>({
    id: "m",
    name: "Merge",
    run: (inputs) => inputs.reduce((sum, value) => sum + value, 0),
  });

  it("feeds a merge node the array of its predecessors' outputs in connection order", async () => {
    const graph = createModelGraph<number, number>({
      id: "g",
      name: "Diamond",
      transforms: [a, b, merge],
      connections: [
        { src: "a", dst: "m" },
        { src: "b", dst: "m" },
      ],
    });
    // a: 2->3, b: 2->20, merge receives [3, 20] -> 23
    const run = await graph.run(2);
    const mergeStep = run.trace.find((s) => s.transformId === "m");
    expect(mergeStep?.input).toEqual([3, 20]);
    expect(run.output).toBe(23);
  });

  it("preserves predecessor order from the connection list", async () => {
    const graph = createModelGraph<number, number>({
      id: "g",
      name: "Diamond",
      transforms: [a, b, merge],
      connections: [
        { src: "b", dst: "m" },
        { src: "a", dst: "m" },
      ],
    });
    const run = await graph.run(2);
    const mergeStep = run.trace.find((s) => s.transformId === "m");
    expect(mergeStep?.input).toEqual([20, 3]); // b before a
  });

  it("a pure chain expressed via connections equals the sequential result", async () => {
    const graph = createModelGraph<number, number>({
      id: "g",
      name: "Chain",
      transforms: [addOne, double],
      connections: [{ src: "add-one", dst: "double" }],
    });
    // add-one: 3->4, double: 4->8
    const run = await graph.run(3);
    expect(run.output).toBe(8);
    expect(run.trace.map((s) => s.transformId)).toEqual(["add-one", "double"]);
  });

  it("a source node (no predecessors) receives the graph input", async () => {
    const graph = createModelGraph<number, number>({
      id: "g",
      name: "Diamond",
      transforms: [a, b, merge],
      connections: [
        { src: "a", dst: "m" },
        { src: "b", dst: "m" },
      ],
    });
    const run = await graph.run(5);
    const aStep = run.trace.find((s) => s.transformId === "a");
    const bStep = run.trace.find((s) => s.transformId === "b");
    expect(aStep?.input).toBe(5);
    expect(bStep?.input).toBe(5);
  });

  it("records trace steps in topological order", async () => {
    const graph = createModelGraph<number, number>({
      id: "g",
      name: "Diamond",
      transforms: [a, b, merge],
      connections: [
        { src: "a", dst: "m" },
        { src: "b", dst: "m" },
      ],
    });
    const run = await graph.run(2);
    const order = run.trace.map((s) => s.transformId);
    // sources before the merge; merge last
    expect(order[order.length - 1]).toBe("m");
    expect(order.indexOf("a")).toBeLessThan(order.indexOf("m"));
    expect(order.indexOf("b")).toBeLessThan(order.indexOf("m"));
  });

  it("evaluates and resolves feedback on the DAG's final output", async () => {
    const evaluator = createEvaluator<number, number>({
      id: "matches-target",
      name: "Matches Target",
      evaluate: (output, target) => ({
        status: output === target ? "pass" : "fail",
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
      name: "Diamond",
      transforms: [a, b, merge],
      connections: [
        { src: "a", dst: "m" },
        { src: "b", dst: "m" },
      ],
      evaluator,
      feedbackResolver,
    });
    const run = await graph.run(2, { target: 23 });
    expect(run.evaluation?.status).toBe("pass");
    expect(run.feedback).toEqual({ kind: "accept" });
  });

  it("throws on a cycle", async () => {
    const graph = createModelGraph<number, number>({
      id: "g",
      name: "Cycle",
      transforms: [a, b],
      connections: [
        { src: "a", dst: "b" },
        { src: "b", dst: "a" },
      ],
    });
    await expect(graph.run(1)).rejects.toThrow(/graph has a cycle/);
  });

  it("throws when a connection names an unknown transform id", async () => {
    const graph = createModelGraph<number, number>({
      id: "g",
      name: "Bad",
      transforms: [a],
      connections: [{ src: "a", dst: "ghost" }],
    });
    await expect(graph.run(1)).rejects.toThrow(
      /unknown transform id: ghost/,
    );
  });
});
