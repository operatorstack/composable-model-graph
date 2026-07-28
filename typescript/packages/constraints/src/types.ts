import type {
  EvaluationResult,
  Evidence,
  MaybePromise,
  RunContext,
} from "@composable-model-graph/core";

/** Caller-controlled ambient information supplied to a constraint. */
export interface ConstraintContext {
  runId?: string;
  metadata?: Record<string, unknown>;
}

/** Open, status-free observation emitted by a constraint. */
export interface ConstraintFinding<
  K extends string = string,
  D = unknown,
> {
  kind: K;
  code: string;
  message: string;
  path?: ReadonlyArray<string | number>;
  observed?: unknown;
  expected?: unknown;
  evidence?: Evidence[];
  data?: D;
  tags?: string[];
}

/** A named check over caller-owned state. */
export interface Constraint<T, F = ConstraintFinding> {
  id: string;
  name: string;
  description?: string;
  check(
    value: T,
    context: ConstraintContext,
  ): MaybePromise<ReadonlyArray<F>>;
}

/** Findings retained for one executed constraint. */
export interface ConstraintCheck<F> {
  constraintId: string;
  constraintName: string;
  findings: ReadonlyArray<F>;
  durationMs?: number;
}

/** Lossless, declaration-ordered result of executing constraints. */
export interface ConstraintReport<F> {
  checks: ReadonlyArray<ConstraintCheck<F>>;
  findings: ReadonlyArray<F>;
}

/** A reusable composition of constraints over the same input. */
export interface ConstraintSuite<T, F = ConstraintFinding> {
  constraints: ReadonlyArray<Constraint<T, F>>;
  check(
    value: T,
    context?: ConstraintContext,
  ): Promise<ConstraintReport<F>>;
}

/** Configuration for adapting a constraint suite to a CMG evaluator. */
export interface ConstraintEvaluatorOptions<O, T, F> {
  id?: string;
  name?: string;
  constraints: ConstraintSuite<O, F>;
  interpret(
    report: ConstraintReport<F>,
    output: O,
    target: T,
    context: RunContext,
  ): MaybePromise<EvaluationResult>;
}
