"""Pass when the output structurally equals the target, otherwise fail.

(Python parity of typescript evaluators/exact-match.ts.)
"""

from __future__ import annotations

from typing import Any, Optional

from ..core import Evaluator, EvaluationResult, Evidence, create_evaluator
from .deep_equal import deep_equal


def exact_match_evaluator(
    id: Optional[str] = None,
    name: Optional[str] = None,
) -> Evaluator:
    def evaluate(output: Any, target: Any, context: Any) -> EvaluationResult:
        matched = deep_equal(output, target)
        return EvaluationResult(
            status="pass" if matched else "fail",
            score=1.0 if matched else 0.0,
            messages=[
                "output matches target" if matched else "output differs from target"
            ],
            evidence=[
                Evidence(label="output", value=output, source="exact-match"),
                Evidence(label="target", value=target, source="exact-match"),
            ],
        )

    return create_evaluator(
        id=id if id is not None else "exact-match",
        name=name if name is not None else "Exact Match",
        evaluate=evaluate,
    )
