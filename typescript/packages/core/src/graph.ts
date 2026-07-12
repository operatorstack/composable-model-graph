import type {
  AnyTransform,
  Connection,
  Evaluator,
  FeedbackResolver,
  GraphRun,
  ModelGraph,
  ModelGraphRunOptions,
  RunContext,
  TraceStep,
} from "./types.js";

function generateRunId(): string {
  return globalThis.crypto.randomUUID();
}

/** Configuration accepted by {@link createModelGraph}. */
export interface ModelGraphConfig<I, O> {
  id: string;
  name: string;
  transforms: AnyTransform[];
  /**
   * Optional directed edges. When omitted the graph runs sequentially
   * (output -> input). When given it runs as a DAG: a node with multiple
   * predecessors receives the array of their outputs.
   */
  connections?: Connection[];
  evaluator?: Evaluator<O>;
  feedbackResolver?: FeedbackResolver<I, O>;
}

/**
 * Create a model graph.
 *
 * On `run` the graph:
 *   1. executes each transform (sequentially, or in topological order when
 *      `connections` are given), threading output -> input,
 *   2. records every intermediate state as a {@link TraceStep},
 *   3. evaluates the final output if an evaluator is present,
 *   4. resolves a feedback action if a feedback resolver is present.
 *
 * Sequential is the default, not a limit: pass `connections` to run an
 * arbitrary directed acyclic graph (fan-out, merge). The structure follows the
 * use case.
 */
export function createModelGraph<I, O>(
  config: ModelGraphConfig<I, O>,
): ModelGraph<I, O> {
  const { id, name, transforms, connections, evaluator, feedbackResolver } =
    config;

  function runStep(
    transform: AnyTransform,
    input: unknown,
    context: RunContext,
  ): Promise<TraceStep> {
    const signals: Record<string, unknown> = {};
    const stepContext: RunContext = {
      ...context,
      recordSignal: (key, value) => {
        signals[key] = value;
      },
    };
    const startedAt = Date.now();
    return Promise.resolve(transform.run(input, stepContext)).then((output) => {
      const finishedAt = Date.now();
      return {
        transformId: transform.id,
        transformName: transform.name,
        input,
        output,
        startedAt,
        finishedAt,
        durationMs: finishedAt - startedAt,
        ...(Object.keys(signals).length > 0 ? { metadata: signals } : {}),
      };
    });
  }

  async function runSequential(
    input: I,
    context: RunContext,
  ): Promise<{ output: unknown; trace: TraceStep[] }> {
    const trace: TraceStep[] = [];
    let current: unknown = input;
    for (const transform of transforms) {
      const step = await runStep(transform, current, context);
      trace.push(step);
      current = step.output;
    }
    return { output: current, trace };
  }

  async function runDag(
    input: I,
    context: RunContext,
    edges: ReadonlyArray<Connection>,
  ): Promise<{ output: unknown; trace: TraceStep[] }> {
    const byId = new Map<string, AnyTransform>();
    for (const t of transforms) {
      byId.set(t.id, t);
    }
    for (const c of edges) {
      for (const tid of [c.src, c.dst]) {
        if (!byId.has(tid)) {
          throw new Error(
            `connection references unknown transform id: ${tid}`,
          );
        }
      }
    }

    const preds = new Map<string, string[]>();
    const succs = new Map<string, string[]>();
    for (const t of transforms) {
      preds.set(t.id, []);
      succs.set(t.id, []);
    }
    for (const c of edges) {
      preds.get(c.dst)!.push(c.src);
      succs.get(c.src)!.push(c.dst);
    }

    // Kahn topological sort, seeded in transforms order.
    const indeg = new Map<string, number>();
    for (const t of transforms) {
      indeg.set(t.id, preds.get(t.id)!.length);
    }
    const queue: string[] = transforms
      .map((t) => t.id)
      .filter((tid) => indeg.get(tid) === 0);
    const order: string[] = [];
    while (queue.length > 0) {
      const tid = queue.shift()!;
      order.push(tid);
      for (const s of succs.get(tid)!) {
        indeg.set(s, indeg.get(s)! - 1);
        if (indeg.get(s) === 0) {
          queue.push(s);
        }
      }
    }
    if (order.length !== transforms.length) {
      throw new Error("graph has a cycle");
    }

    const outputs = new Map<string, unknown>();
    const trace: TraceStep[] = [];
    let last: unknown = input;
    for (const tid of order) {
      const ps = preds.get(tid)!;
      let value: unknown;
      if (ps.length === 0) {
        value = input;
      } else if (ps.length === 1) {
        value = outputs.get(ps[0]!);
      } else {
        // a merge node receives the list of its predecessors' outputs
        value = ps.map((p) => outputs.get(p));
      }
      const step = await runStep(byId.get(tid)!, value, context);
      trace.push(step);
      outputs.set(tid, step.output);
      last = step.output;
    }
    return { output: last, trace };
  }

  return {
    id,
    name,
    transforms,
    connections,
    evaluator,
    feedbackResolver,
    async run(
      input: I,
      options?: ModelGraphRunOptions,
    ): Promise<GraphRun<I, O>> {
      const context: RunContext = {
        runId: options?.runId ?? generateRunId(),
        target: options?.target,
        metadata: options?.metadata,
      };

      const { output, trace } =
        connections && connections.length > 0
          ? await runDag(input, context, connections)
          : await runSequential(input, context);

      const finalOutput = output as O;
      const run: GraphRun<I, O> = { input, output: finalOutput, trace };

      if (evaluator) {
        run.evaluation = await evaluator.evaluate(
          finalOutput,
          context.target,
          context,
        );
      }

      if (feedbackResolver) {
        run.feedback = await feedbackResolver.resolve(run, context);
      }

      return run;
    },
  };
}
