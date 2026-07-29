import {
  createModelGraph,
  createTransform,
  type GraphRun,
} from "@composable-model-graph/core";
import { describe, expect, it } from "vitest";
import {
  renderComparison,
  renderDecodedPath,
  renderGraph,
  renderRun,
  renderSensitivity,
  renderUsefulFlow,
} from "../src/index.js";

const transform = (id: string, name = id) =>
  createTransform<unknown, unknown>({ id, name, run: (value) => value });

describe("terminal graph renderer", () => {
  it("renders one node", () => {
    const graph = createModelGraph({
      id: "one",
      name: "One",
      transforms: [transform("single-node")],
    });
    expect(renderGraph(graph, { columns: 80, showLifecycle: false })).toBe(
      ["┌─────────────┐", "│ Single node │", "└─────────────┘"].join("\n"),
    );
  });

  it("renders sequential structure and label overrides", () => {
    const graph = createModelGraph({
      id: "line",
      name: "Line",
      transforms: ["a", "b", "c", "d", "e"].map((id) => transform(id)),
    });
    expect(
      renderGraph(graph, {
        columns: 80,
        labels: { c: "Centre" },
        showLifecycle: false,
      }),
    ).toBe(
      [
        "┌───┐    ┌───┐    ┌────────┐    ┌───┐    ┌───┐",
        "│ A │───▶│ B │───▶│ Centre │───▶│ D │───▶│ E │",
        "└───┘    └───┘    └────────┘    └───┘    └───┘",
      ].join("\n"),
    );
  });

  it("renders an explicit linear graph in connection order", () => {
    const graph = createModelGraph({
      id: "declared-line",
      name: "Declared line",
      transforms: [
        transform("result"),
        transform("input"),
        transform("validate"),
      ],
      connections: [
        { src: "input", dst: "validate" },
        { src: "validate", dst: "result" },
      ],
    });
    expect(
      renderGraph(graph, { columns: 80, showLifecycle: false }),
    ).toBe(
      [
        "┌───────┐    ┌──────────┐    ┌────────┐",
        "│ Input │───▶│ Validate │───▶│ Result │",
        "└───────┘    └──────────┘    └────────┘",
      ].join("\n"),
    );
    expect(renderGraph(graph, { columns: 100 })).toContain(
      "│ Input │───▶│ Input │───▶│ Validate │───▶│ Result │───▶│ Output │",
    );
    const narrow = renderGraph(graph, {
      charset: "ascii",
      columns: 10,
      showLifecycle: false,
    });
    expect(narrow).toContain("| Input |");
    expect(narrow).toContain("  v");
    expect(narrow).not.toContain("Edges");
  });

  it("abbreviates to short codes and adds a legend when a chain overflows", () => {
    const graph = createModelGraph({
      id: "ingest",
      name: "Ingest",
      transforms: [
        transform("ingest"),
        transform("normalize"),
        transform("index"),
      ],
      connections: [
        { src: "ingest", dst: "normalize" },
        { src: "normalize", dst: "index" },
      ],
    });
    // Full labels overflow 40 columns; short codes fit, so the compact chain
    // survives and a legend maps each code back to its name.
    expect(
      renderGraph(graph, {
        columns: 40,
        showLifecycle: false,
        labels: {
          ingest: "Ingest source records",
          normalize: "Normalize schema fields",
          index: "Build the search index",
        },
      }),
    ).toBe(
      [
        "┌─────┐    ┌─────┐    ┌──────┐",
        "│ ISR │───▶│ NSF │───▶│ BTSI │",
        "└─────┘    └─────┘    └──────┘",
        "",
        "Legend",
        "  ISR = Ingest source records",
        "  NSF = Normalize schema fields",
        "  BTSI = Build the search index",
      ].join("\n"),
    );
  });

  it("projects produced fields onto an explicit linear graph", () => {
    const graph = createModelGraph({
      id: "state-line",
      name: "State line",
      transforms: [
        transform("results"),
        transform("parse"),
        transform("validation"),
      ],
      connections: [
        { src: "parse", dst: "validation" },
        { src: "validation", dst: "results" },
      ],
    });
    const states = [
      {},
      { parse: "payload", schema: "v1" },
      {
        parse: "payload",
        schema: "v1",
        validation: "accepted",
      },
      {
        parse: "payload",
        schema: "v1",
        validation: "accepted",
        localResult: "created",
        systemResult: "recorded",
      },
    ];
    const names = new Map(
      graph.transforms.map((item) => [item.id, item.name]),
    );
    const order = ["parse", "validation", "results"];
    const run: GraphRun<unknown, unknown> = {
      input: states[0],
      output: states[3],
      trace: order.map((id, index) => ({
        transformId: id,
        transformName: names.get(id)!,
        input: states[index],
        output: states[index + 1],
        startedAt: 0,
        finishedAt: 0,
        durationMs: 0,
      })),
    };
    const output = renderRun(graph, run, {
      columns: 120,
      showLifecycle: false,
    });
    expect(output).toContain(
      "│ Parse │───▶│ Validation │───▶│ Results │",
    );
    expect(output).toContain("Schema");
    expect(output).toContain("├─ Local result");
    expect(output).toContain("└─ System result");
  });

  it("infers produced fields and reports top-level changes", () => {
    const graph = createModelGraph({
      id: "request-processing",
      name: "Request processing",
      transforms: [
        transform("input", "Collect input"),
        transform("parse", "Parse payload and schema"),
        transform("validation", "Validate payload"),
        transform("route", "Select route"),
        transform("result", "Produce local and system results"),
      ],
    });
    const states = [
      {},
      { input: "request" },
      { input: "request", parse: "payload", schema: "v1" },
      {
        input: "request",
        parse: "payload",
        schema: "v1",
        validation: "accepted",
      },
      {
        input: "request",
        parse: "payload",
        schema: "v1",
        validation: "accepted",
        route: "worker",
      },
      {
        input: "request",
        parse: "payload",
        schema: "v1",
        validation: "accepted",
        route: "worker",
        localResult: "created",
        systemResult: "recorded",
      },
    ];
    const run: GraphRun<unknown, unknown> = {
      input: states[0],
      output: states[5],
      trace: graph.transforms.map((item, index) => ({
        transformId: item.id,
        transformName: item.name,
        input: states[index],
        output: states[index + 1],
        startedAt: 0,
        finishedAt: 0,
        durationMs: 0,
      })),
    };
    expect(renderRun(graph, run, { columns: 160 })).toContain(
      "│ Input │───▶│ Parse │───▶│ Validation │───▶│ Route │───▶│ Results │",
    );
    expect(renderRun(graph, run, { columns: 160 })).toContain("Schema");
    expect(renderRun(graph, run, { columns: 160 })).toContain(
      "├─ Local result",
    );
    expect(renderRun(graph, run, { columns: 160 })).toContain(
      "+ parse, + schema",
    );
  });

  it("reports changed and removed keys", () => {
    const graph = createModelGraph({
      id: "diff",
      name: "Diff",
      transforms: [transform("change", "Change")],
    });
    const run: GraphRun<unknown, unknown> = {
      input: { kept: 1, removed: true },
      output: { kept: 2, added: true },
      trace: [
        {
          transformId: "change",
          transformName: "Change",
          input: { kept: 1, removed: true },
          output: { kept: 2, added: true },
          startedAt: 0,
          finishedAt: 4,
          durationMs: 4,
        },
      ],
    };
    expect(
      renderRun(graph, run, {
        columns: 80,
        showDuration: true,
        showProducedFields: false,
      }),
    ).toContain("Change (4ms)  + added, ~ kept, - removed");
  });

  it("shows optional evaluation and feedback without dumping state", () => {
    const graph = createModelGraph({
      id: "judged",
      name: "Judged",
      transforms: [transform("judge", "Judge")],
    });
    const run: GraphRun<unknown, unknown> = {
      input: 1,
      output: 1,
      trace: [
        {
          transformId: "judge",
          transformName: "Judge",
          input: 1,
          output: 1,
          startedAt: 0,
          finishedAt: 0,
          durationMs: 0,
        },
      ],
      evaluation: { status: "pass" },
      feedback: { kind: "accept" },
    };
    expect(renderRun(graph, run, { columns: 80 })).toContain(
      "Evaluation: pass\nFeedback: accept",
    );
    expect(
      renderRun(graph, run, {
        columns: 80,
        showEvaluation: false,
        showFeedback: false,
      }),
    ).not.toContain("Evaluation:");
  });

  it("supports ASCII and narrow vertical fallback", () => {
    const graph = createModelGraph({
      id: "line",
      name: "Line",
      transforms: [transform("first"), transform("second")],
    });
    expect(
      renderGraph(graph, {
        charset: "ascii",
        columns: 10,
        showLifecycle: false,
      }),
    ).toBe(
      [
        "+-------+",
        "| First |",
        "+-------+",
        "  v",
        "+--------+",
        "| Second |",
        "+--------+",
      ].join("\n"),
    );
  });

  it("renders every declared DAG edge", () => {
    const graph = createModelGraph({
      id: "dag",
      name: "DAG",
      transforms: [
        transform("physics"),
        transform("empirical"),
        transform("reconcile"),
      ],
      connections: [
        { src: "physics", dst: "reconcile" },
        { src: "empirical", dst: "reconcile" },
      ],
    });
    const output = renderGraph(graph, {
      columns: 80,
      showLifecycle: false,
    });
    expect(output).toContain("[Physics]");
    expect(output).toContain("[Empirical]");
    expect(output).toContain("├─▶ [Reconcile]");
  });

  it("keeps non-linear and disconnected connections in DAG layout", () => {
    const graph = createModelGraph({
      id: "not-a-line",
      name: "Not a line",
      transforms: [transform("a"), transform("b"), transform("c")],
      connections: [{ src: "a", dst: "b" }],
    });
    const output = renderGraph(graph, {
      columns: 80,
      showLifecycle: false,
    });
    expect(output).toContain("Edges");
    expect(output).toContain("A ─▶ B");
  });

  it("rejects dishonest or unknown presentation requests", () => {
    const graph = createModelGraph({
      id: "line",
      name: "Line",
      transforms: [transform("long-node")],
    });
    expect(() =>
      renderGraph(graph, {
        columns: 5,
        direction: "horizontal",
        showLifecycle: false,
      }),
    ).toThrow("requires 13 columns");
    expect(() =>
      renderGraph(graph, { labels: { missing: "Missing" } }),
    ).toThrow("unknown transform id: missing");
  });

  it("connects lifecycle boundaries and declared stages", () => {
    const evaluator = {
      id: "quality",
      name: "Quality",
      evaluate: () => ({ status: "pass" as const, score: 1 }),
    };
    const feedbackResolver = {
      id: "next",
      name: "Next",
      resolve: () => ({ kind: "accept" as const }),
    };
    const graph = createModelGraph({
      id: "lifecycle",
      name: "Lifecycle",
      transforms: [transform("work")],
      evaluator,
      feedbackResolver,
    });
    expect(renderGraph(graph, { columns: 120 })).toContain(
      "│ Input │───▶│ Work │───▶│ Output │───▶│ Evaluation │───▶│ Feedback │",
    );
  });

  it("connects empty graphs directly from input to output", () => {
    const graph = createModelGraph<unknown, unknown>({
      id: "empty",
      name: "Empty",
      transforms: [],
    });
    expect(renderGraph(graph, { columns: 80 })).toContain(
      "│ Input │───▶│ Output │",
    );
  });

  it("connects DAG output from the runner's final topological transform", () => {
    const graph = createModelGraph({
      id: "multi-sink",
      name: "Multi sink",
      transforms: [transform("a"), transform("b"), transform("c")],
      connections: [{ src: "a", dst: "b" }],
    });
    const output = renderGraph(graph, { columns: 20 });
    expect(output).toContain("B ─▶ Output");
    expect(output).not.toContain("C ─▶ Output");
    expect(output).toContain("Input ─▶ A");
    expect(output).toContain("Input ─▶ C");
  });

  it("shows evidence and signals only in full detail", () => {
    const graph = createModelGraph({
      id: "detail",
      name: "Detail",
      transforms: [transform("work")],
    });
    const run: GraphRun<unknown, unknown> = {
      input: 1,
      output: 1,
      trace: [
        {
          transformId: "work",
          transformName: "Work",
          input: 1,
          output: 1,
          startedAt: 0,
          finishedAt: 0,
          durationMs: 0,
          metadata: { tokens: 4 },
        },
      ],
      evaluation: {
        status: "pass",
        messages: ["verified"],
        evidence: [{ label: "check", value: { ok: true } }],
      },
      feedback: { kind: "accept", signal: { next: true } },
    };
    expect(renderRun(graph, run, { columns: 120 })).not.toContain("tokens:");
    const full = renderRun(graph, run, { columns: 120, detail: "full" });
    expect(full).toContain("tokens: 4");
    expect(full).toContain('Evidence: check = {"ok":true}');
    expect(full).toContain('Signal: {"next":true}');
  });

  it("renders comparison and analysis result shapes", () => {
    const graph = createModelGraph({
      id: "analysis",
      name: "Analysis",
      transforms: [transform("work")],
    });
    const baseStep = {
      transformId: "work",
      transformName: "Work",
      input: 1,
      output: 1,
      startedAt: 0,
      finishedAt: 0,
      durationMs: 0,
    };
    const a: GraphRun<unknown, unknown> = {
      input: 1,
      output: 1,
      trace: [baseStep],
      evaluation: { status: "partial", score: 0.5 },
    };
    const b: GraphRun<unknown, unknown> = {
      input: 1,
      output: 2,
      trace: [{ ...baseStep, output: 2 }],
      evaluation: { status: "pass", score: 1 },
    };
    expect(
      renderComparison({ graph, run: a }, { graph, run: b }),
    ).toContain("[Compare: B]");
    expect(
      renderComparison({ graph, run: a }, { graph, run: a }),
    ).toContain("[Compare: TIE]");
    expect(
      renderDecodedPath({
        steps: [
          {
            stepIndex: 0,
            stateId: "idle",
            score: 1,
            transitionCost: 0,
            cumulativeScore: 1,
          },
          {
            stepIndex: 1,
            stateId: "ready",
            score: 2,
            transitionCost: 0,
            cumulativeScore: 3,
          },
        ],
        totalScore: 3,
      }),
    ).toContain("[idle] ─▶ [ready]");
    expect(
      renderSensitivity([
        { name: "capacity", gradient: 2, magnitude: 2 },
      ]),
    ).toContain("gradient=2");
    expect(renderUsefulFlow({ quality: 8, cost: 4, score: 2 })).toContain(
      "[Score 2]",
    );
    expect(renderUsefulFlow({ quality: 8, cost: 0, score: 0 })).toContain(
      "[Score 0]",
    );
  });

  it("renders lifecycle nodes with the ASCII character set", () => {
    const graph = createModelGraph({
      id: "ascii-lifecycle",
      name: "ASCII lifecycle",
      transforms: [transform("work")],
    });
    expect(
      renderGraph(graph, { columns: 80, charset: "ascii" }),
    ).toContain("| Input |--->| Work |--->| Output |");
  });
});
