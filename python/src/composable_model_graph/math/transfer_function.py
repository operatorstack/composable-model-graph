"""Transfer function (LTI / IIR filter), mirroring the TypeScript math package.

A single-input single-output linear time-invariant filter expressed as a rational
transfer function G(q) = B(q)/A(q), i.e. the difference equation (run from rest,
inputs and outputs zero for t < 0):

    y(t) = b0 u(t) + b1 u(t-1) + ... + bnb u(t-nb)
           - a1 y(t-1) - ... - ana y(t-na)

Forward pass only (an IIR filter applied to its input sequence); there is no
backprop here. It is the domain-free *dynamical* counterpart of a dense layer: a
dense layer is a static map, a transfer function carries memory. The coefficients
b, a are exactly what a least-squares ARX fit recovers from input/output data
(linear in the parameters, no autodiff required).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List


@dataclass
class TransferFunction:
    id: str
    name: str
    b: List[float]  # numerator [b0, b1, ..., bnb]; at least b0 is required
    a: List[float] = field(default_factory=list)  # denominator [a1, ..., ana]; a0 = 1 implicit

    def __post_init__(self) -> None:
        if len(self.b) == 0:
            raise ValueError(
                "TransferFunction requires at least one numerator coefficient (b0)"
            )

    def run(self, u: List[float]) -> List[float]:
        n = len(u)
        y = [0.0] * n
        for t in range(n):
            acc = 0.0
            for j, bj in enumerate(self.b):
                k = t - j
                if k >= 0:
                    acc += bj * u[k]
            for i, ai in enumerate(self.a):
                k = t - (i + 1)
                if k >= 0:
                    acc -= ai * y[k]
            y[t] = acc
        return y


def create_transfer_function(
    id: str, name: str, b: List[float], a: List[float] | None = None
) -> TransferFunction:
    return TransferFunction(id=id, name=name, b=list(b), a=list(a or []))
