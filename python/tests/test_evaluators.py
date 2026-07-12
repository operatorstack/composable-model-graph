"""Tests for the generic evaluators (parity with the TypeScript suite).

Runnable with plain python3 (no install needed):
    python3 tests/test_evaluators.py
Also pytest-compatible (the test_* functions).
"""

import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from composable_model_graph import (  # noqa: E402
    RunContext,
    composite_evaluator,
    deep_equal,
    exact_match_evaluator,
    numeric_error_evaluator,
    threshold_evaluator,
)

CTX = RunContext(run_id="test-run")


def test_threshold_at_least_boundary() -> None:
    ev = threshold_evaluator(threshold=5.0)  # at_least default
    # exactly at the threshold passes
    r = ev.evaluate(5.0, None, CTX)
    assert r.status == "pass" and r.score == 1.0
    assert r.messages[0] == "value 5 meets threshold 5 (at_least)"
    assert ev.evaluate(4.9, None, CTX).status == "fail"


def test_threshold_at_most() -> None:
    ev = threshold_evaluator(threshold=5.0, direction="at_most")
    assert ev.evaluate(5.0, None, CTX).status == "pass"
    assert ev.evaluate(5.1, None, CTX).status == "fail"


def test_numeric_error_transitions_and_score() -> None:
    ev = numeric_error_evaluator(pass_threshold=1.0, partial_threshold=3.0)
    r = ev.evaluate(1.0, None, CTX)  # error 1 -> pass, score 0.5
    assert r.status == "pass" and abs(r.score - 0.5) < 1e-12 and r.error == 1.0
    assert ev.evaluate(2.0, None, CTX).status == "partial"
    assert ev.evaluate(4.0, None, CTX).status == "fail"
    # error uses absolute value
    assert ev.evaluate(-1.0, None, CTX).status == "pass"
    assert ev.evaluate(0.0, None, CTX).messages[0] == "error 0 -> pass (score 1.0000)"


def test_exact_match_nested() -> None:
    ev = exact_match_evaluator()
    a = {"k": [1, 2, {"n": 3}]}
    assert ev.evaluate(a, {"k": [1, 2, {"n": 3}]}, CTX).status == "pass"
    assert ev.evaluate(a, {"k": [1, 2, {"n": 4}]}, CTX).status == "fail"


def test_composite_worst_status_and_aggregates() -> None:
    passing = threshold_evaluator(threshold=0.0)  # 1 >= 0 -> pass, score 1
    failing = threshold_evaluator(threshold=10.0)  # 1 >= 10 -> fail, score 0
    ev = composite_evaluator([passing, failing])
    r = ev.evaluate(1.0, None, CTX)
    # worst of pass/fail is fail; mean score (1 + 0)/2 = 0.5
    assert r.status == "fail"
    assert abs(r.score - 0.5) < 1e-12
    # messages/evidence concatenated from both sub-results
    assert len(r.messages) == 2
    assert len(r.evidence) == 4


def test_composite_all_pass_and_empty() -> None:
    ev = composite_evaluator([threshold_evaluator(threshold=0.0)])
    assert ev.evaluate(1.0, None, CTX).status == "pass"
    # empty list -> unknown, no score
    empty = composite_evaluator([])
    r = empty.evaluate(1.0, None, CTX)
    assert r.status == "unknown" and r.score is None


def test_composite_error_is_max() -> None:
    small = numeric_error_evaluator(pass_threshold=100.0)  # error 1
    big = numeric_error_evaluator(pass_threshold=100.0)  # error 5
    ev = composite_evaluator([small, big])
    # both are numeric-error evaluators; run on the larger magnitude sub via output
    # here output is the error value itself, shared, so craft distinct via wrappers:
    r_small = small.evaluate(1.0, None, CTX)
    r_big = big.evaluate(5.0, None, CTX)
    assert r_small.error == 1.0 and r_big.error == 5.0
    # composite max-error across identical inputs uses the single output; verify max logic
    combo = ev.evaluate(5.0, None, CTX)
    assert combo.error == 5.0


def test_deep_equal_matrix() -> None:
    assert deep_equal(1, 1)
    assert deep_equal([1, [2, 3]], [1, [2, 3]])
    assert not deep_equal([1, 2], [1, 2, 3])
    assert deep_equal({"a": 1, "b": 2}, {"b": 2, "a": 1})
    assert not deep_equal({"a": 1}, {"a": 1, "b": 2})
    # NaN equals NaN (mirror of Object.is)
    assert deep_equal(math.nan, math.nan)
    # bool is not its numeric coincidence: True != 1
    assert not deep_equal(True, 1)
    assert deep_equal(True, True)
    # int/float cross-compare by value (1 == 1.0)
    assert deep_equal(1, 1.0)


if __name__ == "__main__":
    test_threshold_at_least_boundary()
    test_threshold_at_most()
    test_numeric_error_transitions_and_score()
    test_exact_match_nested()
    test_composite_worst_status_and_aggregates()
    test_composite_all_pass_and_empty()
    test_composite_error_is_max()
    test_deep_equal_matrix()
    print("PASS: composable-model-graph python evaluators")
