"""The graph runner.

Sequential by default; a general DAG when connections are given. Linearity is a
DEFAULT, not a limit: pass `connections` to run an arbitrary directed acyclic
graph (fan-out, merge). The library is not restricted to a pipeline; the
structure follows the use case.

After the transforms run (either mode), an optional Evaluator judges the final
output and an optional FeedbackResolver maps the run to a next action; both land
on the returned GraphRun.
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass
from typing import Any, Optional

from .types import (
    Evaluator,
    FeedbackResolver,
    GraphRun,
    RunContext,
    TraceStep,
    Transform,
)


def _now_ms() -> float:
    """Wall-clock epoch milliseconds (mirrors the TypeScript Date.now timing)."""
    return time.time_ns() / 1e6


@dataclass
class Connection:
    """A directed edge from one transform to another (by id)."""

    src: str
    dst: str


@dataclass
class ModelGraph:
    id: str
    name: str
    transforms: list[Transform]
    connections: Optional[list[Connection]] = None
    evaluator: Optional[Evaluator] = None
    feedback_resolver: Optional[FeedbackResolver] = None

    def run(
        self,
        input: Any,
        target: Any = None,
        run_id: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> GraphRun:
        ctx = RunContext(
            run_id=run_id if run_id is not None else str(uuid.uuid4()),
            target=target,
            metadata=metadata or {},
        )
        if not self.connections:
            run = self._run_sequential(input, ctx)
        else:
            run = self._run_dag(input, ctx)
        if self.evaluator is not None:
            run.evaluation = self.evaluator.evaluate(run.output, ctx.target, ctx)
        if self.feedback_resolver is not None:
            run.feedback = self.feedback_resolver.resolve(run, ctx)
        return run

    def _step(self, t: Transform, value: Any, ctx: RunContext) -> TraceStep:
        sink: dict[str, Any] = {}
        ctx._signal_sink = sink
        started_at = _now_ms()
        out = t.run(value, ctx)
        finished_at = _now_ms()
        ctx._signal_sink = None
        return TraceStep(
            transform_id=t.id,
            transform_name=t.name,
            input=value,
            output=out,
            started_at=started_at,
            finished_at=finished_at,
            duration_ms=finished_at - started_at,
            metadata=sink,
        )

    def _run_sequential(self, input: Any, ctx: RunContext) -> GraphRun:
        trace: list[TraceStep] = []
        current = input
        for t in self.transforms:
            step = self._step(t, current, ctx)
            trace.append(step)
            current = step.output
        return GraphRun(input=input, output=current, trace=trace)

    def _run_dag(self, input: Any, ctx: RunContext) -> GraphRun:
        by_id = {t.id: t for t in self.transforms}
        for c in self.connections or []:
            for tid in (c.src, c.dst):
                if tid not in by_id:
                    raise ValueError(
                        f"connection references unknown transform id: {tid}"
                    )
        preds: dict[str, list[str]] = {tid: [] for tid in by_id}
        succs: dict[str, list[str]] = {tid: [] for tid in by_id}
        for c in self.connections or []:
            preds[c.dst].append(c.src)
            succs[c.src].append(c.dst)

        # Kahn topological sort
        indeg = {tid: len(preds[tid]) for tid in by_id}
        queue = [tid for tid, d in indeg.items() if d == 0]
        order: list[str] = []
        while queue:
            tid = queue.pop(0)
            order.append(tid)
            for s in succs[tid]:
                indeg[s] -= 1
                if indeg[s] == 0:
                    queue.append(s)
        if len(order) != len(by_id):
            raise ValueError("graph has a cycle")

        outputs: dict[str, Any] = {}
        trace: list[TraceStep] = []
        last: Any = input
        for tid in order:
            ps = preds[tid]
            if not ps:
                value: Any = input
            elif len(ps) == 1:
                value = outputs[ps[0]]
            else:
                # a merge node receives the list of its predecessors' outputs
                value = [outputs[p] for p in ps]
            step = self._step(by_id[tid], value, ctx)
            trace.append(step)
            outputs[tid] = step.output
            last = step.output
        return GraphRun(input=input, output=last, trace=trace)


def create_model_graph(
    id: str,
    name: str,
    transforms: list[Transform],
    connections: Optional[list[Connection]] = None,
    evaluator: Optional[Evaluator] = None,
    feedback_resolver: Optional[FeedbackResolver] = None,
) -> ModelGraph:
    return ModelGraph(
        id=id,
        name=name,
        transforms=list(transforms),
        connections=connections,
        evaluator=evaluator,
        feedback_resolver=feedback_resolver,
    )
