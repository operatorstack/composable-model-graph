"""Compare two completed graph runs. (Python parity of typescript core/compare.ts.)

The verdict ranks by evaluation status first (pass > partial > fail > unknown),
then by higher score, then by lower error. Signals are aggregated but never
decide the verdict — they describe the cost of each run so the caller can weigh
quality against capacity (tokens, cost, latency).

Language-idiom notes (documented so cross-language consumers are not surprised):
the always-present duration signal is keyed "duration_ms" here and "durationMs"
in TypeScript; divergence detection compares outputs structurally with `==`
where TypeScript compares `JSON.stringify` — aligned for JSON-like values.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any, Optional

from ._format import format_number as _fmt
from .types import EvaluationStatus, GraphRun, TraceStep

_STATUS_RANK: dict[str, int] = {
    "pass": 3,
    "partial": 2,
    "fail": 1,
    "unknown": 0,
}


@dataclass
class SignalDelta:
    """Aggregated value of one numeric signal across two runs."""

    a: float
    b: float
    delta: float  # b - a; negative means B used less of the signal


@dataclass
class RunComparison:
    """A structured, domain-neutral comparison of two graph runs."""

    better: str  # "a" | "b" | "tie"
    reason: str
    status: dict[str, Optional[EvaluationStatus]]  # keys "a", "b"
    score: dict[str, Optional[float]]  # keys "a", "b", "delta"
    error: dict[str, Optional[float]]  # keys "a", "b", "delta"
    signals: dict[str, SignalDelta] = field(default_factory=dict)
    # index of the first trace step where the runs diverge; None when identical
    diverged_at_step: Optional[int] = None


def _aggregate_signals(trace: list[TraceStep]) -> dict[str, float]:
    """Sum duration_ms plus every finite numeric metadata signal across a trace."""
    totals: dict[str, float] = {}
    for step in trace:
        totals["duration_ms"] = totals.get("duration_ms", 0.0) + step.duration_ms
        for key, value in (step.metadata or {}).items():
            # bool is an int subclass in Python; exclude it (TS typeof excludes booleans)
            if isinstance(value, bool):
                continue
            if isinstance(value, (int, float)) and math.isfinite(value):
                totals[key] = totals.get(key, 0.0) + value
    return totals


def _diff_signals(
    a: dict[str, float], b: dict[str, float]
) -> dict[str, SignalDelta]:
    signals: dict[str, SignalDelta] = {}
    for key in set(a) | set(b):
        av = a.get(key, 0.0)
        bv = b.get(key, 0.0)
        signals[key] = SignalDelta(a=av, b=bv, delta=bv - av)
    return signals


def _first_divergent_step(
    a: list[TraceStep], b: list[TraceStep]
) -> Optional[int]:
    shared = min(len(a), len(b))
    for i in range(shared):
        if a[i].transform_id != b[i].transform_id or a[i].output != b[i].output:
            return i
    return None if len(a) == len(b) else shared


def compare_runs(a: GraphRun, b: GraphRun) -> RunComparison:
    status_a = a.evaluation.status if a.evaluation else None
    status_b = b.evaluation.status if b.evaluation else None
    score_a = a.evaluation.score if a.evaluation else None
    score_b = b.evaluation.score if b.evaluation else None
    error_a = a.evaluation.error if a.evaluation else None
    error_b = b.evaluation.error if b.evaluation else None

    better = "tie"
    reason = "runs are equivalent on the available evaluation"

    rank_a = _STATUS_RANK[status_a] if status_a is not None else -1
    rank_b = _STATUS_RANK[status_b] if status_b is not None else -1

    if rank_a != rank_b:
        better = "b" if rank_b > rank_a else "a"
        reason = (
            f"{better.upper()} has the better status "
            f"({status_a if status_a is not None else 'none'} vs "
            f"{status_b if status_b is not None else 'none'})"
        )
    elif score_a is not None and score_b is not None and score_a != score_b:
        better = "b" if score_b > score_a else "a"
        reason = (
            f"{better.upper()} has the higher score "
            f"({_fmt(score_a)} vs {_fmt(score_b)})"
        )
    elif error_a is not None and error_b is not None and error_a != error_b:
        better = "b" if error_b < error_a else "a"
        reason = (
            f"{better.upper()} has the lower error "
            f"({_fmt(error_a)} vs {_fmt(error_b)})"
        )

    return RunComparison(
        better=better,
        reason=reason,
        status={"a": status_a, "b": status_b},
        score={
            "a": score_a,
            "b": score_b,
            "delta": (
                score_b - score_a
                if score_a is not None and score_b is not None
                else None
            ),
        },
        error={
            "a": error_a,
            "b": error_b,
            "delta": (
                error_b - error_a
                if error_a is not None and error_b is not None
                else None
            ),
        },
        signals=_diff_signals(
            _aggregate_signals(a.trace), _aggregate_signals(b.trace)
        ),
        diverged_at_step=_first_divergent_step(a.trace, b.trace),
    )
