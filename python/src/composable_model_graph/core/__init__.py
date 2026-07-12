"""Core primitives: Transform, the graph runner, trace, evaluation, feedback,
comparison, and run context."""

from .compare import RunComparison, SignalDelta, compare_runs
from .graph import Connection, ModelGraph, create_model_graph
from .score import (
    UsefulFlowScore,
    combine_cost,
    combine_quality,
    useful_flow_score,
)
from .types import (
    EvaluationResult,
    EvaluationStatus,
    Evaluator,
    Evidence,
    FeedbackAction,
    FeedbackActionKind,
    FeedbackResolver,
    GraphRun,
    RunContext,
    TraceStep,
    Transform,
    create_evaluator,
    create_feedback_resolver,
    create_transform,
)

__all__ = [
    "Transform",
    "TraceStep",
    "RunContext",
    "GraphRun",
    "create_transform",
    "Evidence",
    "EvaluationStatus",
    "EvaluationResult",
    "Evaluator",
    "create_evaluator",
    "FeedbackActionKind",
    "FeedbackAction",
    "FeedbackResolver",
    "create_feedback_resolver",
    "ModelGraph",
    "Connection",
    "create_model_graph",
    "UsefulFlowScore",
    "useful_flow_score",
    "combine_cost",
    "combine_quality",
    "RunComparison",
    "SignalDelta",
    "compare_runs",
]
