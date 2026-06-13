"""composable-model-graph (Python).

The software / product lane of the model-graph stack: typed transformation graphs
with trace, evaluation, and feedback. This is the Python side; the TypeScript side
lives in ../typescript. New capabilities ship in BOTH languages with parity (see
docs/development.md). Linearity is a default, not a limit.
"""

from .core import (
    Connection,
    GraphRun,
    ModelGraph,
    RunContext,
    TraceStep,
    Transform,
    create_model_graph,
    create_transform,
)
from .math import relu, sigmoid

__all__ = [
    "Transform",
    "TraceStep",
    "RunContext",
    "GraphRun",
    "create_transform",
    "ModelGraph",
    "Connection",
    "create_model_graph",
    "sigmoid",
    "relu",
]
__version__ = "0.1.0"
