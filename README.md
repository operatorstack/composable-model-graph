# Composable Model Graph

Typed transformation graphs with trace, evaluation, and feedback.

## Core shape

```
input → transform → state/output → evaluation → feedback
```

## What this is not

- **Not** an ML framework.
- **Not** an agent framework.
- **Not** a workflow engine.
- **Not** a harness.
- **Not** LangChain.
- **Not** a graph database.

## What it is

- Typed transforms.
- Inspectable runs.
- Traceable intermediate states.
- Evaluation-first outputs.
- Optional feedback actions.

It is a small set of generic primitives. Many different systems can be built on
top of them. This repository deliberately ships only the primitives.

## Diagram

```
Input
  ↓
Transform
  ↓
State
  ↓
Transform
  ↓
Output
  ↓
Evaluation
  ↓
Feedback
  ↓
Next Run
```

## The key primitive

```
Transform + Trace + Evaluation + Feedback
```

## The key proof

```
input vector → neural transforms → prediction → error → sensitivity → feedback
```

The first mathematical proof of the primitive is a neural-network forward pass
(`packages/math`) wired through error-based evaluation and a feedback action.
See [Example 02](examples/02-neural-network-graph) and the
[neural-network architecture doc](docs/02-neural-network-architecture.md).

## Packages

| Package | Description |
| --- | --- |
| [`@composable-model-graph/core`](packages/core) | Primitive layer: transforms, traceable runs, evaluation, feedback. |
| [`@composable-model-graph/math`](packages/math) | Neural-network proof: activations, losses, dense layers. |
| [`@composable-model-graph/evaluators`](packages/evaluators) | Generic evaluators returning `EvaluationResult`. |
| [`@composable-model-graph/feedback`](packages/feedback) | Generic feedback resolvers. |

## Examples

- [`01-core-pipeline`](examples/01-core-pipeline) — linear string pipeline with a trace.
- [`02-neural-network-graph`](examples/02-neural-network-graph) — the neural proof.
- [`03-error-sensitivity-feedback`](examples/03-error-sensitivity-feedback) — error × sensitivity → feedback signal.
- [`04-lifecycle-bridge`](examples/04-lifecycle-bridge) — generic observe → measure → evaluate → decide lifecycle.
- [`05-evaluators`](examples/05-evaluators) — every generic evaluator (threshold, numeric error, exact match, composite).
- [`06-skill-routing`](examples/06-skill-routing) — inspect + compare two routing graphs (naive vs structured) with recorded token/cost signals and `compareRuns`.
- [`07-emergent-system-failures`](examples/07-emergent-system-failures) — `local validity != system validity`: three runnable domains (sensor signed-signal, dependency-graph ordering, research evidence-flow) where every node is locally valid yet the composition breaks a graph-level relation; each is detected + localized three ways (Final Answer, Node Contract, Trace Relation Check) with no core change.

## Documentation

- [00 — Overview](docs/00-overview.md)
- [01 — Core primitive](docs/01-core-primitive.md)
- [02 — Neural-network architecture](docs/02-neural-network-architecture.md)
- [03 — Error, sensitivity, feedback](docs/03-error-sensitivity-feedback.md)
- [04 — Harness bridge](docs/04-harness-bridge.md)

## Getting started

This is a [pnpm](https://pnpm.io/) workspace.

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
```

Run an example (after `pnpm build`):

```bash
pnpm --filter @composable-model-graph/example-02-neural-network-graph start
```

## Repository scripts

| Script | Action |
| --- | --- |
| `pnpm build` | `pnpm -r build` |
| `pnpm test` | `pnpm -r test` |
| `pnpm typecheck` | `pnpm -r typecheck` |

## Design constraints

- TypeScript, ESM, strict typing.
- Small APIs. No over-engineering.
- Linear graphs only (no branching in v1).
- Forward pass only (no backprop in v1).
- No harness, agent, workflow, goal, skill, or company-specific concepts.

## License

MIT
