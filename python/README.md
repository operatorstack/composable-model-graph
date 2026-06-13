# composable-model-graph (Python)

The Python side of composable-model-graph. Parity with the TypeScript side
(`../typescript`) is the rule: new capabilities ship in both languages (see
`../docs/development.md`).

This first cut is a real, dependency-free core (so the primitive is usable without
an install), proving the dual-language structure rather than just declaring it.

## What is here

- `composable_model_graph.core` - `Transform`, `create_transform`, `ModelGraph` /
  `create_model_graph`, `RunContext` (with `record_signal`), `TraceStep`, `GraphRun`.
  The runner is **sequential by default and a general DAG when you pass
  `connections`** (linearity is a default, not a limit).
- `composable_model_graph.math` - `sigmoid` / `relu` with `forward`, `derivative`,
  `derivative_from_output` (the neural-proof lane).
- `composable_model_graph.evaluators`, `.feedback` - placeholders; ported with
  parity in follow-up feature PRs.

## Run the smoke test

No install needed:

```sh
cd python
python3 tests/test_smoke.py        # prints "PASS: ..."
```

Or with pytest (after `pip install -e .[dev]`):

```sh
python3 -m pytest
```

## Status

Scaffold + a minimal real core. Features (evaluators, feedback, comparison,
simulation) land next, in lockstep with the TypeScript side.
