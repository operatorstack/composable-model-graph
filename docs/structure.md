# Structure

composable-model-graph is a **dual-language** library. The two implementations are
kept at parity; shared, language-agnostic material lives at the root.

```
composable-model-graph/
  README.md            entry point
  CHANGELOG.md         the reasoning trail (one entry per change)
  docs/                language-agnostic: design, philosophy, discipline
    00-overview.md     ... 04-harness-bridge.md   (the design)
    philosophy.md      why it exists, the bar it holds to
    development.md      how features earn their place (parity, use-case-pulled)
    structure.md        this file
  typescript/          the TypeScript implementation (pnpm workspace)
    packages/          core, math, evaluators, feedback, estimation
    examples/          01..NN, each domain-free, with README + expected-output
  python/              the Python implementation (src layout)
    src/composable_model_graph/   core, math, evaluators, feedback, estimation
    tests/
```

## Run each side

TypeScript:

```sh
cd typescript
pnpm install
pnpm typecheck
pnpm --filter @composable-model-graph/example-01-core-pipeline start
```

Python:

```sh
cd python
python3 tests/test_smoke.py        # no install needed (the core is dependency-free)
# or, after `pip install -e .[dev]`:  python3 -m pytest
```

## Parity rule

A capability ships in both `typescript/` and `python/`, with matching names and
behavior (see `development.md`). Both sides now ship `core` (transforms, the
sequential/DAG runner, evaluation, feedback, comparison), `math`, `evaluators`,
and `feedback` at parity; new capabilities land in lockstep.

## Two languages, one design

The design docs (`00`-`04`) describe the primitive once, language-agnostically.
Both implementations follow them. When the design changes, the docs change first,
then both implementations.
