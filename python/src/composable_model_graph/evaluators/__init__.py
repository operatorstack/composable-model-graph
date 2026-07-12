"""Evaluators: generic judges of a graph's final output.

Python parity of the TypeScript evaluators package: threshold, numeric-error,
exact-match, composite, and the deep_equal helper. Same names, defaults, and
behavior (see docs/development.md — every capability ships in BOTH languages).
"""

from .composite import composite_evaluator
from .deep_equal import deep_equal
from .exact_match import exact_match_evaluator
from .numeric_error import numeric_error_evaluator
from .threshold import threshold_evaluator

__all__ = [
    "threshold_evaluator",
    "numeric_error_evaluator",
    "exact_match_evaluator",
    "composite_evaluator",
    "deep_equal",
]
