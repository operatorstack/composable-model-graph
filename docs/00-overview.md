# 00 - Overview

**Composable Model Graph** is a dual-language (TypeScript + Python) library ecosystem
for building inspectable transformation graphs. The two implementations are kept at
parity; see [structure.md](structure.md), with [philosophy.md](philosophy.md) and
[development.md](development.md) for why it exists and how features earn their place.

## The shape

Every system built on this ecosystem follows one shape:

```
input → transform → state/output → evaluation → feedback
```

- **input** - whatever enters the graph.
- **transform** - a named, typed function from input to output.
- **state/output** - every intermediate output is recorded as a trace step.
- **evaluation** - the final output is scored into an `EvaluationResult`.
- **feedback** - the evaluation is mapped to a `FeedbackAction`.

## Why a graph of transforms

A single function hides its intermediate states. A model graph makes them
first-class: each step is recorded with its input, output, and timing. This
makes runs **inspectable**, which is the precondition for evaluation and
feedback.

## What lives where

| Package | Role |
| --- | --- |
| `core` | The primitive layer. Types, factories, and the graph runner (sequential by default, a general DAG where a use case needs it). |
| `math` | The neural-network proof. Activations, losses, dense layers. |
| `evaluators` | Generic ways to turn an output into an `EvaluationResult`. |
| `feedback` | Generic ways to turn an `EvaluationResult` into a `FeedbackAction`. |

The Python side mirrors these packages with parity (see [structure.md](structure.md)).
Linearity is a default, not a design limit: the runner is sequential by default and a
general DAG when a use case needs it.

## Boundaries

This repository ships **only generic primitives**. It is not a harness, agent
framework, workflow engine, or ML framework. The end goal is to bridge toward a
real harness lifecycle later - but that harness is private and is built
*on top of* these primitives, not inside this repository.

## Reading order

1. [01 - Core primitive](01-core-primitive.md)
2. [02 - Neural-network architecture](02-neural-network-architecture.md)
3. [03 - Error, sensitivity, feedback](03-error-sensitivity-feedback.md)
4. [04 - Harness bridge](04-harness-bridge.md)

See also: [philosophy.md](philosophy.md), [development.md](development.md), [structure.md](structure.md).
