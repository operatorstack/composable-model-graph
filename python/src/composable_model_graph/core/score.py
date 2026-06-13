"""Useful-flow scoring: Phi = Q / C. (Python parity of typescript core/score.ts.)

The principle (network flow / operations research). Treat a run as flow from a
source (the task) to an accepted sink (a verified result). Not all of that flow is
useful: some budget is spent on cost (tokens, time, money, retries). The useful-flow
score is the quality that reaches the sink per unit of cost spent to get it:

    Phi = Q / C

where Q aggregates quality (correctness, completeness, confidence, ...) and C
aggregates cost (tokens, latency, money, retries, ...). It is the one quantity three
fields already share a name for: an engineer's "useful output per dollar," an OR
analyst's "throughput per unit capacity," and a systems reading of max-flow where
the bottleneck caps the useful flow. Higher Phi is a better run; comparing Phi
across configurations is the cheapest honest way to ask "which one earns its cost?"

It is a scoring lens, not a theorem: you choose the terms and weights of Q and C.
combine_cost / combine_quality make that choice explicit and inspectable.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class UsefulFlowScore:
    quality: float
    cost: float
    score: float  # Phi = quality / cost (0 when cost <= 0)


def useful_flow_score(quality: float, cost: float) -> UsefulFlowScore:
    """Phi = Q / C. Returns 0 when cost is non-positive."""
    score = quality / cost if cost > 0 else 0.0
    return UsefulFlowScore(quality=quality, cost=cost, score=score)


# Default cost weighting: count raw token/compute cost only. A domain re-weights to
# also value latency, money, retries, human effort, or risk.
_DEFAULT_COST_WEIGHTS: dict[str, float] = {
    "tokens": 1.0,
    "latency": 0.0,
    "money": 0.0,
    "retries": 0.0,
    "human": 0.0,
    "risk": 0.0,
}

# Default quality weighting: each named quality term counts equally.
_DEFAULT_QUALITY_WEIGHTS: dict[str, float] = {
    "correctness": 1.0,
    "completeness": 1.0,
    "confidence": 1.0,
    "relation": 1.0,
    "scope": 1.0,
}


def combine_cost(
    terms: dict[str, float], weights: dict[str, float] | None = None
) -> float:
    """Weighted sum of named cost terms: C = sum_k weight[k] * term[k]."""
    w = {**_DEFAULT_COST_WEIGHTS, **(weights or {})}
    return sum(terms.get(k, 0.0) * w.get(k, 0.0) for k in w)


def combine_quality(
    terms: dict[str, float], weights: dict[str, float] | None = None
) -> float:
    """Weighted sum of named quality terms: Q = sum_k weight[k] * term[k]."""
    w = {**_DEFAULT_QUALITY_WEIGHTS, **(weights or {})}
    return sum(terms.get(k, 0.0) * w.get(k, 0.0) for k in w)
