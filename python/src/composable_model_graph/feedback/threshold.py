"""Decide a feedback action from the evaluation score.

    score >= accept_score                  -> accept
    retry_score set and score < retry_score -> retry
    otherwise (score present)               -> adjust
    score absent                            -> custom (inspect)

(Python parity of typescript feedback/threshold.ts.)
"""

from __future__ import annotations

from typing import Any, Optional

from ..core import FeedbackAction, FeedbackResolver, create_feedback_resolver
from ..core._format import format_number as _fmt


def threshold_feedback_resolver(
    accept_score: float,
    retry_score: Optional[float] = None,
    id: Optional[str] = None,
    name: Optional[str] = None,
) -> FeedbackResolver:
    def resolve(run: Any, context: Any) -> FeedbackAction:
        score = run.evaluation.score if run.evaluation else None
        if score is None:
            return FeedbackAction(
                kind="custom",
                reason="no score to threshold",
                signal={"action": "inspect"},
            )
        if score >= accept_score:
            return FeedbackAction(
                kind="accept", reason=f"score {_fmt(score)} >= {_fmt(accept_score)}"
            )
        if retry_score is not None and score < retry_score:
            return FeedbackAction(
                kind="retry", reason=f"score {_fmt(score)} < {_fmt(retry_score)}"
            )
        return FeedbackAction(
            kind="adjust", reason=f"score {_fmt(score)} < {_fmt(accept_score)}"
        )

    return create_feedback_resolver(
        id=id if id is not None else "threshold-feedback",
        name=name if name is not None else "Threshold Feedback",
        resolve=resolve,
    )
