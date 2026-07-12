"""Tests for the feedback resolvers (parity with the TypeScript suite).

Runnable with plain python3 (no install needed):
    python3 tests/test_feedback.py
Also pytest-compatible (the test_* functions).
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from composable_model_graph import (  # noqa: E402
    EvaluationResult,
    GraphRun,
    RunContext,
    default_feedback_resolver,
    threshold_feedback_resolver,
)

CTX = RunContext(run_id="test-run")


def _run_with(evaluation=None) -> GraphRun:
    return GraphRun(input=None, output=None, trace=[], evaluation=evaluation)


def test_default_resolver_status_mapping() -> None:
    r = default_feedback_resolver()
    assert r.resolve(_run_with(EvaluationResult(status="pass")), CTX).kind == "accept"
    assert r.resolve(_run_with(EvaluationResult(status="partial")), CTX).kind == "adjust"
    assert r.resolve(_run_with(EvaluationResult(status="fail")), CTX).kind == "retry"
    unknown = r.resolve(_run_with(EvaluationResult(status="unknown")), CTX)
    assert unknown.kind == "custom" and unknown.reason == "inspect"
    # no evaluation at all is treated as unknown
    assert r.resolve(_run_with(None), CTX).kind == "custom"


def test_threshold_resolver() -> None:
    r = threshold_feedback_resolver(accept_score=0.8, retry_score=0.3)
    accept = r.resolve(_run_with(EvaluationResult(status="pass", score=0.9)), CTX)
    assert accept.kind == "accept" and accept.reason == "score 0.9 >= 0.8"
    assert r.resolve(_run_with(EvaluationResult(status="partial", score=0.5)), CTX).kind == "adjust"
    assert r.resolve(_run_with(EvaluationResult(status="fail", score=0.2)), CTX).kind == "retry"
    # no score -> custom inspect
    noscore = r.resolve(_run_with(EvaluationResult(status="unknown")), CTX)
    assert noscore.kind == "custom" and noscore.reason == "no score to threshold"


if __name__ == "__main__":
    test_default_resolver_status_mapping()
    test_threshold_resolver()
    print("PASS: composable-model-graph python feedback")
