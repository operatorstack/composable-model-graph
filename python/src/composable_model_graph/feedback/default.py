"""Map an evaluation status to a feedback action.

    pass    -> accept
    partial -> adjust
    fail    -> retry
    unknown -> custom (inspect)

A run with no evaluation is treated as `unknown`.

(Python parity of typescript feedback/default.ts.)
"""

from __future__ import annotations

from typing import Any, Optional

from ..core import FeedbackAction, FeedbackResolver, create_feedback_resolver


def default_feedback_resolver(
    id: Optional[str] = None,
    name: Optional[str] = None,
) -> FeedbackResolver:
    def resolve(run: Any, context: Any) -> FeedbackAction:
        status = run.evaluation.status if run.evaluation else "unknown"
        if status == "pass":
            return FeedbackAction(kind="accept", reason="evaluation passed")
        if status == "partial":
            return FeedbackAction(kind="adjust", reason="evaluation partial")
        if status == "fail":
            return FeedbackAction(kind="retry", reason="evaluation failed")
        return FeedbackAction(
            kind="custom", reason="inspect", signal={"action": "inspect"}
        )

    return create_feedback_resolver(
        id=id if id is not None else "default-feedback",
        name=name if name is not None else "Default Feedback",
        resolve=resolve,
    )
