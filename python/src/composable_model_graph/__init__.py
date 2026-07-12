"""composable-model-graph (Python).

The software / product lane of the model-graph stack: typed transformation graphs
with trace, evaluation, and feedback. This is the Python side; the TypeScript side
lives in ../typescript. New capabilities ship in BOTH languages with parity (see
docs/development.md). Linearity is a default, not a limit.
"""

from .core import (
    Connection,
    EvaluationResult,
    EvaluationStatus,
    Evaluator,
    Evidence,
    FeedbackAction,
    FeedbackActionKind,
    FeedbackResolver,
    GraphRun,
    ModelGraph,
    RunComparison,
    RunContext,
    SignalDelta,
    TraceStep,
    Transform,
    UsefulFlowScore,
    combine_cost,
    combine_quality,
    compare_runs,
    create_evaluator,
    create_feedback_resolver,
    create_model_graph,
    create_transform,
    useful_flow_score,
)
from .estimation import (
    CandidateState,
    DecodedPath,
    DecodedStep,
    decode_path,
    decode_path_fixed_lag,
)
from .evaluators import (
    composite_evaluator,
    deep_equal,
    exact_match_evaluator,
    numeric_error_evaluator,
    threshold_evaluator,
)
from .feedback import default_feedback_resolver, threshold_feedback_resolver
from .math import (
    TransferFunction,
    create_transfer_function,
    rank_sensitivity,
    relu,
    sensitivity,
    sigmoid,
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
    "threshold_evaluator",
    "numeric_error_evaluator",
    "exact_match_evaluator",
    "composite_evaluator",
    "deep_equal",
    "default_feedback_resolver",
    "threshold_feedback_resolver",
    "sigmoid",
    "relu",
    "sensitivity",
    "rank_sensitivity",
    "TransferFunction",
    "create_transfer_function",
    "CandidateState",
    "DecodedStep",
    "DecodedPath",
    "decode_path",
    "decode_path_fixed_lag",
]
__version__ = "0.1.0"
