/**
 * Core primitive types for Composable Model Graph.
 *
 * The shape every system in this ecosystem follows is:
 *
 *   input -> transform -> state/output -> evaluation -> feedback
 *
 * These types describe that shape and nothing more. There is no branching,
 * no scheduling, no harness, and no domain-specific vocabulary here.
 */

/** A value that may be produced synchronously or asynchronously. */
export type MaybePromise<T> = T | Promise<T>;

/** Outcome of evaluating a graph's final output. */
export type EvaluationStatus = "pass" | "fail" | "partial" | "unknown";

/** A single observable fact captured during evaluation. */
export interface Evidence {
  /** Human-readable name for this piece of evidence. */
  label: string;
  /** The observed value. */
  value: unknown;
  /** Optional origin of the evidence (e.g. an evaluator id). */
  source?: string;
}

/** Structured result returned by an {@link Evaluator}. */
export interface EvaluationResult {
  /** Categorical outcome of the evaluation. */
  status: EvaluationStatus;
  /** Optional normalized quality score, conventionally in `[0, 1]`. */
  score?: number;
  /** Optional numeric error / residual magnitude. */
  error?: number;
  /** Optional human-readable notes about the outcome. */
  messages?: string[];
  /** Optional supporting observations. */
  evidence?: Evidence[];
}

/** Ambient information available to every transform, evaluator, and resolver. */
export interface RunContext {
  /** Stable identifier for a single run of a graph. */
  runId: string;
  /** Optional reference value the output is compared against. */
  target?: unknown;
  /** Optional free-form metadata for the run. */
  metadata?: Record<string, unknown>;
  /**
   * Record a named signal on the trace step currently executing. The graph
   * runner injects this per step; values land in {@link TraceStep.metadata}.
   *
   * This is a neutral carrier: the core attaches no meaning to the key or the
   * value. Domains decide what to record (e.g. `tokens`, `costUsd`, `latencyMs`).
   */
  recordSignal?: (key: string, value: unknown) => void;
}

/** A pure-ish, named step that maps an input to an output. */
export interface Transform<I, O> {
  id: string;
  name: string;
  description?: string;
  run(input: I, context: RunContext): MaybePromise<O>;
}

/** Convenience alias for a transform whose I/O types are not statically tracked. */
export type AnyTransform = Transform<any, any>;

/** A recorded snapshot of a single transform execution. */
export interface TraceStep {
  transformId: string;
  transformName: string;
  input: unknown;
  output: unknown;
  /** Epoch milliseconds when the step started. */
  startedAt: number;
  /** Epoch milliseconds when the step finished. */
  finishedAt: number;
  /** `finishedAt - startedAt`, in milliseconds. */
  durationMs: number;
  /**
   * Optional signals recorded by the transform via {@link RunContext.recordSignal}.
   * Omitted when the transform recorded nothing. The core attaches no meaning.
   */
  metadata?: Record<string, unknown>;
}

/** Scores a graph output against an optional target. */
export interface Evaluator<O, T = unknown> {
  id: string;
  name: string;
  evaluate(
    output: O,
    target: T,
    context: RunContext,
  ): MaybePromise<EvaluationResult>;
}

/** The set of decisions a feedback resolver can return. */
export type FeedbackActionKind =
  | "accept"
  | "retry"
  | "adjust"
  | "reject"
  | "custom";

/** A decision about what should happen after a run. */
export interface FeedbackAction {
  kind: FeedbackActionKind;
  /** Optional human-readable rationale for the decision. */
  reason?: string;
  /** Optional decision payload (e.g. an adjustment signal). */
  signal?: unknown;
}

/** The complete, inspectable record of a single graph run. */
export interface GraphRun<I, O> {
  input: I;
  output: O;
  trace: TraceStep[];
  evaluation?: EvaluationResult;
  feedback?: FeedbackAction;
}

/** Decides a {@link FeedbackAction} from a completed run. */
export interface FeedbackResolver<I, O> {
  id: string;
  name: string;
  resolve(
    run: GraphRun<I, O>,
    context: RunContext,
  ): MaybePromise<FeedbackAction>;
}

/** Options accepted by {@link ModelGraph.run}. */
export interface ModelGraphRunOptions {
  /** Override the generated run id. */
  runId?: string;
  /** Reference value passed to the evaluator. */
  target?: unknown;
  /** Free-form metadata attached to the run context. */
  metadata?: Record<string, unknown>;
}

/** A linear, inspectable composition of transforms with optional evaluation and feedback. */
export interface ModelGraph<I, O> {
  id: string;
  name: string;
  transforms: ReadonlyArray<AnyTransform>;
  evaluator?: Evaluator<O>;
  feedbackResolver?: FeedbackResolver<I, O>;
  run(input: I, options?: ModelGraphRunOptions): Promise<GraphRun<I, O>>;
}
