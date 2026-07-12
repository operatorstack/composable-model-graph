# composable-model-graph (Python)

The Python side of composable-model-graph. Parity with the TypeScript side
(`../typescript`) is the rule: new capabilities ship in both languages (see
`../docs/development.md`).

A real, dependency-free core (so the primitive is usable without an install),
at parity with the TypeScript side.

## What is here

- `composable_model_graph.core` - `Transform`, `create_transform`, `ModelGraph` /
  `create_model_graph`, `RunContext` (with `record_signal`), `TraceStep`, `GraphRun`,
  the evaluation/feedback types (`Evaluator`, `EvaluationResult`, `Evidence`,
  `FeedbackResolver`, `FeedbackAction`, with `create_evaluator` /
  `create_feedback_resolver`), and `compare_runs` (`RunComparison`, `SignalDelta`).
  The runner is **sequential by default and a general DAG when you pass
  `connections`** (linearity is a default, not a limit), and it invokes an attached
  evaluator / feedback resolver after the transforms run.
- `composable_model_graph.evaluators` - `threshold_evaluator`,
  `numeric_error_evaluator`, `exact_match_evaluator`, `composite_evaluator`,
  `deep_equal`.
- `composable_model_graph.feedback` - `default_feedback_resolver`,
  `threshold_feedback_resolver`.
- `composable_model_graph.math` - `sigmoid` / `relu` with `forward`, `derivative`,
  `derivative_from_output` (the neural-proof lane), `sensitivity` / `rank_sensitivity`,
  `TransferFunction`.
- `composable_model_graph.estimation` - `decode_path` / `decode_path_fixed_lag`
  over `CandidateState` trellises (Viterbi / fixed-lag), domain-free.

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

At parity with TypeScript on core, evaluators, feedback, comparison, and math.
New capabilities continue to land in lockstep across both languages.
