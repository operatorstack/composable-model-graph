# 12 — Fan-out + merge (a DAG, not a line)

One reading is estimated two independent ways, then reconciled:

```
      reading
      /      \
 physics    empirical      fan-out: two estimators, same input
      \      /
     reconcile             merge: receives [physicsOut, empiricalOut]
```

The reconcile node's output **is** the disagreement between the two estimates.
A `numericErrorEvaluator` turns that into pass/partial/fail, and a
`defaultFeedbackResolver` turns *that* into an action — agree → **accept** the
reconciled value; diverge → **retry** (re-measure). No target needed: the two
models check each other.

This is the whole DAG surface in one run:

- `connections` on `createModelGraph` (the graph is no longer a line),
- topological execution order,
- a **merge node fed the array of its predecessors' outputs**,
- evaluation **and** feedback applied to the final output of a non-linear graph.

Physics and empirical agree on readings 10/20/30 (accept); they diverge at 40
(disagreement 20 → fail → retry).

## Run

```bash
# TypeScript
pnpm --filter @composable-model-graph/example-12-fan-out-merge start
# Python (byte-identical output)
python3 python/examples/12-fan-out-merge/main.py
```

Captured output: [`expected-output.txt`](expected-output.txt) (shared by both
languages).
