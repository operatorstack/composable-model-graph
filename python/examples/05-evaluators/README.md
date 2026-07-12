# 05 — Evaluators (Python)

Python parity of `typescript/examples/05-evaluators`. Exercises every generic
evaluator directly:

```
output (+ target) -> Evaluator -> { status, score?, error?, messages?, evidence? }
```

- `threshold_evaluator` — pass by `>=` (default) or `<=` (`at_most`).
- `numeric_error_evaluator` — the output IS the error; `score = 1 / (1 + |error|)`.
- `exact_match_evaluator` — structural equality vs the target.
- `composite_evaluator` — worst status wins, scores averaged, messages concatenated.

Evaluators are normally attached to a `ModelGraph`, but they are plain objects
you can call on their own — which is what makes runs inspectable.

## Run

```bash
python3 python/examples/05-evaluators/main.py
```

Captured output: [`expected-output.txt`](expected-output.txt).
