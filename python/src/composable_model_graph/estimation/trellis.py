"""Sequential state estimation over a trellis. (Python parity of the TypeScript
estimation package.)

At each step you have candidate states, each with a score. A transition cost
says how implausible it is to move from one step's state to the next's. The
decoder returns the path that maximizes total score minus the transitions it
pays for:

    score(path) = sum_t score(x_t) - w * sum_{t>=1} cost(x_{t-1}, x_t)

`transition_weight` (w) is the exchange rate between trusting a step's own score
and staying coherent with the neighbours; w = 0 makes the decode the independent
per-step argmax (it falls out of the recursion, it is not special-cased).

This is the shared skeleton of Viterbi decoding, hidden Markov model inference,
and fixed-lag smoothing, with the probability story left optional. The module
depends only on the standard library and on nothing else in this package.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Optional

_NEG_INF = float("-inf")


@dataclass
class CandidateState:
    """One candidate the sequence could be in at a given step (higher score better)."""

    id: str
    score: float
    value: Any = None  # optional payload; the library attaches no meaning


# Cost of moving from prev (step t-1) to next (step t); higher = less plausible.
# step_index is the index of next's step.
TransitionCost = Callable[[CandidateState, CandidateState, int], float]


@dataclass
class DecodedStep:
    """The chosen state at one step, with the reasoning split exposed."""

    step_index: int
    state: CandidateState
    state_id: str
    score: float  # the chosen state's own score
    transition_cost: float  # raw cost paid to enter this state; 0 at step 0
    cumulative_score: float  # best path score through this step (weighted)


@dataclass
class DecodedPath:
    """A decoded path through the trellis."""

    steps: list[DecodedStep]
    state_ids: list[str] = field(default_factory=list)
    total_score: float = 0.0


def _zero_cost(prev: CandidateState, nxt: CandidateState, step_index: int) -> float:
    return 0.0


def _validate(steps: list[list[CandidateState]]) -> None:
    if len(steps) == 0:
        raise ValueError("trellis has no steps")
    for t, step in enumerate(steps):
        if len(step) == 0:
            raise ValueError(f"trellis step {t} has no candidate states")


def _forward(
    steps: list[list[CandidateState]],
    weight: float,
    cost: TransitionCost,
    locked: dict[int, int],
) -> tuple[list[list[float]], list[list[int]]]:
    """Forward Viterbi accumulation. `locked` pins chosen steps to a single
    state index (used by the fixed-lag decoder)."""
    cum: list[list[float]] = []
    back: list[list[int]] = []
    for t, states in enumerate(steps):
        width = len(states)
        cum.append([_NEG_INF] * width)
        back.append([-1] * width)
        lock = locked.get(t)

        def allowed(j: int) -> bool:
            return lock is None or lock == j

        if t == 0:
            for j in range(width):
                if allowed(j):
                    cum[0][j] = states[j].score
            continue

        prev = steps[t - 1]
        for j in range(width):
            if not allowed(j):
                continue
            best = _NEG_INF
            best_i = -1
            for i in range(len(prev)):
                if cum[t - 1][i] == _NEG_INF:
                    continue  # unreachable predecessor (e.g. locked out)
                val = cum[t - 1][i] - weight * cost(prev[i], states[j], t)
                if val > best:  # strict > => lowest predecessor index wins ties
                    best = val
                    best_i = i
            cum[t][j] = states[j].score + best
            back[t][j] = best_i
    return cum, back


def _argmax_final(cum: list[list[float]]) -> int:
    last = cum[-1]
    best = _NEG_INF
    best_j = 0
    for j in range(len(last)):
        if last[j] > best:
            best = last[j]
            best_j = j
    return best_j


def _backtrack(back: list[list[int]], t: int, j: int) -> list[int]:
    idx = [0] * (t + 1)
    idx[t] = j
    for s in range(t, 0, -1):
        idx[s - 1] = back[s][idx[s]]
    return idx


def _build_path(
    steps: list[list[CandidateState]],
    idx: list[int],
    weight: float,
    cost: TransitionCost,
) -> DecodedPath:
    out: list[DecodedStep] = []
    cumulative = 0.0
    for t in range(len(steps)):
        state = steps[t][idx[t]]
        tc = 0.0 if t == 0 else cost(steps[t - 1][idx[t - 1]], state, t)
        cumulative += state.score - (0.0 if t == 0 else weight * tc)
        out.append(
            DecodedStep(
                step_index=t,
                state=state,
                state_id=state.id,
                score=state.score,
                transition_cost=tc,
                cumulative_score=cumulative,
            )
        )
    return DecodedPath(
        steps=out,
        state_ids=[s.state_id for s in out],
        total_score=cumulative,
    )


def decode_path(
    steps: list[list[CandidateState]],
    transition_cost: Optional[TransitionCost] = None,
    transition_weight: float = 1.0,
) -> DecodedPath:
    """Full-path (Viterbi) decode: the single best path through the whole
    trellis. A choice at one step may be revised by evidence at any later step."""
    _validate(steps)
    cost = transition_cost if transition_cost is not None else _zero_cost
    cum, back = _forward(steps, transition_weight, cost, {})
    j_final = _argmax_final(cum)
    idx = _backtrack(back, len(steps) - 1, j_final)
    return _build_path(steps, idx, transition_weight, cost)


def decode_path_fixed_lag(
    steps: list[list[CandidateState]],
    lag: int,
    transition_cost: Optional[TransitionCost] = None,
    transition_weight: float = 1.0,
) -> DecodedPath:
    """Causal decode for streaming: commit the state at step t - lag once lag
    more steps have been seen. lag = 0 is pure filtering; lag >= len(steps) - 1
    reproduces decode_path."""
    _validate(steps)
    if lag < 0:
        raise ValueError("lag must be >= 0")
    cost = transition_cost if transition_cost is not None else _zero_cost
    t_len = len(steps)
    committed: dict[int, int] = {}

    for t in range(t_len):
        prefix = steps[: t + 1]
        cum, back = _forward(prefix, transition_weight, cost, committed)
        if t >= lag:
            k = t - lag
            j_t = _argmax_final(cum)
            path = _backtrack(back, t, j_t)
            committed[k] = path[k]

    # Commit any remaining (tail) steps from the full backtrack under constraints.
    cum, back = _forward(steps, transition_weight, cost, committed)
    full = _backtrack(back, t_len - 1, _argmax_final(cum))
    idx = [committed[k] if k in committed else full[k] for k in range(t_len)]
    return _build_path(steps, idx, transition_weight, cost)
