import {
  readFileSync,
} from "node:fs";
import {
  type GraphRun,
  type RunContext,
} from "@composable-model-graph/core";
import { describe, expect, it } from "vitest";

import {
  composeConstraints,
  createConstraint,
  createConstraintEvaluator,
  distinct,
  matches,
  predicate,
  project,
  reachable,
  referencesExist,
  required,
  withinRange,
  type ConstraintFinding,
} from "../src/index.js";

const finding = (
  kind: string,
  code: string,
  message: string,
  extra: Partial<ConstraintFinding> = {},
): ConstraintFinding => ({ kind, code, message, ...extra });

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

describe("constraint findings", () => {
  it("composes every check sequentially without collapsing findings", async () => {
    const events: string[] = [];
    const first = createConstraint<number, ConstraintFinding>({
      id: "first",
      name: "First",
      check: async () => {
        events.push("first:start");
        await Promise.resolve();
        events.push("first:end");
        return [finding("note", "same", "Repeated")];
      },
    });
    const second = createConstraint<number, ConstraintFinding>({
      id: "second",
      name: "Second",
      check: () => {
        events.push("second");
        return [finding("note", "same", "Repeated")];
      },
    });
    const empty = createConstraint<number, ConstraintFinding>({
      id: "empty",
      name: "Empty",
      check: () => [],
    });

    const report = await composeConstraints(first, second, empty).check(1);

    expect(events).toEqual(["first:start", "first:end", "second"]);
    expect(report.checks.map((check) => check.constraintId)).toEqual([
      "first",
      "second",
      "empty",
    ]);
    expect(report.findings).toHaveLength(2);
    expect(report.findings[0]).toEqual(report.findings[1]);
    expect(report.checks[2]?.findings).toEqual([]);
    expect(report.checks.every((check) => check.durationMs === undefined)).toBe(
      true,
    );
  });

  it("preserves the open finding shape and input state", async () => {
    type CustomFinding = ConstraintFinding<
      "custom-observation",
      { recordId: string }
    >;
    const state = { record: { id: "item-1", value: 4 } };
    const before = JSON.stringify(state);
    const constraint = createConstraint<typeof state, CustomFinding>({
      id: "observe",
      name: "Observe",
      check: () => [
        {
          kind: "custom-observation",
          code: "record.observed",
          message: "Record was observed",
          path: ["record", "value"],
          observed: 4,
          expected: 5,
          evidence: [
            { label: "source", value: "manifest", source: "fixture" },
          ],
          data: { recordId: "item-1" },
          tags: ["deterministic"],
        },
      ],
    });

    const report = await composeConstraints(constraint).check(state);

    expect(JSON.stringify(state)).toBe(before);
    expect(report.findings[0]).toEqual({
      kind: "custom-observation",
      code: "record.observed",
      message: "Record was observed",
      path: ["record", "value"],
      observed: 4,
      expected: 5,
      evidence: [{ label: "source", value: "manifest", source: "fixture" }],
      data: { recordId: "item-1" },
      tags: ["deterministic"],
    });
    const canonical = JSON.stringify(stableValue(report));
    const expected = readFileSync(
      new URL("../../../../fixtures/constraint-report.json", import.meta.url),
      "utf8",
    ).trim();
    expect(canonical).toBe(expected);
  });

  it("supports predicate, required, and projection helpers", async () => {
    const positive = predicate<number>({
      id: "positive",
      test: (value) => value > 0,
      finding: (value) =>
        finding("predicate", "number.non-positive", `${value} is not positive`),
    });
    const requiredNames = required<
      { names: Array<string | undefined> },
      string
    >({
      id: "names-required",
      select: (state) =>
        state.names.map((value, index) => ({
          id: String(index),
          value,
          path: ["names", index],
        })),
      finding: ({ item }) =>
        finding("required", "name.required", `${item.id} is missing`, {
          path: item.path,
        }),
    });
    const projected = project<{ payload: number }, number>({
      constraint: positive,
      select: (state) => state.payload,
    });

    expect((await composeConstraints(positive).check(2)).findings).toEqual([]);
    expect((await composeConstraints(positive).check(0)).findings).toHaveLength(
      1,
    );
    expect(
      (
        await composeConstraints(requiredNames).check({
          names: ["ready", undefined],
        })
      ).findings[0]?.path,
    ).toEqual(["names", 1]);
    expect(
      (await composeConstraints(projected).check({ payload: -1 })).findings,
    ).toHaveLength(1);
  });

  it("supports distinct values and custom equality", async () => {
    const constraint = distinct<
      { values: string[] },
      string,
      ConstraintFinding
    >({
      id: "values-distinct",
      select: (state) =>
        state.values.map((value, index) => ({ id: String(index), value })),
      equals: (left, right) => left.toLowerCase() === right.toLowerCase(),
      finding: ({ duplicates }) =>
        finding("duplicate", "value.duplicate", "Values overlap", {
          data: { ids: duplicates.map((item) => item.id) },
        }),
    });

    const report = await composeConstraints(constraint).check({
      values: ["Alpha", "beta", "ALPHA", "alpha"],
    });
    expect(report.findings).toEqual([
      expect.objectContaining({ data: { ids: ["0", "2", "3"] } }),
    ]);
    expect(
      (
        await composeConstraints(constraint).check({
          values: [],
        })
      ).findings,
    ).toEqual([]);

    const defaultEquality = distinct<
      { values: unknown[] },
      unknown,
      ConstraintFinding
    >({
      id: "default-equality",
      select: (state) =>
        state.values.map((value, index) => ({ id: String(index), value })),
      finding: () => finding("duplicate", "value.duplicate", "Duplicate"),
    });
    expect(
      (
        await composeConstraints(defaultEquality).check({
          values: [Number.NaN, Number.NaN, {}, {}],
        })
      ).findings,
    ).toEqual([]);
    expect(
      (
        await composeConstraints(defaultEquality).check({
          values: [-0, 0],
        })
      ).findings,
    ).toHaveLength(1);
  });

  it("supports reference and reachability checks", async () => {
    interface State {
      records: Array<{ id: string }>;
      references: Array<{ source: string; target: string }>;
      edges: Record<string, string[]>;
      goals: string[];
    }
    const references = referencesExist<
      State,
      { id: string },
      ConstraintFinding
    >({
      id: "references-exist",
      records: (state) => state.records,
      recordId: (record) => record.id,
      references: (state) => state.references,
      finding: ({ reference }) =>
        finding(
          "missing-reference",
          "reference.missing",
          `${reference.target} is missing`,
        ),
    });
    const paths = reachable<State>({
      id: "goals-reachable",
      starts: () => ["root"],
      goals: (state) => state.goals,
      neighbors: (id, state) => state.edges[id] ?? [],
      finding: ({ goal }) =>
        finding("unreachable", "goal.unreachable", `${goal} is unreachable`),
    });
    const state: State = {
      records: [{ id: "root" }, { id: "child" }],
      references: [
        { source: "root", target: "child" },
        { source: "child", target: "missing" },
      ],
      edges: { root: ["child"], child: [] },
      goals: ["child", "detached"],
    };

    const report = await composeConstraints(references, paths).check(state);
    expect(report.findings.map((item) => item.code)).toEqual([
      "reference.missing",
      "goal.unreachable",
    ]);
  });

  it("supports inclusive ranges and pair matching", async () => {
    const range = withinRange<
      { values: number[] },
      ConstraintFinding
    >({
      id: "range",
      min: 1,
      max: 3,
      select: (state) =>
        state.values.map((value, index) => ({ id: String(index), value })),
      finding: ({ item, min, max }) =>
        finding("range", "value.outside", `${item.value} outside ${min}-${max}`),
    });
    const pairs = matches<
      { pairs: Array<[string, string]> },
      string,
      string,
      ConstraintFinding
    >({
      id: "matches",
      select: (state) =>
        state.pairs.map(([left, right], index) => ({
          id: String(index),
          left,
          right,
        })),
      equals: (left, right) => left.toLowerCase() === right.toLowerCase(),
      finding: ({ item }) =>
        finding("mismatch", "value.mismatch", `${item.id} differs`),
    });

    expect(
      (await composeConstraints(range).check({ values: [1, 3] })).findings,
    ).toEqual([]);
    expect(
      (await composeConstraints(range).check({ values: [0, 4] })).findings,
    ).toHaveLength(2);
    expect(() =>
      withinRange({
        id: "invalid",
        min: 2,
        max: 1,
        select: () => [],
        finding: () => finding("range", "invalid", "invalid"),
      }),
    ).toThrow("minimum 2 exceeds maximum 1");
    expect(
      (
        await composeConstraints(pairs).check({
          pairs: [
            ["A", "a"],
            ["B", "C"],
          ],
        })
      ).findings,
    ).toHaveLength(1);
  });

  it("requires caller interpretation when adapting to evaluation", async () => {
    const suite = composeConstraints(
      predicate<number>({
        id: "positive",
        test: (value) => value > 0,
        finding: () =>
          finding("observation", "number.non-positive", "Not positive"),
      }),
    );
    const contexts: Array<{ runId?: string; marker?: unknown }> = [];
    const evaluator = createConstraintEvaluator({
      id: "interpreted",
      constraints: suite,
      interpret: (report, output, target, context) => {
        contexts.push({
          runId: context.runId,
          marker: context.metadata?.marker,
        });
        return {
          status: report.findings.length === 0 ? "pass" : "unknown",
          score: output === target ? 1 : 0,
          messages: report.findings.map((item) => item.message),
        };
      },
    });
    const context: RunContext = {
      runId: "run-1",
      metadata: { marker: "kept" },
    };

    expect(await evaluator.evaluate(-1, -1, context)).toEqual({
      status: "unknown",
      score: 1,
      messages: ["Not positive"],
    });
    expect(contexts).toEqual([{ runId: "run-1", marker: "kept" }]);
  });

  it("checks completed runs without changing the evaluator lifecycle", async () => {
    const traceConstraint = createConstraint<
      GraphRun<number, number>,
      ConstraintFinding
    >({
      id: "trace-present",
      name: "Trace present",
      check: (run) =>
        run.trace.length > 0
          ? []
          : [finding("trace", "trace.empty", "No trace was recorded")],
    });
    const run: GraphRun<number, number> = {
      input: 1,
      output: 1,
      trace: [],
    };

    expect(
      (await composeConstraints(traceConstraint).check(run)).findings[0]?.code,
    ).toBe("trace.empty");
  });
});
