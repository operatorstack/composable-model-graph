"""Terminal renderer tests, kept at parity with the TypeScript suite."""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from composable_model_graph import (  # noqa: E402
    Connection,
    EvaluationResult,
    Evidence,
    FeedbackAction,
    GraphRun,
    TraceStep,
    create_model_graph,
    create_transform,
    render_comparison,
    render_decoded_path,
    render_graph,
    render_run,
    render_sensitivity,
    render_useful_flow,
)


def _transform(id, name=None):
    return create_transform(id, name or id, lambda value, _ctx: value)


def test_one_node():
    graph = create_model_graph("one", "One", [_transform("single-node")])
    assert render_graph(graph, columns=80, show_lifecycle=False) == "\n".join(
        ["┌─────────────┐", "│ Single node │", "└─────────────┘"]
    )


def test_ascii_narrow_fallback():
    graph = create_model_graph(
        "line", "Line", [_transform("first"), _transform("second")]
    )
    assert render_graph(
        graph, charset="ascii", columns=10, show_lifecycle=False
    ) == "\n".join(
        [
            "+-------+",
            "| First |",
            "+-------+",
            "  v",
            "+--------+",
            "| Second |",
            "+--------+",
        ]
    )


def test_diff_and_duration():
    graph = create_model_graph("diff", "Diff", [_transform("change", "Change")])
    step = TraceStep(
        transform_id="change",
        transform_name="Change",
        input={"kept": 1, "removed": True},
        output={"kept": 2, "added": True},
        started_at=0,
        finished_at=4,
        duration_ms=4,
    )
    run = GraphRun(input=step.input, output=step.output, trace=[step])
    output = render_run(
        graph,
        run,
        columns=80,
        show_duration=True,
        show_produced_fields=False,
    )
    assert "Change (4ms)  + added, ~ kept, - removed" in output


def test_dag_preserves_edges():
    graph = create_model_graph(
        "dag",
        "DAG",
        [_transform("physics"), _transform("empirical"), _transform("reconcile")],
        connections=[
            Connection("physics", "reconcile"),
            Connection("empirical", "reconcile"),
        ],
    )
    output = render_graph(graph, columns=80, show_lifecycle=False)
    assert "[Physics]" in output
    assert "[Empirical]" in output
    assert "├─▶ [Reconcile]" in output


def test_invalid_presentation():
    graph = create_model_graph("line", "Line", [_transform("long-node")])
    try:
        render_graph(
            graph, columns=5, direction="horizontal", show_lifecycle=False
        )
        raise AssertionError("expected layout error")
    except ValueError as error:
        assert "requires 13 columns" in str(error)
    try:
        render_graph(graph, labels={"missing": "Missing"})
        raise AssertionError("expected label error")
    except ValueError as error:
        assert "unknown transform id: missing" in str(error)


def test_lifecycle_and_analysis_renderers():
    graph = create_model_graph("analysis", "Analysis", [_transform("work")])
    assert "│ Input │───▶│ Work │───▶│ Output │" in render_graph(
        graph, columns=80
    )
    step = TraceStep("work", "Work", 1, 1, 0, 0, 0)
    a = GraphRun(
        input=1,
        output=1,
        trace=[step],
        evaluation=EvaluationResult(status="partial", score=0.5),
    )
    b = GraphRun(
        input=1,
        output=2,
        trace=[TraceStep("work", "Work", 1, 2, 0, 0, 0)],
        evaluation=EvaluationResult(status="pass", score=1),
    )
    assert "[Compare: B]" in render_comparison(
        {"graph": graph, "run": a}, {"graph": graph, "run": b}
    )
    assert "[idle] ─▶ [ready]" in render_decoded_path(
        type(
            "Path",
            (),
            {
                "steps": [
                    type("Step", (), {"state_id": "idle"})(),
                    type("Step", (), {"state_id": "ready"})(),
                ],
                "total_score": 3,
            },
        )()
    )
    ranked = [
        type(
            "Rank",
            (),
            {"name": "capacity", "gradient": 2, "magnitude": 2},
        )()
    ]
    assert "gradient=2" in render_sensitivity(ranked)
    score = type("Score", (), {"quality": 8, "cost": 4, "score": 2})()
    assert "[Score 2]" in render_useful_flow(score)

    detailed = GraphRun(
        input=1,
        output=1,
        trace=[
            TraceStep(
                "work",
                "Work",
                1,
                1,
                0,
                0,
                0,
                metadata={"tokens": 4},
            )
        ],
        evaluation=EvaluationResult(
            status="pass",
            messages=["verified"],
            evidence=[Evidence("check", {"ok": True})],
        ),
        feedback=FeedbackAction("accept", signal={"next": True}),
    )
    assert "tokens:" not in render_run(graph, detailed, columns=120)
    full = render_run(graph, detailed, columns=120, detail="full")
    assert "tokens: 4" in full
    assert 'Evidence: check = {"ok":true}' in full
    assert 'Signal: {"next":true}' in full


if __name__ == "__main__":
    test_one_node()
    test_ascii_narrow_fallback()
    test_diff_and_duration()
    test_dag_preserves_edges()
    test_invalid_presentation()
    test_lifecycle_and_analysis_renderers()
    print("PASS: terminal renderer")
