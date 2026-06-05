import type {
  EvaluationResult,
  Evaluator,
  FeedbackAction,
  FeedbackResolver,
  GraphRun,
  MaybePromise,
  RunContext,
  Transform,
} from "./types.js";

/** Build a {@link Transform} from a plain configuration object. */
export function createTransform<I, O>(config: {
  id: string;
  name: string;
  description?: string;
  run: (input: I, context: RunContext) => MaybePromise<O>;
}): Transform<I, O> {
  return {
    id: config.id,
    name: config.name,
    description: config.description,
    run: config.run,
  };
}

/** Build an {@link Evaluator} from a plain configuration object. */
export function createEvaluator<O, T = unknown>(config: {
  id: string;
  name: string;
  evaluate: (
    output: O,
    target: T,
    context: RunContext,
  ) => MaybePromise<EvaluationResult>;
}): Evaluator<O, T> {
  return {
    id: config.id,
    name: config.name,
    evaluate: config.evaluate,
  };
}

/** Build a {@link FeedbackResolver} from a plain configuration object. */
export function createFeedbackResolver<I, O>(config: {
  id: string;
  name: string;
  resolve: (
    run: GraphRun<I, O>,
    context: RunContext,
  ) => MaybePromise<FeedbackAction>;
}): FeedbackResolver<I, O> {
  return {
    id: config.id,
    name: config.name,
    resolve: config.resolve,
  };
}
