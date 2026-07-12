#!/usr/bin/env python3
"""
Example 15 - Typo decoding (a text / sequence-labeling problem). Python parity
of typescript/examples/15-typo-decode; same model, byte-identical output.

Recover the intended word from a mistyped one. At each position the candidates
are the typed letter (score 0, it's what you saw) plus its keyboard neighbors
(score -1, plausible slips). The transition cost is 0 for a letter pair the
language allows and 1 for one it does not (a tiny bigram "language model"). The
decode trades a small per-key penalty for a coherent word.

With free transitions (weight 0) it just echoes what was typed; with the bigram
model it corrects the slip. Uses only the estimation package.

Run (no install needed):
    python3 python/examples/15-typo-decode/main.py
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "src"))

from composable_model_graph import CandidateState, decode_path  # noqa: E402

# Keyboard neighbors (partial QWERTY, only the letters this example needs).
NEIGHBORS = {
    "c": ["x", "d", "f", "v"],
    "h": ["g", "y", "u", "j", "n", "b"],
    "s": ["a", "w", "e", "d", "x", "z"],
    "i": ["u", "j", "k", "o"],
    "r": ["e", "d", "f", "t"],
}

# Allowed letter pairs - the bigrams of the intended word "chair".
ALLOWED = {"ch", "ha", "ai", "ir"}

TYPED = "chsir"  # intended "chair"; the 'a' slipped to its neighbor 's'

trellis = []
for typed in TYPED:
    letters = [typed] + NEIGHBORS.get(typed, [])
    trellis.append([
        CandidateState(id=letter, score=(0 if k == 0 else -1), value=letter)
        for k, letter in enumerate(letters)
    ])


def cost(prev, nxt, step_index):
    return 0 if (prev.value + nxt.value) in ALLOWED else 1


def word(ids):
    return "".join(ids)


print("Typo decoding: recover the intended word from a mistyped one\n")
print(f'  typed:                 {" ".join(TYPED)}   ("{TYPED}")')

echo = decode_path(trellis, transition_cost=cost, transition_weight=0)
corrected = decode_path(trellis, transition_cost=cost, transition_weight=1)

print(f'  weight 0 (per-key):    {" ".join(echo.state_ids)}   ("{word(echo.state_ids)}")')
print(f'  weight 1 (+ bigrams):  {" ".join(corrected.state_ids)}   ("{word(corrected.state_ids)}")')

print("\n  correction:")
for t in range(len(TYPED)):
    if echo.state_ids[t] != corrected.state_ids[t]:
        print(f"    position {t}: typed '{echo.state_ids[t]}' -> '{corrected.state_ids[t]}' "
              f"(neighbour that fits the allowed bigrams)")

print("\nReading: read key by key, the slip stands ('chsir'). Read as a word, the")
print("neighbour 'a' pays one key penalty but removes two disallowed letter pairs -")
print("so the decode recovers 'chair'.")
