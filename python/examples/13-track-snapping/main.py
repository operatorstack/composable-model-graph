#!/usr/bin/env python3
"""
Example 13 - Track snapping (tracking / signal processing). Python parity of
typescript/examples/13-track-snapping; same model, byte-identical output.

A noisy 1-D sensor is sampled over time; we snap the track to a discrete grid of
levels. Each step, every grid level is a candidate scored by how close it is to
the reading: score = -(reading - level)^2 (0 is a perfect match). The transition
cost is (level_delta)^2 - big jumps between consecutive levels are implausible.

The reading at step 3 spikes. With free transitions the snap copies the sensor
and follows the spike; with a transition penalty it holds the track and treats
the spike as noise. Uses only the estimation package.

Run (no install needed):
    python3 python/examples/13-track-snapping/main.py
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "src"))

from composable_model_graph import (  # noqa: E402
    CandidateState,
    decode_path,
    decode_path_fixed_lag,
)

GRID = [0, 1, 2, 3, 4, 5]
READINGS = [1, 1, 2, 5, 2, 1, 1]  # spike at step 3

# One trellis step per reading: every grid level is a candidate.
trellis = [
    [CandidateState(id=str(level), score=-((reading - level) ** 2), value=level)
     for level in GRID]
    for reading in READINGS
]


def cost(prev, nxt, step_index):
    return (prev.value - nxt.value) ** 2


def fmt(x) -> str:
    # render whole numbers without a trailing ".0" (TS/Python byte-parity)
    if isinstance(x, float) and x.is_integer():
        return str(int(x))
    return str(x)


def line(label, ids, total):
    print(f"  {label:<30} {' '.join(ids)}   total {fmt(total)}")


print("Track snapping: fit a noisy 1-D sensor track to a discrete grid\n")
print(f"  readings (grid 0..5):          {' '.join(str(r) for r in READINGS)}   <- spike at step 3\n")

free = decode_path(trellis, transition_cost=cost, transition_weight=0)
smooth = decode_path(trellis, transition_cost=cost, transition_weight=1)
causal = decode_path_fixed_lag(trellis, 0, transition_cost=cost, transition_weight=1)
lookahead = decode_path_fixed_lag(trellis, 2, transition_cost=cost, transition_weight=1)

line("weight 0 (trust each reading):", free.state_ids, free.total_score)
line("weight 1 (stay coherent):", smooth.state_ids, smooth.total_score)
line("fixed-lag 0 (causal filter):", causal.state_ids, causal.total_score)
line("fixed-lag 2 (2-step lookahead):", lookahead.state_ids, lookahead.total_score)

print("\n  per-step split (weight 1): level  score  transitionCost  cumulative")
for step in smooth.steps:
    print(f"    step {step.step_index}  level {step.state_id}   "
          f"{fmt(step.score):>3}   {fmt(step.transition_cost):>3}          {fmt(step.cumulative_score)}")

print("\nReading: with free transitions the snap copies the sensor and takes the spike")
print("up to level 5; with a transition penalty it holds the track and reads the spike")
print("as noise. Full lookahead sees the spike is a detour; the causal filter is the")
print("cheapest build and commits from the past alone.")
