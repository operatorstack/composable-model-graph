"""The graph runner.

Sequential by default; a general DAG when connections are given. Linearity is a
DEFAULT, not a limit: pass `connections` to run an arbitrary directed acyclic
graph (fan-out, merge). The library is not restricted to a pipeline; the
structure follows the use case.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Optional

from .types import GraphRun, RunContext, TraceStep, Transform


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

    def run(self, input: Any, target: Any = None, run_id: str = "run") -> GraphRun:
        ctx = RunContext(run_id=run_id, target=target)
        if not self.connections:
            return self._run_sequential(input, ctx)
        return self._run_dag(input, ctx)

    def _step(self, t: Transform, value: Any, ctx: RunContext) -> TraceStep:
        sink: dict[str, Any] = {}
        ctx._signal_sink = sink
        start = time.perf_counter()
        out = t.run(value, ctx)
        duration_ms = (time.perf_counter() - start) * 1000.0
        ctx._signal_sink = None
        return TraceStep(
            transform_id=t.id,
            transform_name=t.name,
            input=value,
            output=out,
            duration_ms=duration_ms,
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
) -> ModelGraph:
    return ModelGraph(
        id=id, name=name, transforms=list(transforms), connections=connections
    )
