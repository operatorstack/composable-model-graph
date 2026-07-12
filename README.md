# Composable Model Graph

Typed transformation graphs with trace, evaluation, and feedback. A **dual-language**
library: TypeScript and Python, kept at parity.

## Core shape

```
input -> transform -> state/output -> evaluation -> feedback
```

## Why it exists

A computer scientist and an aerospace engineer should both be able to pick this up
and solve a problem with it, after a small investigation, without first learning the
theory behind it. The deep ideas (control theory, network flow, neural
error/feedback) inform the design; they are never the price of admission. The core
stays domain-free so the same primitive serves unrelated fields. See
[docs/philosophy.md](docs/philosophy.md) and, for how features earn their place,
[docs/development.md](docs/development.md).

## What it is

- Typed transforms, inspectable runs, traceable intermediate states.
- Evaluation-first outputs and optional feedback actions.
- A small set of generic primitives many systems can be built on.

## What this is not

Not an ML framework, an agent framework, a workflow engine, a harness, LangChain, or
a graph database. This repository ships only the primitives; domains sit on top as
examples or feature packages.

## Layout

This is a dual-language repo (see [docs/structure.md](docs/structure.md)):

```
docs/         language-agnostic: design, philosophy, development discipline
typescript/   the TypeScript implementation (pnpm workspace: packages + examples)
python/       the Python implementation (src layout)
CHANGELOG.md  the reasoning trail, one entry per change
```

## Packages (both languages, at parity)

| Package | Description |
| --- | --- |
| `core` | Primitive layer: transforms, traceable runs, evaluation, feedback. The runner is sequential by default and a general DAG where a use case needs it. |
| `math` | Neural proof: activations (forward + derivative), losses, sensitivity. |
| `evaluators` | Generic evaluators returning an evaluation result. |
| `feedback` | Generic feedback resolvers. |
| `estimation` | Decode the best path through per-step candidate states (trellis / Viterbi / fixed-lag). |

Every package ships in both languages at parity.

## Getting started

TypeScript (a [pnpm](https://pnpm.io/) workspace):

```bash
cd typescript
pnpm install
pnpm typecheck
pnpm --filter @composable-model-graph/example-01-core-pipeline start
```

Python (the core is dependency-free, no install needed):

```bash
cd python
python3 tests/test_smoke.py
# or, after `pip install -e .[dev]`:  python3 -m pytest
```

## Examples

In [`typescript/examples/`](typescript/examples) and, where ported, in
[`python/examples/`](python/examples) (byte-identical output):

- `01-core-pipeline` - linear string pipeline with a trace.
- `02-neural-network-graph` - the neural proof.
- `03-error-sensitivity-feedback` - error times sensitivity to a feedback signal.
- `04-lifecycle-bridge` - generic observe, measure, evaluate, decide lifecycle.
- `05-evaluators` - every generic evaluator (threshold, numeric error, exact match, composite).
- `06-skill-routing` - compare two routing graphs with recorded cost signals and `compareRuns`.
- `07-emergent-system-failures` - local validity is not system validity: three domains where each node is valid yet the composition breaks a graph-level relation.
- `13-track-snapping`, `14-hidden-regime`, `15-typo-decode` - the `estimation` primitive in three unrelated fields (tracking, hidden-state inference, text). (ts, python)

## Documentation

- [00 - Overview](docs/00-overview.md)
- [01 - Core primitive](docs/01-core-primitive.md)
- [02 - Neural-network architecture](docs/02-neural-network-architecture.md)
- [03 - Error, sensitivity, feedback](docs/03-error-sensitivity-feedback.md)
- [04 - Harness bridge](docs/04-harness-bridge.md)
- [05 - Useful flow and sensitivity](docs/05-useful-flow-and-sensitivity.md)
- [06 - Sequential estimation](docs/06-sequential-estimation.md)
- [Philosophy](docs/philosophy.md) - why it exists, the bar it holds to.
- [Development discipline](docs/development.md) - how features earn their place (parity, use-case-pulled).
- [Structure](docs/structure.md) - the dual-language layout.

## Design constraints

- Dual-language: every capability ships in TypeScript and Python, at parity.
- Small APIs. No over-engineering. Theory informs design; the API exposes simple capabilities.
- Linearity is a default, not a limit: the runner is sequential by default and a general DAG where a use case needs it.
- The core stays generic: no harness, agent, workflow, goal, skill, or company-specific concepts.

## License

MIT
