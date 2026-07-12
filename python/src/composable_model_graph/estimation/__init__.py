"""Estimation: decode the best path through per-step candidate states.

Trellis decoding (Viterbi) and a causal fixed-lag variant, domain-free. Parity
with the TypeScript estimation package (see docs/development.md).
"""

from .trellis import (
    CandidateState,
    DecodedPath,
    DecodedStep,
    TransitionCost,
    decode_path,
    decode_path_fixed_lag,
)

__all__ = [
    "CandidateState",
    "TransitionCost",
    "DecodedStep",
    "DecodedPath",
    "decode_path",
    "decode_path_fixed_lag",
]
