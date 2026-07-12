"""Tests for compare_runs (parity with the TypeScript suite).

Runnable with plain python3 (no install needed):
    python3 tests/test_compare.py
Also pytest-compatible (the test_* functions).
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from composable_model_graph import (  # noqa: E402
    EvaluationResult,
    GraphRun,
    TraceStep,
    compare_runs,
)


def _step(transform_id, output, metadata=None, duration_ms=1.0) -> TraceStep:
    return TraceStep(
        transform_id=transform_id,
        transform_name=transform_id.upper(),
        input=None,
        output=output,
        started_at=0.0,
        finished_at=duration_ms,
        duration_ms=duration_ms,
        metadata=metadata or {},
    )


def _run(status=None, score=None, error=None, trace=None) -> GraphRun:
    evaluation = None
    if status is not None or score is not None or error is not None:
        evaluation = EvaluationResult(status=status or "unknown", score=score, error=error)
    return GraphRun(input=None, output=None, trace=trace or [], evaluation=evaluation)


def test_verdict_by_status_rank() -> None:
    c = compare_runs(_run(status="fail"), _run(status="pass"))
    assert c.better == "b"
    assert c.reason == "B has the better status (fail vs pass)"


def test_score_tiebreak_on_equal_status() -> None:
    c = compare_runs(_run(status="pass", score=0.4), _run(status="pass", score=0.6))
    assert c.better == "b"
    assert c.reason == "B has the higher score (0.4 vs 0.6)"
    assert abs(c.score["delta"] - 0.2) < 1e-12


def test_error_tiebreak_on_equal_status_and_score() -> None:
    a = _run(status="pass", score=0.5, error=2.0)
    b = _run(status="pass", score=0.5, error=1.0)
    c = compare_runs(a, b)
    assert c.better == "b"
    assert c.reason == "B has the lower error (2 vs 1)"


def test_full_tie() -> None:
    c = compare_runs(_run(status="pass", score=0.5), _run(status="pass", score=0.5))
    assert c.better == "tie"
    assert c.reason == "runs are equivalent on the available evaluation"


def test_missing_evaluation_ranks_below_unknown() -> None:
    # a has no evaluation (rank -1), b is unknown (rank 0) -> b wins
    c = compare_runs(_run(), _run(status="unknown"))
    assert c.better == "b"
    assert c.reason == "B has the better status (none vs unknown)"


def test_signal_aggregation() -> None:
    a = _run(
        status="pass",
        trace=[_step("t", 1, {"tokens": 10, "note": "x", "flag": True}, duration_ms=2.0)],
    )
    b = _run(
        status="pass",
        trace=[_step("t", 1, {"tokens": 25}, duration_ms=3.0)],
    )
    c = compare_runs(a, b)
    # numeric metadata summed; strings and bools excluded
    assert c.signals["tokens"].a == 10 and c.signals["tokens"].b == 25
    assert c.signals["tokens"].delta == 15
    assert "note" not in c.signals and "flag" not in c.signals
    # duration always aggregated under duration_ms
    assert c.signals["duration_ms"].a == 2.0 and c.signals["duration_ms"].b == 3.0


def test_diverged_at_step() -> None:
    a = _run(trace=[_step("t1", 1), _step("t2", 2)])
    b_same = _run(trace=[_step("t1", 1), _step("t2", 2)])
    assert compare_runs(a, b_same).diverged_at_step is None
    # differ by output at step 1
    b_out = _run(trace=[_step("t1", 1), _step("t2", 99)])
    assert compare_runs(a, b_out).diverged_at_step == 1
    # differ by transform id at step 0
    b_id = _run(trace=[_step("tX", 1), _step("t2", 2)])
    assert compare_runs(a, b_id).diverged_at_step == 0
    # identical prefix but different length -> shared index
    b_short = _run(trace=[_step("t1", 1)])
    assert compare_runs(a, b_short).diverged_at_step == 1


if __name__ == "__main__":
    test_verdict_by_status_rank()
    test_score_tiebreak_on_equal_status()
    test_error_tiebreak_on_equal_status_and_score()
    test_full_tie()
    test_missing_evaluation_ranks_below_unknown()
    test_signal_aggregation()
    test_diverged_at_step()
    print("PASS: composable-model-graph python compare")
