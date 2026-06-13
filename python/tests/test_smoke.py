"""Smoke test: the Python core + math run, including a NON-linear graph.

Runnable with plain python3 (no install needed):
    python3 tests/test_smoke.py
Also pytest-compatible (the test_* functions).
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from composable_model_graph import (  # noqa: E402
    Connection,
    create_model_graph,
    create_transform,
    sigmoid,
)


def test_linear_graph_and_signals() -> None:
    trim = create_transform("trim", "Trim", lambda s, ctx: s.strip())

    def _upper(s, ctx):
        ctx.record_signal("chars", len(s))
        return s.upper()

    upper = create_transform("upper", "Upper", _upper)
    graph = create_model_graph("g", "linear", [trim, upper])
    run = graph.run("  hi  ")

    assert run.output == "HI"
    assert len(run.trace) == 2
    # the signal recorded inside the transform landed in that step's metadata
    assert run.trace[1].metadata["chars"] == 2


def test_non_linear_graph_merges_predecessors() -> None:
    a = create_transform("a", "A", lambda x, ctx: x + 1)
    b = create_transform("b", "B", lambda x, ctx: x * 10)
    merge = create_transform("m", "Merge", lambda preds, ctx: sum(preds))
    # a and b both feed merge: a DAG, not a line (linearity is not a limit)
    graph = create_model_graph(
        "g2", "dag", [a, b, merge],
        connections=[Connection("a", "m"), Connection("b", "m")],
    )
    run = graph.run(2)  # a -> 3, b -> 20, merge -> 23
    assert run.output == 23


def test_sigmoid_forward_and_derivative() -> None:
    assert abs(sigmoid.forward(0.0) - 0.5) < 1e-9
    assert abs(sigmoid.derivative(0.0) - 0.25) < 1e-9
    assert abs(sigmoid.derivative_from_output(0.5) - 0.25) < 1e-9


if __name__ == "__main__":
    test_linear_graph_and_signals()
    test_non_linear_graph_merges_predecessors()
    test_sigmoid_forward_and_derivative()
    print("PASS: composable-model-graph python smoke")
