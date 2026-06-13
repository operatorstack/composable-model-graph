"""Core types for composable-model-graph (Python).

Mirrors the TypeScript core: a Transform is a named input -> output step; a graph
runs transforms and records a TraceStep per step; signals recorded via the run
context land in that step's metadata. Stdlib only by design, so the primitive
stays usable without an install.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Optional


@dataclass
class TraceStep:
    """The recorded execution of one transform."""

    transform_id: str
    transform_name: str
    input: Any
    output: Any
    duration_ms: float
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
class GraphRun:
    """A complete run record: the input, the final output, and the trace."""

    input: Any
    output: Any
    trace: list[TraceStep] = field(default_factory=list)


def create_transform(
    id: str,
    name: str,
    run: Callable[[Any, RunContext], Any],
    description: Optional[str] = None,
) -> Transform:
    return Transform(id=id, name=name, run=run, description=description)
