"""Evaluate a numeric error value.

The evaluated output IS the error value. The score is monotonically decreasing
in the error magnitude:

    score = 1 / (1 + |error|)

(Python parity of typescript evaluators/numeric-error.ts.)
"""

from __future__ import annotations

from typing import Any, Optional

from ..core import Evaluator, EvaluationResult, Evidence, create_evaluator
from ..core._format import format_number as _fmt


def numeric_error_evaluator(
    pass_threshold: float,
    partial_threshold: Optional[float] = None,
    id: Optional[str] = None,
    name: Optional[str] = None,
) -> Evaluator:
    """Pass at or below `pass_threshold`; `partial` at or below the optional
    `partial_threshold` (must be greater than `pass_threshold`); fail above."""

    def evaluate(output: Any, target: Any, context: Any) -> EvaluationResult:
        error = abs(output)
        score = 1.0 / (1.0 + error)

        if error <= pass_threshold:
            status = "pass"
        elif partial_threshold is not None and error <= partial_threshold:
            status = "partial"
        else:
            status = "fail"

        return EvaluationResult(
            status=status,
            score=score,
            error=float(error),
            messages=[f"error {_fmt(error)} -> {status} (score {score:.4f})"],
            evidence=[Evidence(label="error", value=error, source="numeric-error")],
        )

    return create_evaluator(
        id=id if id is not None else "numeric-error",
        name=name if name is not None else "Numeric Error",
        evaluate=evaluate,
    )
