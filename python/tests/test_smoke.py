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
    TransferFunction,
    create_model_graph,
    create_transform,
    rank_sensitivity,
    sigmoid,
    useful_flow_score,
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


def test_useful_flow_score() -> None:
    s = useful_flow_score(0.8, 4.0)
    assert abs(s.score - 0.2) < 1e-9
    assert useful_flow_score(1.0, 0.0).score == 0.0  # cost 0 -> 0, no blow-up


def test_rank_sensitivity_orders_by_impact() -> None:
    # objective depends strongly on a, weakly on b -> a ranks first
    def objective(k):
        return 10.0 * k["a"] + 0.1 * k["b"]

    ranked = rank_sensitivity({"a": 1.0, "b": 1.0}, objective)
    assert ranked[0].name == "a"
    assert abs(ranked[0].gradient - 10.0) < 1e-6


def test_transfer_function() -> None:
    # static gain: b=[2], a=[] -> y = 2u
    g = TransferFunction(id="gain", name="2x", b=[2.0], a=[])
    assert g.run([1.0, 2.0, 3.0]) == [2.0, 4.0, 6.0]
    # one-step delay: b=[0, 1] -> y(t) = u(t-1)
    d = TransferFunction(id="delay", name="q^-1", b=[0.0, 1.0], a=[])
    assert d.run([1.0, 2.0, 3.0]) == [0.0, 1.0, 2.0]
    # first-order recursive: y(t) = u(t) + 0.5 y(t-1) -> 1, 0.5, 0.25, 0.125
    r = TransferFunction(id="iir", name="1/(1-0.5q^-1)", b=[1.0], a=[-0.5])
    out = r.run([1.0, 0.0, 0.0, 0.0])
    assert abs(out[0] - 1.0) < 1e-12 and abs(out[1] - 0.5) < 1e-12
    assert abs(out[2] - 0.25) < 1e-12 and abs(out[3] - 0.125) < 1e-12
    # requires at least b0
    raised = False
    try:
        TransferFunction(id="bad", name="bad", b=[], a=[])
    except ValueError:
        raised = True
    assert raised


if __name__ == "__main__":
    test_linear_graph_and_signals()
    test_non_linear_graph_merges_predecessors()
    test_sigmoid_forward_and_derivative()
    test_useful_flow_score()
    test_rank_sensitivity_orders_by_impact()
    test_transfer_function()
    print("PASS: composable-model-graph python smoke")
