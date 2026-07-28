"""Constraint finding tests, kept at parity with the TypeScript package."""

from __future__ import annotations

import json
import os
import sys
from dataclasses import asdict
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from composable_model_graph import (  # noqa: E402
    ConstraintFinding,
    Evidence,
    EvaluationResult,
    GraphRun,
    RunContext,
    SelectedMatch,
    SelectedReference,
    SelectedValue,
    compose_constraints,
    create_constraint,
    create_constraint_evaluator,
    distinct,
    matches,
    predicate,
    project,
    reachable,
    references_exist,
    required,
    within_range,
)


def _finding(kind, code, message, **kwargs):
    return ConstraintFinding(kind=kind, code=code, message=message, **kwargs)


def _without_none(value):
    if isinstance(value, dict):
        return {
            key: _without_none(item)
            for key, item in value.items()
            if item is not None
        }
    if isinstance(value, list):
        return [_without_none(item) for item in value]
    return value


def test_composition_is_ordered_lossless_and_status_free():
    events = []

    def first_check(_value, _context):
        events.append("first")
        return [_finding("note", "same", "Repeated")]

    def second_check(_value, _context):
        events.append("second")
        return [_finding("note", "same", "Repeated")]

    suite = compose_constraints(
        create_constraint("first", "First", first_check),
        create_constraint("second", "Second", second_check),
        create_constraint("empty", "Empty", lambda _value, _context: []),
    )
    report = suite.check(1)

    assert events == ["first", "second"]
    assert [check.constraint_id for check in report.checks] == [
        "first",
        "second",
        "empty",
    ]
    assert len(report.findings) == 2
    assert report.findings[0] == report.findings[1]
    assert report.checks[2].findings == []
    assert all(check.duration_ms is None for check in report.checks)


def test_open_finding_shape_and_canonical_parity_json():
    finding = ConstraintFinding(
        kind="custom-observation",
        code="record.observed",
        message="Record was observed",
        path=["record", "value"],
        observed=4,
        expected=5,
        evidence=[Evidence("source", "manifest", "fixture")],
        data={"recordId": "item-1"},
        tags=["deterministic"],
    )
    report = compose_constraints(
        create_constraint("observe", "Observe", lambda _value, _context: [finding])
    ).check({"record": {"id": "item-1", "value": 4}})
    canonical = {
        "checks": [
            {
                "constraintId": check.constraint_id,
                "constraintName": check.constraint_name,
                "findings": [
                    _without_none(asdict(item)) for item in check.findings
                ],
            }
            for check in report.checks
        ],
        "findings": [_without_none(asdict(item)) for item in report.findings],
    }
    encoded = json.dumps(canonical, separators=(",", ":"), sort_keys=True)
    expected = (
        Path(__file__).resolve().parents[2]
        / "fixtures"
        / "constraint-report.json"
    ).read_text().strip()
    assert encoded == expected


def test_predicate_required_and_projection():
    positive = predicate(
        id="positive",
        test=lambda value, _context: value > 0,
        finding=lambda value, _context: _finding(
            "predicate", "number.non-positive", f"{value} is not positive"
        ),
    )
    required_names = required(
        id="names-required",
        select=lambda state: [
            SelectedValue(str(index), value, ["names", index])
            for index, value in enumerate(state["names"])
        ],
        finding=lambda item: _finding(
            "required", "name.required", f"{item.id} is missing", path=item.path
        ),
    )
    projected = project(
        constraint=positive,
        select=lambda state: state["payload"],
    )

    assert compose_constraints(positive).check(2).findings == []
    assert len(compose_constraints(positive).check(0).findings) == 1
    assert compose_constraints(required_names).check(
        {"names": ["ready", None]}
    ).findings[0].path == ["names", 1]
    assert len(
        compose_constraints(projected).check({"payload": -1}).findings
    ) == 1


def test_distinct_with_custom_equality():
    constraint = distinct(
        id="values-distinct",
        select=lambda state: [
            SelectedValue(str(index), value)
            for index, value in enumerate(state["values"])
        ],
        equals=lambda left, right: left.lower() == right.lower(),
        finding=lambda duplicates: _finding(
            "duplicate",
            "value.duplicate",
            "Values overlap",
            data={"ids": [item.id for item in duplicates]},
        ),
    )
    report = compose_constraints(constraint).check(
        {"values": ["Alpha", "beta", "ALPHA", "alpha"]}
    )
    assert report.findings[0].data == {"ids": ["0", "2", "3"]}
    assert compose_constraints(constraint).check({"values": []}).findings == []

    default_equality = distinct(
        id="default-equality",
        select=lambda state: [
            SelectedValue(str(index), value)
            for index, value in enumerate(state["values"])
        ],
        finding=lambda _duplicates: _finding(
            "duplicate", "value.duplicate", "Duplicate"
        ),
    )
    assert compose_constraints(default_equality).check(
        {"values": [float("nan"), float("nan"), {}, {}]}
    ).findings == []
    assert len(
        compose_constraints(default_equality).check(
            {"values": [-0.0, 0.0]}
        ).findings
    ) == 1


def test_references_and_reachability():
    references = references_exist(
        id="references-exist",
        records=lambda state: state["records"],
        record_id=lambda record: record["id"],
        references=lambda state: [
            SelectedReference(item["source"], item["target"])
            for item in state["references"]
        ],
        finding=lambda reference: _finding(
            "missing-reference",
            "reference.missing",
            f"{reference.target} is missing",
        ),
    )
    paths = reachable(
        id="goals-reachable",
        starts=lambda _state: ["root"],
        goals=lambda state: state["goals"],
        neighbors=lambda id, state: state["edges"].get(id, []),
        finding=lambda _starts, goal: _finding(
            "unreachable", "goal.unreachable", f"{goal} is unreachable"
        ),
    )
    state = {
        "records": [{"id": "root"}, {"id": "child"}],
        "references": [
            {"source": "root", "target": "child"},
            {"source": "child", "target": "missing"},
        ],
        "edges": {"root": ["child"], "child": []},
        "goals": ["child", "detached"],
    }
    report = compose_constraints(references, paths).check(state)
    assert [item.code for item in report.findings] == [
        "reference.missing",
        "goal.unreachable",
    ]


def test_range_and_matches():
    range_constraint = within_range(
        id="range",
        minimum=1,
        maximum=3,
        select=lambda state: [
            SelectedValue(str(index), value)
            for index, value in enumerate(state["values"])
        ],
        finding=lambda item, minimum, maximum: _finding(
            "range",
            "value.outside",
            f"{item.value} outside {minimum}-{maximum}",
        ),
    )
    pairs = matches(
        id="matches",
        select=lambda state: [
            SelectedMatch(str(index), left, right)
            for index, (left, right) in enumerate(state["pairs"])
        ],
        equals=lambda left, right: left.lower() == right.lower(),
        finding=lambda item: _finding(
            "mismatch", "value.mismatch", f"{item.id} differs"
        ),
    )

    assert compose_constraints(range_constraint).check({"values": [1, 3]}).findings == []
    assert len(
        compose_constraints(range_constraint).check({"values": [0, 4]}).findings
    ) == 2
    try:
        within_range(
            id="invalid",
            minimum=2,
            maximum=1,
            select=lambda _state: [],
            finding=lambda _item, _minimum, _maximum: None,
        )
        raise AssertionError("expected range error")
    except ValueError as error:
        assert "minimum 2 exceeds maximum 1" in str(error)
    assert len(
        compose_constraints(pairs).check(
            {"pairs": [("A", "a"), ("B", "C")]}
        ).findings
    ) == 1


def test_evaluator_requires_caller_interpretation():
    suite = compose_constraints(
        predicate(
            id="positive",
            test=lambda value, _context: value > 0,
            finding=lambda _value, _context: _finding(
                "observation", "number.non-positive", "Not positive"
            ),
        )
    )
    contexts = []

    def interpret(report, output, target, context):
        contexts.append((context.run_id, context.metadata["marker"]))
        return EvaluationResult(
            status="pass" if not report.findings else "unknown",
            score=1 if output == target else 0,
            messages=[item.message for item in report.findings],
        )

    evaluator = create_constraint_evaluator(
        id="interpreted",
        constraints=suite,
        interpret=interpret,
    )
    result = evaluator.evaluate(
        -1,
        -1,
        RunContext(run_id="run-1", metadata={"marker": "kept"}),
    )
    assert result == EvaluationResult(
        status="unknown",
        score=1,
        messages=["Not positive"],
    )
    assert contexts == [("run-1", "kept")]


def test_completed_run_constraint_is_direct():
    trace_constraint = create_constraint(
        "trace-present",
        "Trace present",
        lambda run, _context: (
            []
            if run.trace
            else [_finding("trace", "trace.empty", "No trace was recorded")]
        ),
    )
    run = GraphRun(input=1, output=1, trace=[])
    assert (
        compose_constraints(trace_constraint).check(run).findings[0].code
        == "trace.empty"
    )
