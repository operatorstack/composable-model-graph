"""Tests for the estimation package (parity with estimation.test.ts).

The fixture is the worked example in docs/06-sequential-estimation.md: three
steps, three states per step whose ids double as positions 0/1/2 on a line,
transition cost = |position delta|, and a noise spike at step 1.

    scores        pos0  pos1  pos2
      step 0        5     0     0
      step 1        3     0     6      <- spike at pos 2
      step 2        8     0     0

Hand-computed accumulation (w = 1):
    cum[0] = [ 5,  0,  0 ]
    cum[1] = [ 8,  4,  9 ]
    cum[2] = [16,  8,  9 ]  -> best final pos0 (16), path 0,0,0

Runnable with plain python3 (no install needed):
    python3 tests/test_estimation.py
Also pytest-compatible (the test_* functions).
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from composable_model_graph import (  # noqa: E402
    CandidateState,
    decode_path,
    decode_path_fixed_lag,
)


def _fixture():
    # value = position on the line; id doubles as the position label
    def s(pos, score):
        return CandidateState(id=str(pos), score=score, value=pos)

    return [
        [s(0, 5), s(1, 0), s(2, 0)],
        [s(0, 3), s(1, 0), s(2, 6)],
        [s(0, 8), s(1, 0), s(2, 0)],
    ]


def _cost(prev, nxt, step_index):
    return abs(prev.value - nxt.value)


def test_full_decode_rejects_the_spike() -> None:
    path = decode_path(_fixture(), transition_cost=_cost, transition_weight=1.0)
    assert path.state_ids == ["0", "0", "0"]
    assert path.total_score == 16.0
    # per-step reasoning split
    assert [round(s.cumulative_score, 6) for s in path.steps] == [5.0, 8.0, 16.0]
    assert [s.transition_cost for s in path.steps] == [0.0, 0.0, 0.0]


def test_weight_zero_is_per_step_argmax() -> None:
    # transitions free -> follow the best state at each step (chases the spike)
    path = decode_path(_fixture(), transition_cost=_cost, transition_weight=0.0)
    assert path.state_ids == ["0", "2", "0"]


def test_fixed_lag_full_lookahead_equals_full_decode() -> None:
    full = decode_path(_fixture(), transition_cost=_cost, transition_weight=1.0)
    lag2 = decode_path_fixed_lag(_fixture(), 2, transition_cost=_cost, transition_weight=1.0)
    assert lag2.state_ids == full.state_ids == ["0", "0", "0"]
    assert lag2.total_score == full.total_score


def test_fixed_lag_zero_is_greedy_filtering() -> None:
    # pure filtering commits the spike at step 1 (only later evidence would undo it)
    path = decode_path_fixed_lag(_fixture(), 0, transition_cost=_cost, transition_weight=1.0)
    assert path.state_ids == ["0", "2", "0"]
    assert path.total_score == 15.0


def test_fixed_lag_one_has_enough_lookahead() -> None:
    path = decode_path_fixed_lag(_fixture(), 1, transition_cost=_cost, transition_weight=1.0)
    assert path.state_ids == ["0", "0", "0"]


def test_tie_break_is_lowest_index() -> None:
    # two equal-score states at each step; no transition cost -> first wins
    def s(i, score):
        return CandidateState(id=f"a{i}", score=score)

    steps = [[s(0, 1.0), s(1, 1.0)], [s(0, 1.0), s(1, 1.0)]]
    path = decode_path(steps)  # default: zero cost, weight 1
    assert path.state_ids == ["a0", "a0"]


def test_default_cost_is_zero() -> None:
    steps = [
        [CandidateState("x", 1.0), CandidateState("y", 3.0)],
        [CandidateState("p", 5.0), CandidateState("q", 2.0)],
    ]
    path = decode_path(steps)  # no cost, no weight effect
    assert path.state_ids == ["y", "p"]
    assert path.total_score == 8.0


def test_single_step_and_single_candidate() -> None:
    one = decode_path([[CandidateState("only", 2.0)]])
    assert one.state_ids == ["only"] and one.total_score == 2.0
    line = decode_path([[CandidateState("a", 1.0)], [CandidateState("b", 1.0)]])
    assert line.state_ids == ["a", "b"]


def test_errors() -> None:
    for bad, msg in [
        ([], "trellis has no steps"),
        ([[CandidateState("a", 1.0)], []], "trellis step 1 has no candidate states"),
    ]:
        raised = ""
        try:
            decode_path(bad)
        except ValueError as e:
            raised = str(e)
        assert raised == msg
    # negative lag
    raised = ""
    try:
        decode_path_fixed_lag([[CandidateState("a", 1.0)]], -1)
    except ValueError as e:
        raised = str(e)
    assert raised == "lag must be >= 0"


if __name__ == "__main__":
    test_full_decode_rejects_the_spike()
    test_weight_zero_is_per_step_argmax()
    test_fixed_lag_full_lookahead_equals_full_decode()
    test_fixed_lag_zero_is_greedy_filtering()
    test_fixed_lag_one_has_enough_lookahead()
    test_tie_break_is_lowest_index()
    test_default_cost_is_zero()
    test_single_step_and_single_candidate()
    test_errors()
    print("PASS: composable-model-graph python estimation")
