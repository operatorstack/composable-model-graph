# 06 — Skill Routing (inspect + compare)

Proves the thesis in one runnable demo: a model-powered system becomes
**inspectable and comparable** once it is a graph.

We route coding tasks to the right "skill" two ways and compare the runs:

```
Graph A  task -> naive keyword route -> skill            (no structured context)
Graph B  task -> extract requirements -> select skill    (structured context)
```

- Each transform records signals (`tokens`, `costUsd`) via `ctx.recordSignal`.
- An `exactMatchEvaluator` scores chosen-skill vs expected-skill.
- The report shows accuracy, cost, latency, and **where error enters the trace**,
  plus two `compareRuns` cases (one B wins, one honest A-wins tie-break).

## Run

```bash
pnpm --filter @composable-model-graph/example-06-skill-routing start
```

## What it demonstrates

- `RunContext.recordSignal` -> `TraceStep.metadata` (the neutral signal carrier).
- `compareRuns(a, b)` -> status/score/error verdict + aggregated signal deltas +
  `divergedAtStep`.
- The accuracy-vs-capacity tradeoff: Graph B is far more accurate but spends more
  tokens/cost, and the trace localizes failure to the `select-skill` step.

The current captured output is in [`expected-output.txt`](expected-output.txt).
