"""Tests for evaluator/feedback invocation in the graph runner, plus DAG errors.

Runnable with plain python3 (no install needed):
    python3 tests/test_graph_evaluation.py
Also pytest-compatible (the test_* functions).
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from composable_model_graph import (  # noqa: E402
    Connection,
    create_model_graph,
    create_transform,
    default_feedback_resolver,
    exact_match_evaluator,
    numeric_error_evaluator,
)


def test_sequential_graph_populates_evaluation_and_feedback() -> None:
    # output IS the error value; numeric-error passes at threshold 1
    t = create_transform("t", "T", lambda x, ctx: x)
    g = create_model_graph(
        "g", "seq", [t],
        evaluator=numeric_error_evaluator(pass_threshold=1.0),
        feedback_resolver=default_feedback_resolver(),
    )
    run = g.run(0.5, target=None)
    assert run.evaluation is not None and run.evaluation.status == "pass"
    assert run.feedback is not None and run.feedback.kind == "accept"


def test_target_threading_and_exact_match() -> None:
    t = create_transform("t", "T", lambda x, ctx: x * 2)
    g = create_model_graph("g", "seq", [t], evaluator=exact_match_evaluator())
    run = g.run(3, target=6)  # output 6 == target 6
    assert run.evaluation.status == "pass"
    run2 = g.run(3, target=7)
    assert run2.evaluation.status == "fail"


def test_timing_invariant() -> None:
    t = create_transform("t", "T", lambda x, ctx: x)
    run = create_model_graph("g", "seq", [t]).run(1)
    step = run.trace[0]
    assert step.started_at <= step.finished_at
    assert abs(step.duration_ms - (step.finished_at - step.started_at)) < 1e-9


def test_dag_evaluation_sees_final_output() -> None:
    a = create_transform("a", "A", lambda x, ctx: x + 1)
    b = create_transform("b", "B", lambda x, ctx: x * 10)
    merge = create_transform("m", "Merge", lambda preds, ctx: sum(preds))
    g = create_model_graph(
        "g", "dag", [a, b, merge],
        connections=[Connection("a", "m"), Connection("b", "m")],
        evaluator=exact_match_evaluator(),
    )
    run = g.run(2, target=23)  # a->3, b->20, merge->23
    assert run.output == 23 and run.evaluation.status == "pass"


def test_cycle_raises() -> None:
    a = create_transform("a", "A", lambda x, ctx: x)
    b = create_transform("b", "B", lambda x, ctx: x)
    g = create_model_graph(
        "g", "cyc", [a, b],
        connections=[Connection("a", "b"), Connection("b", "a")],
    )
    raised = False
    try:
        g.run(1)
    except ValueError as e:
        raised = "cycle" in str(e)
    assert raised


def test_unknown_connection_id_raises() -> None:
    a = create_transform("a", "A", lambda x, ctx: x)
    g = create_model_graph(
        "g", "bad", [a], connections=[Connection("a", "ghost")]
    )
    raised = False
    try:
        g.run(1)
    except ValueError as e:
        raised = "unknown transform id" in str(e)
    assert raised


if __name__ == "__main__":
    test_sequential_graph_populates_evaluation_and_feedback()
    test_target_threading_and_exact_match()
    test_timing_invariant()
    test_dag_evaluation_sees_final_output()
    test_cycle_raises()
    test_unknown_connection_id_raises()
    print("PASS: composable-model-graph python graph-evaluation")
