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


def test_explicit_linear_graph_uses_connection_order():
    graph = create_model_graph(
        "declared-line",
        "Declared line",
        [_transform("result"), _transform("input"), _transform("validate")],
        connections=[
            Connection("input", "validate"),
            Connection("validate", "result"),
        ],
    )
    assert render_graph(
        graph, columns=80, show_lifecycle=False
    ) == "\n".join(
        [
            "┌───────┐    ┌──────────┐    ┌────────┐",
            "│ Input │───▶│ Validate │───▶│ Result │",
            "└───────┘    └──────────┘    └────────┘",
        ]
    )
    assert (
        "│ Input │───▶│ Input │───▶│ Validate │───▶│ Result │───▶│ Output │"
        in render_graph(graph, columns=100)
    )
    narrow = render_graph(
        graph,
        charset="ascii",
        columns=10,
        show_lifecycle=False,
    )
    assert "| Input |" in narrow
    assert "  v" in narrow
    assert "Edges" not in narrow


def test_abbreviates_and_adds_legend_when_chain_overflows():
    graph = create_model_graph(
        "ingest",
        "Ingest",
        [_transform("ingest"), _transform("normalize"), _transform("index")],
        connections=[
            Connection("ingest", "normalize"),
            Connection("normalize", "index"),
        ],
    )
    # Full labels overflow 40 columns; short codes fit, so the compact chain
    # survives and a legend maps each code back to its name.
    assert render_graph(
        graph,
        columns=40,
        show_lifecycle=False,
        labels={
            "ingest": "Ingest source records",
            "normalize": "Normalize schema fields",
            "index": "Build the search index",
        },
    ) == "\n".join(
        [
            "┌─────┐    ┌─────┐    ┌──────┐",
            "│ ISR │───▶│ NSF │───▶│ BTSI │",
            "└─────┘    └─────┘    └──────┘",
            "",
            "Legend",
            "  ISR = Ingest source records",
            "  NSF = Normalize schema fields",
            "  BTSI = Build the search index",
        ]
    )


def test_explicit_linear_run_projects_produced_fields():
    graph = create_model_graph(
        "state-line",
        "State line",
        [
            _transform("results"),
            _transform("parse"),
            _transform("validation"),
        ],
        connections=[
            Connection("parse", "validation"),
            Connection("validation", "results"),
        ],
    )
    states = [
        {},
        {"parse": "payload", "schema": "v1"},
        {
            "parse": "payload",
            "schema": "v1",
            "validation": "accepted",
        },
        {
            "parse": "payload",
            "schema": "v1",
            "validation": "accepted",
            "localResult": "created",
            "systemResult": "recorded",
        },
    ]
    names = {transform.id: transform.name for transform in graph.transforms}
    order = ["parse", "validation", "results"]
    run = GraphRun(
        input=states[0],
        output=states[3],
        trace=[
            TraceStep(
                transform_id,
                names[transform_id],
                states[index],
                states[index + 1],
                0,
                0,
                0,
            )
            for index, transform_id in enumerate(order)
        ],
    )
    output = render_run(
        graph,
        run,
        columns=120,
        show_lifecycle=False,
    )
    assert "│ Parse │───▶│ Validation │───▶│ Results │" in output
    assert "Schema" in output
    assert "├─ Local result" in output
    assert "└─ System result" in output


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


def test_disconnected_connections_keep_dag_layout():
    graph = create_model_graph(
        "not-a-line",
        "Not a line",
        [_transform("a"), _transform("b"), _transform("c")],
        connections=[Connection("a", "b")],
    )
    output = render_graph(graph, columns=80, show_lifecycle=False)
    assert "Edges" in output
    assert "A ─▶ B" in output


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
    test_explicit_linear_graph_uses_connection_order()
    test_explicit_linear_run_projects_produced_fields()
    test_diff_and_duration()
    test_dag_preserves_edges()
    test_disconnected_connections_keep_dag_layout()
    test_invalid_presentation()
    test_lifecycle_and_analysis_renderers()
    print("PASS: terminal renderer")
