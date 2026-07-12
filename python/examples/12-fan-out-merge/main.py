#!/usr/bin/env python3
"""
Example 12 - Fan-out + merge (a DAG, not a line). Python parity of
typescript/examples/12-fan-out-merge; same model, byte-identical output.

One reading is estimated two independent ways, then reconciled:

         reading
         /      \\
    physics    empirical      (fan-out: two estimators, same input)
         \\      /
        reconcile             (merge: receives [physics_out, empirical_out])

The reconcile node's output IS the disagreement between the two estimates. A
numeric_error_evaluator turns that into pass/partial/fail, and a
default_feedback_resolver turns THAT into an action: agree -> accept the
reconciled value; diverge -> retry (re-measure). No target needed - the two
models check each other.

This is the whole DAG surface in one run: connections, topological order, a
merge node fed the list of its predecessors' outputs, and evaluation + feedback
applied to the final output of a non-linear graph. Uses core + evaluators +
feedback.

Run (no install needed):
    python3 python/examples/12-fan-out-merge/main.py
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "src"))

from composable_model_graph import (  # noqa: E402
    Connection,
    create_model_graph,
    create_transform,
    default_feedback_resolver,
    numeric_error_evaluator,
)

# An empirical lookup: same base curve plus a measured per-reading adjustment.
# Most readings agree with physics; reading 40 is where the table diverges.
ADJUSTMENT = {10: 0, 20: 2, 30: 0, 40: 20}


def _physics(reading, ctx):  # estimate = 3 * reading + 5
    return 3 * reading + 5


def _empirical(reading, ctx):
    return 3 * reading + 5 + ADJUSTMENT.get(reading, 0)


def _reconcile(estimates, ctx):
    a, b = estimates
    ctx.record_signal("reconciled", (a + b) // 2)
    return abs(a - b)


graph = create_model_graph(
    "fan-out-merge", "Reconcile two estimates",
    [
        create_transform("physics-model", "Physics model", _physics),
        create_transform("empirical-table", "Empirical table", _empirical),
        create_transform("reconcile", "Reconcile estimates", _reconcile),
    ],
    connections=[
        Connection("physics-model", "reconcile"),
        Connection("empirical-table", "reconcile"),
    ],
    # disagreement <= 5 passes; <= 10 is partial; above that fails.
    evaluator=numeric_error_evaluator(pass_threshold=5, partial_threshold=10),
    feedback_resolver=default_feedback_resolver(),
)


def fmt(x) -> str:
    # render whole numbers without a trailing ".0" (TS/Python byte-parity)
    if isinstance(x, float) and x.is_integer():
        return str(int(x))
    return str(x)


def report(reading, run) -> None:
    print(f"reading {reading}")
    print("  trace:")
    for step in run.trace:
        if isinstance(step.input, list):
            in_str = "[" + ", ".join(fmt(v) for v in step.input) + "]"
        else:
            in_str = fmt(step.input)
        print(f"    {step.transform_name:<18} in={in_str:<12} out={fmt(step.output)}")
    reconcile_step = next(s for s in run.trace if s.transform_id == "reconcile")
    print(f"  reconciled estimate: {fmt(reconcile_step.metadata['reconciled'])}")
    print(
        f"  evaluation: {run.evaluation.status}  "
        f"score={run.evaluation.score:.4f}  error={fmt(run.evaluation.error)}"
    )
    print(f"  feedback: {run.feedback.kind}  ({run.feedback.reason})")
    print("")


print("Fan-out + merge: reconcile two independent estimates of one reading\n")

for reading in [10, 20, 30, 40]:
    report(reading, graph.run(reading))

print("Reading: physics and empirical agree on 10/20/30 (accept the reconciled value);")
print("they diverge at 40 (disagreement 20 -> fail -> retry: the models flag a bad reading).")
