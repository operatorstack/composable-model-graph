# 06 — Skill Routing (Python): inspect + compare

Python parity of `typescript/examples/06-skill-routing`. A model-powered system
becomes **inspectable and comparable** once it is a graph. Two routers, compared:

```
Graph A  task -> naive keyword route -> skill            (no structured context)
Graph B  task -> extract requirements -> select skill    (structured context)
```

- Each transform records signals (`tokens`, `cost_usd`) via `ctx.record_signal`.
- An `exact_match_evaluator` scores chosen-skill vs expected-skill.
- The report shows accuracy, cost, and **where error enters the trace**, plus two
  `compare_runs` cases (one B wins, one honest A-wins).

Unlike the TypeScript original, the aggregate line does **not** print wall-clock
duration (the one nondeterministic signal). `compare_runs` still aggregates it
under `duration_ms` for the caller — it's just not printed, so the output is
byte-stable.

## Run

```bash
python3 python/examples/06-skill-routing/main.py
```

Captured output: [`expected-output.txt`](expected-output.txt).

## What it demonstrates

- `RunContext.record_signal` → `TraceStep.metadata` (the neutral signal carrier).
- `compare_runs(a, b)` → status/score/error verdict + aggregated signal deltas +
  `diverged_at_step`.
- The accuracy-vs-capacity tradeoff, localized in the trace to `select-skill`.
