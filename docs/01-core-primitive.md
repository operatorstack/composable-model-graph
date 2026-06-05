# 01 — Core primitive

The `@composable-model-graph/core` package defines the primitive layer. It has
no dependencies and no domain vocabulary.

## The contract

```
Transform + Trace + Evaluation + Feedback
```

## Types

### `Transform<I, O>`

A named, typed step.

```ts
interface Transform<I, O> {
  id: string;
  name: string;
  description?: string;
  run(input: I, context: RunContext): O | Promise<O>;
}
```

### `TraceStep`

Every transform execution is recorded:

```ts
interface TraceStep {
  transformId: string;
  transformName: string;
  input: unknown;
  output: unknown;
  startedAt: number;
  finishedAt: number;
  durationMs: number;
}
```

### `Evaluator<O, T>`

Scores an output against an optional target into an `EvaluationResult`:

```ts
type EvaluationStatus = "pass" | "fail" | "partial" | "unknown";

interface EvaluationResult {
  status: EvaluationStatus;
  score?: number;
  error?: number;
  messages?: string[];
  evidence?: Evidence[];
}
```

### `FeedbackResolver<I, O>`

Maps a completed run to a `FeedbackAction`:

```ts
type FeedbackActionKind = "accept" | "retry" | "adjust" | "reject" | "custom";

interface FeedbackAction {
  kind: FeedbackActionKind;
  reason?: string;
  signal?: unknown;
}
```

### `GraphRun<I, O>`

The complete, inspectable record of one run:

```ts
interface GraphRun<I, O> {
  input: I;
  output: O;
  trace: TraceStep[];
  evaluation?: EvaluationResult;
  feedback?: FeedbackAction;
}
```

## Behavior

`createModelGraph(...).run(input, options?)`:

1. Runs each transform in order, threading output → input.
2. Records every intermediate state as a `TraceStep`.
3. Evaluates the final output if an evaluator is present.
4. Resolves a feedback action if a feedback resolver is present.

v1 is **linear**: there is no branching.

## Factories

```ts
import {
  createTransform,
  createEvaluator,
  createFeedbackResolver,
  createModelGraph,
} from "@composable-model-graph/core";
```

## Example

See [Example 01 — Core Pipeline](../examples/01-core-pipeline):

```
"  Hello Model Graph  "
  → trim
  → lowercase
  → split words
  → ["hello", "model", "graph"]
```
