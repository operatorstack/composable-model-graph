#!/usr/bin/env python3
"""
Example 14 - Hidden regime (a hidden-state sequence). Python parity of
typescript/examples/14-hidden-regime; same model, byte-identical output.

A machine runs in one of three hidden regimes - idle, normal, overload - and we
only see a coarse sensor symbol each tick (low / mid / high power draw). We
recover the regime sequence. Each step's candidates are the three regimes,
scored by how well they explain the observed symbol; the transition cost
penalizes regime changes (by how far they jump: idle=0, normal=1, overload=2).

This is the Viterbi / HMM story told without any probability prerequisite: a
single spurious "mid" reading inside an overload run should not flip the
inferred regime. Uses only the estimation package.

Run (no install needed):
    python3 python/examples/14-hidden-regime/main.py
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "src"))

from composable_model_graph import CandidateState, decode_path  # noqa: E402

REGIMES = ["idle", "normal", "overload"]
REGIME_LEVEL = {"idle": 0, "normal": 1, "overload": 2}

# Emission score: how well each regime explains an observed symbol (higher = better).
EMISSION = {
    "idle": {"low": 2, "mid": 0, "high": -2},
    "normal": {"low": 0, "mid": 2, "high": 0},
    "overload": {"low": -2, "mid": 0, "high": 2},
}

OBSERVATIONS = ["low", "high", "high", "mid", "high", "high", "low"]

trellis = [
    [CandidateState(id=regime, score=EMISSION[regime][symbol], value=REGIME_LEVEL[regime])
     for regime in REGIMES]
    for symbol in OBSERVATIONS
]


def cost(prev, nxt, step_index):
    # cost of a regime change: a flat penalty for switching at all, plus how far
    # it jumps. Staying put is free. Tuned so a one-tick blip can't pay for the
    # round trip out of a regime and back, but a sustained shift still can.
    d = abs(prev.value - nxt.value)
    return 0 if d == 0 else d + 1


print("Hidden regime: infer idle / normal / overload from sensor symbols\n")
print(f"  observed symbols:  {'  '.join(OBSERVATIONS)}")
print("")

free = decode_path(trellis, transition_cost=cost, transition_weight=0)
inferred = decode_path(trellis, transition_cost=cost, transition_weight=1)

print(f"  weight 0 (per-symbol):   {'  '.join(free.state_ids)}")
print(f"  weight 1 (with regime):  {'  '.join(inferred.state_ids)}")

print("\n  the divergent tick:")
for t in range(len(OBSERVATIONS)):
    if free.state_ids[t] != inferred.state_ids[t]:
        print(f'    step {t} saw "{OBSERVATIONS[t]}": per-symbol reads '
              f'{free.state_ids[t]}, but the sequence stays {inferred.state_ids[t]}')

print('\nReading: the lone "mid" during the overload run is a blip. Judged alone it')
print("looks like normal; judged as part of the sequence, staying in overload is")
print("cheaper than dropping to normal and climbing back.")
