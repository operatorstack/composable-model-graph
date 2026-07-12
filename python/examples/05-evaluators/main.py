#!/usr/bin/env python3
"""
Example 05 - Evaluators. Python parity of typescript/examples/05-evaluators.

Each generic evaluator turns an output (plus optional target) into a structured
EvaluationResult:

    output (+ target) -> Evaluator -> { status, score?, error?, ... }

This exercises every evaluator in the package directly. Evaluators are normally
attached to a ModelGraph, but they are plain objects and can be called on their
own - which is exactly what makes runs inspectable. Uses core + evaluators.

Run (no install needed):
    python3 python/examples/05-evaluators/main.py
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "src"))

from composable_model_graph import (  # noqa: E402
    EvaluationResult,
    RunContext,
    composite_evaluator,
    exact_match_evaluator,
    numeric_error_evaluator,
    threshold_evaluator,
)

context = RunContext(run_id="example-05")


def show(title: str, result: EvaluationResult) -> None:
    parts = [f"status={result.status}"]
    if result.score is not None:
        parts.append(f"score={result.score:.4f}")
    if result.error is not None:
        parts.append(f"error={result.error}")
    print(f"{title:<34} {'  '.join(parts)}")


print("== threshold_evaluator ==")
# Pass when value >= threshold (default direction).
at_least = threshold_evaluator(threshold=0.5)
show("at_least(0.5) <- 0.8", at_least.evaluate(0.8, None, context))
show("at_least(0.5) <- 0.2", at_least.evaluate(0.2, None, context))

# Pass when value <= threshold (e.g. "latency budget").
at_most = threshold_evaluator(threshold=100, direction="at_most")
show("at_most(100) <- 80", at_most.evaluate(80, None, context))
show("at_most(100) <- 150", at_most.evaluate(150, None, context))

print("\n== numeric_error_evaluator ==")
# The evaluated value IS the error. score = 1 / (1 + |error|).
error_eval = numeric_error_evaluator(pass_threshold=0.1, partial_threshold=0.5)
show("error 0.05 (pass)", error_eval.evaluate(0.05, None, context))
show("error 0.30 (partial)", error_eval.evaluate(0.3, None, context))
show("error 1.00 (fail)", error_eval.evaluate(1.0, None, context))

print("\n== exact_match_evaluator ==")
# Structural equality between output and target.
match = exact_match_evaluator()
show("[1,2,3] vs [1,2,3]", match.evaluate([1, 2, 3], [1, 2, 3], context))
show("[1,2,3] vs [1,2,4]", match.evaluate([1, 2, 3], [1, 2, 4], context))

print("\n== composite_evaluator ==")
# Worst status wins; scores are averaged; messages/evidence concatenated.
composite = composite_evaluator(
    [
        threshold_evaluator(threshold=0.5, id="floor", name="Floor"),
        threshold_evaluator(threshold=1.0, id="ceiling", name="Ceiling"),
    ]
)
composite_result = composite.evaluate(0.8, None, context)
show("floor(0.5) + ceiling(1) <- 0.8", composite_result)
print("  messages:", composite_result.messages)
