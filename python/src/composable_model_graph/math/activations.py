"""Activations (the neural-proof lane), mirroring the TypeScript math package.

Each activation exposes forward + derivative (and derivative_from_output, the
efficient form). Used, for example, to map a raw metric to a bounded 0..1 value
and to read the local sensitivity (the derivative) for gradient-style reasoning.
Theory informs the design; the exposed API is just forward / derivative.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Callable


@dataclass
class Activation:
    id: str
    name: str
    forward: Callable[[float], float]
    derivative: Callable[[float], float]
    derivative_from_output: Callable[[float], float]


def _sigmoid_forward(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


def _sigmoid_derivative(x: float) -> float:
    s = _sigmoid_forward(x)
    return s * (1.0 - s)


def _sigmoid_derivative_from_output(y: float) -> float:
    return y * (1.0 - y)


sigmoid = Activation(
    id="sigmoid",
    name="Sigmoid",
    forward=_sigmoid_forward,
    derivative=_sigmoid_derivative,
    derivative_from_output=_sigmoid_derivative_from_output,
)


def _relu_forward(x: float) -> float:
    return x if x > 0.0 else 0.0


def _relu_derivative(x: float) -> float:
    return 1.0 if x > 0.0 else 0.0


relu = Activation(
    id="relu",
    name="ReLU",
    forward=_relu_forward,
    derivative=_relu_derivative,
    derivative_from_output=lambda y: 1.0 if y > 0.0 else 0.0,
)
