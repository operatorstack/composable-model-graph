"""Finite-difference sensitivity. (Python parity of typescript math/sensitivity.ts.)

The principle (calculus / control / the neural gradient). The sensitivity of an
objective f to a parameter x is its derivative df/dx, the local slope. When f is a
black box (you can evaluate it but not differentiate it), the central
finite-difference estimate is the discrete stand-in:

    df/dx ~= ( f(x + h) - f(x - h) ) / (2h)

This is the same quantity a neural net follows downhill (the gradient), and the same
"plant sensitivity" a control engineer reads to see which input binds the response.
It needs only the ability to evaluate f, so it works on any objective, including one
computed by running a graph. Ranking knobs by |sensitivity| answers "what to tune
next": the knob with the largest magnitude moves the objective most per unit change.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable


@dataclass
class Sensitivity:
    at: float       # the knob value where the slope was measured
    value: float    # the objective value there, f(x)
    gradient: float  # estimated df/dx (central finite difference)


def sensitivity(
    objective: Callable[[float], float], x: float, step: float = 1e-3
) -> Sensitivity:
    """Estimate df/dx for a scalar objective at x via central finite difference."""
    h = step if step != 0 else 1e-3
    value = objective(x)
    gradient = (objective(x + h) - objective(x - h)) / (2 * h)
    return Sensitivity(at=x, value=value, gradient=gradient)


@dataclass
class KnobSensitivity:
    name: str
    gradient: float
    magnitude: float  # |gradient|, the ranking key


def rank_sensitivity(
    knobs: dict[str, float],
    objective: Callable[[dict[str, float]], float],
    step: float = 1e-3,
) -> list[KnobSensitivity]:
    """Rank knobs by how much each moves the objective at the current point.

    The objective takes the full set of knob values; each knob is perturbed in turn
    by a central difference while the others are held fixed. The result is sorted by
    |gradient| descending, so the front of the list is "what to tune next".
    """
    h = step if step != 0 else 1e-3
    ranked: list[KnobSensitivity] = []
    for name in knobs:
        base = knobs.get(name, 0.0)
        up = {**knobs, name: base + h}
        down = {**knobs, name: base - h}
        gradient = (objective(up) - objective(down)) / (2 * h)
        ranked.append(KnobSensitivity(name=name, gradient=gradient, magnitude=abs(gradient)))
    ranked.sort(key=lambda r: r.magnitude, reverse=True)
    return ranked
