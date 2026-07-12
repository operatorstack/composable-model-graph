#!/usr/bin/env python3
"""Example 16 - Estimation inside an inspectable graph.

The same noisy track runs through two graph configurations:

    readings -> build trellis -> decode path -> summarize

Graph A trusts each reading independently. Graph B charges for implausible
jumps. Evaluation checks the final path against ground truth, feedback turns
that result into an action, and compare_runs explains where the runs diverge.

Run without installing:
    python3 python/examples/16-estimation-in-the-graph/main.py
"""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "src"))

from composable_model_graph import (  # noqa: E402
    CandidateState,
    compare_runs,
    create_model_graph,
    create_transform,
    decode_path,
    default_feedback_resolver,
    exact_match_evaluator,
)


@dataclass
class TrackingInput:
    readings: list[int]
    grid: list[int]


INPUT = TrackingInput(
    readings=[1, 1, 2, 5, 2, 1, 1],
    grid=[0, 1, 2, 3, 4, 5],
)
TARGET = "1 1 2 3 2 1 1"


def transition_cost(previous, next_state, step_index):
    if not isinstance(previous.value, (int, float)):
        raise ValueError(f"state {previous.id} has no numeric value")
    if not isinstance(next_state.value, (int, float)):
        raise ValueError(f"state {next_state.id} has no numeric value")
    return (previous.value - next_state.value) ** 2


def build_trellis(input_value, context):
    return [
        [
            CandidateState(
                id=str(level),
                score=-((reading - level) ** 2),
                value=level,
            )
            for level in input_value.grid
        ]
        for reading in input_value.readings
    ]


def summarize(path, context):
    return " ".join(path.state_ids)


build_trellis_transform = create_transform(
    "build-trellis",
    "Build candidate trellis",
    build_trellis,
)
summarize_transform = create_transform(
    "summarize",
    "Summarize decoded path",
    summarize,
)


def create_tracking_graph(graph_id, name, transition_weight):
    def decode(trellis, context):
        path = decode_path(
            trellis,
            transition_cost=transition_cost,
            transition_weight=transition_weight,
        )
        context.record_signal("pathScore", path.total_score)
        return path

    return create_model_graph(
        graph_id,
        name,
        [
            build_trellis_transform,
            create_transform("decode-path", "Decode best path", decode),
            summarize_transform,
        ],
        evaluator=exact_match_evaluator(),
        feedback_resolver=default_feedback_resolver(),
    )


def path_score(run):
    decode_step = next(
        (step for step in run.trace if step.transform_id == "decode-path"),
        None,
    )
    if decode_step is None:
        raise ValueError("run has no decode-path step")
    score = (decode_step.metadata or {}).get("pathScore")
    if not isinstance(score, (int, float)):
        raise ValueError("decode-path did not record pathScore")
    return score


def format_number(value):
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return f"{value:g}"
    return str(value)


def print_run(label, transition_weight, run):
    print(f"{label} (transitionWeight={transition_weight})")
    print(f"  path:       {run.output}")
    print(f"  trace:      {' -> '.join(step.transform_id for step in run.trace)}")
    print(f"  pathScore:  {path_score(run):g}")
    status = run.evaluation.status if run.evaluation else "none"
    score = run.evaluation.score if run.evaluation else "none"
    feedback_kind = run.feedback.kind if run.feedback else "none"
    feedback_reason = run.feedback.reason if run.feedback else "none"
    print(f"  evaluation: {status} (score={format_number(score)})")
    print(f"  feedback:   {feedback_kind} ({feedback_reason})")


def print_comparison(comparison):
    score_delta = comparison.score["delta"]
    path_score_delta = comparison.signals.get("pathScore")
    print("compareRuns(A, B)")
    print(f"  verdict:       {comparison.better} ({comparison.reason})")
    print(
        "  score delta:   "
        f"{format_number(score_delta) if score_delta is not None else 'none'}"
    )
    if path_score_delta:
        print(
            "  pathScore:     "
            f"A={path_score_delta.a:g} B={path_score_delta.b:g} "
            f"delta={path_score_delta.delta:g}"
        )
    diverged = (
        comparison.diverged_at_step
        if comparison.diverged_at_step is not None
        else "none"
    )
    print(f"  diverged@step: {diverged} (decode-path)")


graph_a = create_tracking_graph("pointwise-track", "Pointwise track", 0)
graph_b = create_tracking_graph("coherent-track", "Coherent track", 1)
run_a = graph_a.run(INPUT, target=TARGET)
run_b = graph_b.run(INPUT, target=TARGET)

print("Estimation in a ModelGraph: local evidence vs sequence coherence\n")
print(f"readings:     {' '.join(str(reading) for reading in INPUT.readings)}")
print(f"ground truth: {TARGET}\n")
print_run("Graph A - trust each reading", 0, run_a)
print("")
print_run("Graph B - prefer a coherent path", 1, run_b)
print("")
print_comparison(compare_runs(run_a, run_b))
print("\nReading: the graph makes the estimator measurable and actionable. The trace")
print("locates the first difference at decode-path; evaluation prefers B's coherent")
print("path, and feedback changes from retry to accept.")
