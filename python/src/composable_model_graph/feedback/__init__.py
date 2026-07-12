"""Feedback: generic resolvers mapping an evaluation to a next action.

Python parity of the TypeScript feedback package: default (status -> action) and
threshold (score -> action) resolvers. Same names and behavior (see
docs/development.md — every capability ships in BOTH languages).
"""

from .default import default_feedback_resolver
from .threshold import threshold_feedback_resolver

__all__ = [
    "default_feedback_resolver",
    "threshold_feedback_resolver",
]
