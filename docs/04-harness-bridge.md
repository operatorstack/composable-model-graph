# 04 — Harness bridge

This document stays generic on purpose. It shows *how* the primitive could later
serve a real lifecycle, without building one here and without naming any private
system.

## The analogy

The neural-network loop and a generic measurement lifecycle are the same shape.

### Neural network

```
x → f(x) → ŷ → error → sensitivity → update
```

### Generic lifecycle

```
raw data → signal extraction → measured state → evaluation → diagnosis → update candidate
```

Line them up:

| Neural network | Generic lifecycle |
| --- | --- |
| `x` (input) | raw data |
| `f(x)` (forward pass) | signal extraction |
| `ŷ` (prediction) | measured state |
| `error = y − ŷ` | evaluation |
| `f′(x)` (sensitivity) | diagnosis |
| `error · f′(x)` (update signal) | update candidate |

## Why this matters

The neural network is a *concrete, checkable* instance of the abstract
controllability claim from [doc 03](03-error-sensitivity-feedback.md): output
becomes error, error meets sensitivity, and feedback informs the next run.

Once that loop is proven on numbers, the same primitive can host other
lifecycles whose "forward pass", "error", and "sensitivity" are domain-specific
rather than arithmetic.

## What this repository does and does not provide

- **Provides:** generic primitives — `Transform`, trace, `Evaluator`,
  `FeedbackResolver`, and a linear `ModelGraph` runner.
- **Does not provide:** any harness, scheduler, agent, workflow, goal, or
  company-specific lifecycle. Those are built privately, on top of these
  primitives.

## Example

See [Example 04 — Lifecycle Bridge](../examples/04-lifecycle-bridge) for a
domain-free run of:

```
Raw Run Data
  ↓
Signal Extraction
  ↓
Measured State
  ↓
Evaluation
  ↓
Feedback Action
```
