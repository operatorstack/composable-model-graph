"""Core types for composable-model-graph (Python).

Mirrors the TypeScript core: a Transform is a named input -> output step; a graph
runs transforms and records a TraceStep per step; signals recorded via the run
context land in that step's metadata. An Evaluator judges the final output, a
FeedbackResolver turns that judgment into a next action. Stdlib only by design,
so the primitive stays usable without an install.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Literal, Optional

# Outcome of evaluating a graph's final output.
EvaluationStatus = Literal["pass", "fail", "partial", "unknown"]

# The kind of next action a feedback resolver suggests.
FeedbackActionKind = Literal["accept", "retry", "adjust", "reject", "custom"]


@dataclass
class Evidence:
    """A single observable fact captured during evaluation."""

    label: str
    value: Any
    source: Optional[str] = None


@dataclass
class EvaluationResult:
    """Structured result returned by an Evaluator."""

    status: EvaluationStatus
    # normalized quality score, conventionally in [0, 1]
    score: Optional[float] = None
    # numeric error / residual magnitude
    error: Optional[float] = None
    messages: Optional[list[str]] = None
    evidence: Optional[list[Evidence]] = None


@dataclass
class FeedbackAction:
    """Next action suggested by evaluation."""

    kind: FeedbackActionKind
    reason: Optional[str] = None
    signal: Any = None


@dataclass
class TraceStep:
    """The recorded execution of one transform."""

    transform_id: str
    transform_name: str
    input: Any
    output: Any
    started_at: float  # epoch ms
    finished_at: float  # epoch ms
    duration_ms: float  # finished_at - started_at
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class RunContext:
    """Passed to every transform. Lets a transform record named signals.

    record_signal is a neutral carrier: the core attaches no meaning to the key
    or value. Domains decide what to record (tokens, cost, capacity, latency).
    """

    run_id: str
    target: Any = None
    metadata: dict[str, Any] = field(default_factory=dict)
    # set by the runner to the currently executing step's metadata dict
    _signal_sink: Optional[dict[str, Any]] = None

    def record_signal(self, key: str, value: Any) -> None:
        if self._signal_sink is not None:
            self._signal_sink[key] = value


@dataclass
class Transform:
    """A named, pure-ish step: run(input, context) -> output."""

    id: str
    name: str
    run: Callable[[Any, RunContext], Any]
    description: Optional[str] = None


@dataclass
class Evaluator:
    """Judges a graph's final output: evaluate(output, target, context) -> EvaluationResult."""

    id: str
    name: str
    evaluate: Callable[[Any, Any, RunContext], EvaluationResult]


@dataclass
class GraphRun:
    """A complete run record: the input, the final output, the trace, and (when
    the graph carries an evaluator / feedback resolver) the judgment and the
    suggested next action."""

    input: Any
    output: Any
    trace: list[TraceStep] = field(default_factory=list)
    evaluation: Optional[EvaluationResult] = None
    feedback: Optional[FeedbackAction] = None


@dataclass
class FeedbackResolver:
    """Maps a completed run to a next action: resolve(run, context) -> FeedbackAction."""

    id: str
    name: str
    resolve: Callable[[GraphRun, RunContext], FeedbackAction]


def create_transform(
    id: str,
    name: str,
    run: Callable[[Any, RunContext], Any],
    description: Optional[str] = None,
) -> Transform:
    return Transform(id=id, name=name, run=run, description=description)


def create_evaluator(
    id: str,
    name: str,
    evaluate: Callable[[Any, Any, RunContext], EvaluationResult],
) -> Evaluator:
    return Evaluator(id=id, name=name, evaluate=evaluate)


def create_feedback_resolver(
    id: str,
    name: str,
    resolve: Callable[[GraphRun, RunContext], FeedbackAction],
) -> FeedbackResolver:
    return FeedbackResolver(id=id, name=name, resolve=resolve)
