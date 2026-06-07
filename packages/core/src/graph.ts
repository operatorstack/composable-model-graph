import type {
  AnyTransform,
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
  evaluator?: Evaluator<O>;
  feedbackResolver?: FeedbackResolver<I, O>;
}

/**
 * Create a linear model graph.
 *
 * On `run` the graph:
 *   1. executes each transform in order, threading output -> input,
 *   2. records every intermediate state as a {@link TraceStep},
 *   3. evaluates the final output if an evaluator is present,
 *   4. resolves a feedback action if a feedback resolver is present.
 *
 * v1 is intentionally linear: there is no branching.
 */
export function createModelGraph<I, O>(
  config: ModelGraphConfig<I, O>,
): ModelGraph<I, O> {
  const { id, name, transforms, evaluator, feedbackResolver } = config;

  return {
    id,
    name,
    transforms,
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

      const trace: TraceStep[] = [];
      let current: unknown = input;

      for (const transform of transforms) {
        const signals: Record<string, unknown> = {};
        const stepContext: RunContext = {
          ...context,
          recordSignal: (key, value) => {
            signals[key] = value;
          },
        };

        const startedAt = Date.now();
        const output = await transform.run(current, stepContext);
        const finishedAt = Date.now();

        trace.push({
          transformId: transform.id,
          transformName: transform.name,
          input: current,
          output,
          startedAt,
          finishedAt,
          durationMs: finishedAt - startedAt,
          ...(Object.keys(signals).length > 0 ? { metadata: signals } : {}),
        });

        current = output;
      }

      const output = current as O;
      const run: GraphRun<I, O> = { input, output, trace };

      if (evaluator) {
        run.evaluation = await evaluator.evaluate(
          output,
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
