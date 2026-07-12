"""Combine several evaluators into one.

- status: the worst status across all sub-results (fail < partial < unknown < pass).
- score: the mean of all defined sub-scores.
- error: the maximum of all defined sub-errors.
- messages / evidence: concatenated from every sub-result.

(Python parity of typescript evaluators/composite.ts; sub-evaluators run
sequentially — Python stays sync.)
"""

from __future__ import annotations

from typing import Any, Optional

from ..core import Evaluator, EvaluationResult, create_evaluator

# Lower index = "worse". The combined status is the worst observed status.
_STATUS_SEVERITY: dict[str, int] = {
    "fail": 0,
    "partial": 1,
    "unknown": 2,
    "pass": 3,
}


def _combine_statuses(statuses: list[str]) -> str:
    if not statuses:
        return "unknown"
    worst = statuses[0]
    for current in statuses[1:]:
        if _STATUS_SEVERITY[current] < _STATUS_SEVERITY[worst]:
            worst = current
    return worst


def composite_evaluator(
    evaluators: list[Evaluator],
    id: Optional[str] = None,
    name: Optional[str] = None,
) -> Evaluator:
    def evaluate(output: Any, target: Any, context: Any) -> EvaluationResult:
        results = [e.evaluate(output, target, context) for e in evaluators]

        statuses = [result.status for result in results]
        scores = [
            result.score
            for result in results
            if isinstance(result.score, (int, float)) and not isinstance(result.score, bool)
        ]
        errors = [
            result.error
            for result in results
            if isinstance(result.error, (int, float)) and not isinstance(result.error, bool)
        ]
        messages = [m for result in results for m in (result.messages or [])]
        evidence = [e for result in results for e in (result.evidence or [])]

        combined = EvaluationResult(status=_combine_statuses(statuses))
        if scores:
            combined.score = sum(scores) / len(scores)
        if errors:
            combined.error = max(errors)
        if messages:
            combined.messages = messages
        if evidence:
            combined.evidence = evidence
        return combined

    return create_evaluator(
        id=id if id is not None else "composite",
        name=name if name is not None else "Composite",
        evaluate=evaluate,
    )
