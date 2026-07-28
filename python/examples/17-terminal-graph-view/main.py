#!/usr/bin/env python3
"""Example 17 — inspect a generic request-processing graph in the terminal."""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "src"))

from composable_model_graph import (  # noqa: E402
    Connection,
    EvaluationResult,
    FeedbackAction,
    CandidateState,
    create_evaluator,
    create_feedback_resolver,
    create_model_graph,
    create_transform,
    decode_path,
    rank_sensitivity,
    render_comparison,
    render_decoded_path,
    render_graph,
    render_run,
    render_sensitivity,
    render_useful_flow,
    useful_flow_score,
)


input_step = create_transform(
    "receive",
    "Collect input",
    lambda state, _ctx: {**state, "request": "Create report"},
)
parse = create_transform(
    "parse",
    "Parse payload and schema",
    lambda state, _ctx: {
        **state,
        "parse": "Structured request",
        "schema": "Report request v1",
    },
)
validation = create_transform(
    "validation",
    "Validate payload",
    lambda state, _ctx: {**state, "validation": "Accepted"},
)
route = create_transform(
    "route",
    "Select route",
    lambda state, _ctx: {**state, "route": "Report worker"},
)
result = create_transform(
    "result",
    "Produce local and system results",
    lambda state, _ctx: {
        **state,
        "localResult": "Report created",
        "systemResult": "Audit record stored",
    },
)

graph = create_model_graph(
    "request-processing",
    "Request processing",
    [input_step, parse, validation, route, result],
)

policy = create_transform("policy", "Check policy", lambda value, _ctx: value)
capacity = create_transform("capacity", "Check capacity", lambda value, _ctx: value)
decide = create_transform("decide", "Decide route", lambda values, _ctx: values)
dag = create_model_graph(
    "routing-decision",
    "Routing decision",
    [policy, capacity, decide],
    connections=[
        Connection("policy", "decide"),
        Connection("capacity", "decide"),
    ],
)

score_output = create_evaluator(
    "score-output",
    "Score output",
    lambda output, _target, _ctx: EvaluationResult(
        status="pass" if output >= 10 else "partial",
        score=output / 20,
    ),
)
evaluation_graph = create_model_graph(
    "evaluation-model",
    "Evaluation model",
    [create_transform("normalize", "Normalize input", lambda value, _ctx: value)],
    evaluator=score_output,
)
feedback_graph = create_model_graph(
    "feedback-model",
    "Feedback model",
    [
        create_transform(
            "transform-chain",
            "Run transform chain",
            lambda value, _ctx: value,
        )
    ],
    evaluator=score_output,
    feedback_resolver=create_feedback_resolver(
        "status-feedback",
        "Resolve status",
        lambda run, _ctx: FeedbackAction(
            kind="accept" if run.evaluation.status == "pass" else "adjust",
            reason="Respond to the evaluated output",
        ),
    ),
)
graph_a = create_model_graph(
    "candidate-a",
    "Candidate A",
    [create_transform("graph-a", "Run graph A", lambda value, _ctx: value + 1)],
    evaluator=create_evaluator(
        "score-a",
        "Score A",
        lambda _output, _target, _ctx: EvaluationResult(
            status="partial", score=0.6
        ),
    ),
)
graph_b = create_model_graph(
    "candidate-b",
    "Candidate B",
    [create_transform("graph-b", "Run graph B", lambda value, _ctx: value + 2)],
    evaluator=create_evaluator(
        "score-b",
        "Score B",
        lambda _output, _target, _ctx: EvaluationResult(status="pass", score=0.9),
    ),
)


def section(title, content):
    print(f"== {title} ==")
    print(content)
    print("")


section("1. Sequential Model", render_graph(graph, columns=160))
section("2. State Projection Model", render_run(graph, graph.run({}), columns=160))
section(
    "3. Evaluation Model",
    render_run(evaluation_graph, evaluation_graph.run(12), columns=80),
)
section(
    "4. Feedback Model",
    render_run(feedback_graph, feedback_graph.run(12), columns=160),
)
section("5. Branching Model", render_graph(dag, columns=80))

run_a = graph_a.run(10)
run_b = graph_b.run(10)
section(
    "6. Comparison Model",
    render_comparison(
        {"graph": graph_a, "run": run_a, "label": "Graph A"},
        {"graph": graph_b, "run": run_b, "label": "Graph B"},
    ),
)

decoded = decode_path(
    [
        [CandidateState("idle", 3), CandidateState("busy", 1)],
        [CandidateState("idle", 1), CandidateState("ready", 4)],
        [CandidateState("ready", 5), CandidateState("done", 2)],
    ]
)
section("7. Decoded Path", render_decoded_path(decoded))

ranked = rank_sensitivity(
    {"capacity": 2, "latency": 1},
    lambda knobs: 2 * knobs["capacity"] + 3 * knobs["latency"],
    step=1,
)
section("8. Sensitivity", render_sensitivity(ranked))

section("9. Useful Flow", render_useful_flow(useful_flow_score(8, 4)))
