"""Pass / fail an output by comparing it to a numeric threshold.

(Python parity of typescript evaluators/threshold.ts.)
"""

from __future__ import annotations

from typing import Any, Literal, Optional

from ..core import Evaluator, EvaluationResult, Evidence, create_evaluator
from ..core._format import format_number as _fmt


def threshold_evaluator(
    threshold: float,
    direction: Literal["at_least", "at_most"] = "at_least",
    id: Optional[str] = None,
    name: Optional[str] = None,
) -> Evaluator:
    """Pass when `output >= threshold` ("at_least", default) or
    `output <= threshold` ("at_most")."""

    def evaluate(output: Any, target: Any, context: Any) -> EvaluationResult:
        passed = output >= threshold if direction == "at_least" else output <= threshold
        return EvaluationResult(
            status="pass" if passed else "fail",
            score=1.0 if passed else 0.0,
            messages=[
                f"value {_fmt(output)} {'meets' if passed else 'misses'} "
                f"threshold {_fmt(threshold)} ({direction})"
            ],
            evidence=[
                Evidence(label="value", value=output, source="threshold"),
                Evidence(label="threshold", value=threshold, source="threshold"),
            ],
        )

    return create_evaluator(
        id=id if id is not None else "threshold",
        name=name if name is not None else "Threshold",
        evaluate=evaluate,
    )
