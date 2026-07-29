"""Deterministic terminal projections of CMG graphs and completed runs."""

from __future__ import annotations

import shutil
import math
import json
import re
from dataclasses import dataclass
from typing import Any, Literal, Mapping, Optional

from ..core import GraphRun, ModelGraph, TraceStep, compare_runs

TerminalDirection = Literal["auto", "horizontal", "vertical"]
TerminalCharset = Literal["unicode", "ascii"]
TerminalDetail = Literal["summary", "full"]


@dataclass(frozen=True)
class _Glyphs:
    top_left: str
    top_right: str
    bottom_left: str
    bottom_right: str
    horizontal: str
    vertical: str
    arrow_right: str
    arrow_down: str
    tee: str
    elbow: str


@dataclass(frozen=True)
class _Diff:
    added: list[str]
    changed: list[str]
    removed: list[str]


@dataclass
class _Node:
    id: str
    label: str
    branches: list[str]
    kind: str = "transform"


UNICODE = _Glyphs("┌", "┐", "└", "┘", "─", "│", "▶", "▼", "├", "└")
ASCII = _Glyphs("+", "+", "+", "+", "-", "|", ">", "v", "+", "+")


def _readable_label(value: str) -> str:
    chars: list[str] = []
    for index, char in enumerate(value):
        if char in "_-":
            chars.append(" ")
        elif index > 0 and char.isupper() and value[index - 1].islower():
            chars.extend((" ", char))
        else:
            chars.append(char)
    words = "".join(chars).strip().lower()
    return words[:1].upper() + words[1:] if words else value


def _normalized(value: str) -> str:
    return "".join(char.lower() for char in value if char.isalnum())


def _base_code(label: str) -> str:
    """Derive a short, deterministic code from a display label.

    Multi-word labels use the initials of each word; a single word uses its
    first letter plus its leading consonants. Uppercased, clamped to 4 chars.
    """
    spaced = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", label)
    spaced = re.sub(r"[_-]+", " ", spaced)
    words = [w for w in spaced.split() if re.search(r"[a-zA-Z0-9]", w)]
    if len(words) >= 2:
        return "".join(
            re.sub(r"[^a-zA-Z0-9]", "", w)[:1] for w in words
        )[:4].upper()
    word = re.sub(r"[^a-zA-Z0-9]", "", words[0] if words else label)
    if not word:
        return label.upper()
    consonants = [word[0]] + [c for c in word[1:] if c not in "aeiouAEIOU"]
    code = "".join(consonants)[:3].upper()
    return code if len(code) >= 2 else word[:3].upper()


def _abbreviate_nodes(
    nodes: list["_Node"],
) -> tuple[list["_Node"], list[tuple[str, str]]]:
    """Assign each transform node a unique short code, in node order."""
    used: set[str] = set()
    legend: list[tuple[str, str]] = []
    result: list[_Node] = []
    for node in nodes:
        if node.kind != "transform":
            result.append(node)
            continue
        code = _base_code(node.label)
        if code in used:
            suffix = 2
            while f"{code}{suffix}" in used:
                suffix += 1
            code = f"{code}{suffix}"
        used.add(code)
        if code != node.label:
            legend.append((code, node.label))
        result.append(_Node(node.id, code, node.branches, node.kind))
    return result, legend


def _legend_block(legend: list[tuple[str, str]]) -> str:
    return "\n".join(
        ["", "Legend", *[f"  {code} = {label}" for code, label in legend]]
    )


def _state_diff(step: TraceStep) -> _Diff:
    if not isinstance(step.input, dict) or not isinstance(step.output, dict):
        return _Diff([], [], [])
    before = step.input
    after = step.output
    before_keys = set(before)
    after_keys = set(after)
    return _Diff(
        added=sorted(after_keys - before_keys),
        changed=sorted(
            key for key in after_keys & before_keys
            if not _same_value(before[key], after[key])
        ),
        removed=sorted(before_keys - after_keys),
    )


def _same_value(before: Any, after: Any) -> bool:
    """Match JavaScript Object.is for the JSON-like values CMG usually carries."""
    if before is after:
        return True
    primitive = (type(None), bool, int, float, str)
    if type(before) not in primitive or type(after) is not type(before):
        return False
    if isinstance(before, float):
        if math.isnan(before) and math.isnan(after):
            return True
        if before == 0 and after == 0:
            return math.copysign(1, before) == math.copysign(1, after)
    return bool(before == after)


def _columns(columns: Optional[int]) -> int:
    if columns is not None:
        if isinstance(columns, bool) or not isinstance(columns, int) or columns <= 0:
            raise ValueError("terminal columns must be a positive integer")
        return columns
    return shutil.get_terminal_size(fallback=(80, 24)).columns


def _validate_labels(graph: ModelGraph, labels: Mapping[str, str]) -> None:
    ids = {transform.id for transform in graph.transforms}
    for transform_id in sorted(labels):
        if transform_id not in ids:
            raise ValueError(
                f"terminal label references unknown transform id: {transform_id}"
            )


def _projections(
    graph: ModelGraph,
    labels: Mapping[str, str],
    run: Optional[GraphRun] = None,
    show_produced_fields: bool = False,
) -> list[_Node]:
    steps = {step.transform_id: step for step in run.trace} if run else {}
    result: list[_Node] = []
    for transform in graph.transforms:
        explicit_label = labels.get(transform.id)
        label = explicit_label or _readable_label(transform.id)
        diff = _state_diff(steps[transform.id]) if transform.id in steps else _Diff([], [], [])
        owner = _normalized(transform.id)
        branches = (
            [
                _readable_label(key)
                for key in diff.added
                if _normalized(key) != owner
            ]
            if show_produced_fields
            else []
        )
        if (
            explicit_label is None
            and len(branches) > 1
            and all(_normalized(branch).endswith(owner) for branch in branches)
            and not label.endswith("s")
        ):
            label += "s"
        result.append(_Node(transform.id, label, branches, "transform"))
    return result


def _topological_order(graph: ModelGraph) -> list[str]:
    if not graph.connections:
        return [transform.id for transform in graph.transforms]
    successors = {transform.id: [] for transform in graph.transforms}
    indegree = {transform.id: 0 for transform in graph.transforms}
    for edge in graph.connections:
        successors[edge.src].append(edge.dst)
        indegree[edge.dst] += 1
    queue = [
        transform.id for transform in graph.transforms
        if indegree[transform.id] == 0
    ]
    order: list[str] = []
    while queue:
        transform_id = queue.pop(0)
        order.append(transform_id)
        for successor in successors[transform_id]:
            indegree[successor] -= 1
            if indegree[successor] == 0:
                queue.append(successor)
    return order


def _explicit_linear_order(graph: ModelGraph) -> Optional[list[str]]:
    connections = graph.connections
    transform_ids = [transform.id for transform in graph.transforms]
    if not connections or len(transform_ids) < 2:
        return None
    if len(connections) != len(transform_ids) - 1:
        return None

    known = set(transform_ids)
    successors: dict[str, list[str]] = {
        transform_id: [] for transform_id in transform_ids
    }
    indegree = {transform_id: 0 for transform_id in transform_ids}
    seen_edges: set[tuple[str, str]] = set()
    for edge in connections:
        if edge.src not in known or edge.dst not in known:
            return None
        edge_key = (edge.src, edge.dst)
        if edge_key in seen_edges:
            return None
        seen_edges.add(edge_key)
        successors[edge.src].append(edge.dst)
        indegree[edge.dst] += 1

    roots = [
        transform_id for transform_id in transform_ids
        if indegree[transform_id] == 0
    ]
    if len(roots) != 1:
        return None
    order: list[str] = []
    visited: set[str] = set()
    current: Optional[str] = roots[0]
    while current is not None:
        if current in visited:
            return None
        visited.add(current)
        order.append(current)
        next_ids = successors[current]
        if len(next_ids) > 1:
            return None
        current = next_ids[0] if next_ids else None
    return order if len(order) == len(transform_ids) else None


def _lifecycle_projection(
    graph: ModelGraph,
    transform_nodes: list[_Node],
    run: Optional[GraphRun],
    show_lifecycle: bool,
    show_evaluation: bool,
    show_feedback: bool,
) -> tuple[list[_Node], Optional[list[Any]]]:
    linear_order = _explicit_linear_order(graph)
    nodes_by_id = {node.id: node for node in transform_nodes}
    ordered_transform_nodes = (
        [nodes_by_id[transform_id] for transform_id in linear_order]
        if linear_order is not None
        else transform_nodes
    )
    if not show_lifecycle:
        return (
            ordered_transform_nodes,
            graph.connections if graph.connections and linear_order is None else None,
        )
    input_node = _Node("$input", "Input", [], "boundary")
    output_node = _Node("$output", "Output", [], "boundary")
    nodes = [input_node, *ordered_transform_nodes, output_node]
    edges: list[Any] = []

    @dataclass
    class Edge:
        src: str
        dst: str

    order = _topological_order(graph)
    if graph.connections:
        destinations = {edge.dst for edge in graph.connections}
        for transform_id in order:
            if transform_id not in destinations:
                edges.append(Edge(input_node.id, transform_id))
        edges.extend(graph.connections)
    else:
        for index in range(len(order) - 1):
            edges.append(Edge(order[index], order[index + 1]))
        if order:
            edges.append(Edge(input_node.id, order[0]))
    if order:
        edges.append(Edge(order[-1], output_node.id))
    else:
        edges.append(Edge(input_node.id, output_node.id))

    previous = output_node.id
    if graph.evaluator is not None and show_evaluation:
        evaluation = _Node(
            "$evaluation",
            (
                f"Evaluation: {run.evaluation.status}"
                if run is not None and run.evaluation is not None
                else "Evaluation"
            ),
            [],
            "evaluator",
        )
        nodes.append(evaluation)
        edges.append(Edge(previous, evaluation.id))
        previous = evaluation.id
    if graph.feedback_resolver is not None and show_feedback:
        feedback = _Node(
            "$feedback",
            (
                f"Feedback: {run.feedback.kind}"
                if run is not None and run.feedback is not None
                else "Feedback"
            ),
            [],
            "feedback",
        )
        nodes.append(feedback)
        edges.append(Edge(previous, feedback.id))
    simple_chain = (
        not graph.connections
        or not graph.transforms
        or linear_order is not None
    )
    return nodes, None if simple_chain else edges


def _box_lines(node: _Node, glyphs: _Glyphs) -> list[str]:
    inner_width = len(node.label) + 2
    return [
        glyphs.top_left + glyphs.horizontal * inner_width + glyphs.top_right,
        f"{glyphs.vertical} {node.label} {glyphs.vertical}",
        glyphs.bottom_left + glyphs.horizontal * inner_width + glyphs.bottom_right,
    ]


def _horizontal_layout(nodes: list[_Node], glyphs: _Glyphs) -> str:
    if not nodes:
        return ""
    boxes = [_box_lines(node, glyphs) for node in nodes]
    connector = glyphs.horizontal * 3 + glyphs.arrow_right
    lines = [
        "    ".join(box[0] for box in boxes),
        connector.join(box[1] for box in boxes),
        "    ".join(box[2] for box in boxes),
    ]
    centers: list[int] = []
    offset = 0
    for index, box in enumerate(boxes):
        width = len(box[0])
        centers.append(offset + width // 2)
        offset += width + (4 if index < len(boxes) - 1 else 0)

    branch_rows: list[dict[int, str]] = []
    for index, node in enumerate(nodes):
        center = centers[index]
        if len(node.branches) == 1:
            while len(branch_rows) < 2:
                branch_rows.append({})
            branch_rows[0][center] = glyphs.arrow_down
            branch_rows[1][max(0, center - len(node.branches[0]) // 2)] = (
                node.branches[0]
            )
        elif node.branches:
            while len(branch_rows) < len(node.branches):
                branch_rows.append({})
            for branch_index, branch in enumerate(node.branches):
                marker = (
                    glyphs.elbow
                    if branch_index == len(node.branches) - 1
                    else glyphs.tee
                )
                branch_rows[branch_index][center] = (
                    f"{marker}{glyphs.horizontal} {branch}"
                )
    for row in branch_rows:
        rendered = ""
        for column, content in sorted(row.items()):
            rendered = rendered.ljust(column) + content
        lines.append(rendered.rstrip())
    return "\n".join(lines)


def _vertical_layout(
    nodes: list[_Node],
    glyphs: _Glyphs,
    edges: Optional[list[Any]] = None,
) -> str:
    lines: list[str] = []
    for index, node in enumerate(nodes):
        lines.extend(_box_lines(node, glyphs))
        for branch_index, branch in enumerate(node.branches):
            marker = (
                glyphs.elbow
                if branch_index == len(node.branches) - 1
                else glyphs.tee
            )
            lines.append(f"  {marker}{glyphs.horizontal} {branch}")
        if index < len(nodes) - 1 and edges is None:
            lines.append(f"  {glyphs.arrow_down}")
    if edges is not None:
        node_labels = {node.id: node.label for node in nodes}
        lines.extend(("", "Edges"))
        for edge in edges:
            lines.append(
                f"  {node_labels.get(edge.src, _readable_label(edge.src))} "
                f"{glyphs.horizontal}{glyphs.arrow_right} "
                f"{node_labels.get(edge.dst, _readable_label(edge.dst))}"
            )
    return "\n".join(lines)


def _simple_diamond_layout(
    nodes: list[_Node], glyphs: _Glyphs, edges: list[Any]
) -> Optional[str]:
    if (
        len(nodes) != 3
        or len(edges) != 2
        or edges[0].dst != edges[1].dst
        or edges[0].src == edges[1].src
    ):
        return None
    labels = {node.id: node.label for node in nodes}
    first = labels.get(edges[0].src)
    second = labels.get(edges[1].src)
    sink = labels.get(edges[0].dst)
    if not first or not second or not sink:
        return None
    left = [f"[{first}]", f"[{second}]"]
    left_width = max(map(len, left))
    return "\n".join(
        [
            f"{left[0]:<{left_width}} {glyphs.horizontal}{glyphs.top_right}",
            f"{' ' * (left_width + 2)}{glyphs.tee}"
            f"{glyphs.horizontal}{glyphs.arrow_right} [{sink}]",
            f"{left[1]:<{left_width}} {glyphs.horizontal}{glyphs.bottom_right}",
        ]
    )


def _lifecycle_diamond_layout(
    nodes: list[_Node], glyphs: _Glyphs, edges: list[Any]
) -> Optional[str]:
    labels = {node.id: node.label for node in nodes}
    if "$input" not in labels or "$output" not in labels:
        return None
    roots = [edge.dst for edge in edges if edge.src == "$input"]
    if len(roots) != 2:
        return None
    first_targets = [edge.dst for edge in edges if edge.src == roots[0]]
    second_targets = [edge.dst for edge in edges if edge.src == roots[1]]
    if (
        len(first_targets) != 1
        or len(second_targets) != 1
        or first_targets[0] != second_targets[0]
    ):
        return None
    sink = first_targets[0]
    if not any(edge.src == sink and edge.dst == "$output" for edge in edges):
        return None
    input_label = f"[{labels['$input']}]"
    output_label = f"[{labels['$output']}]"
    first = f"[{labels[roots[0]]}]"
    second = f"[{labels[roots[1]]}]"
    merged = f"[{labels[sink]}]"
    prefix = " " * (len(input_label) + 5)
    branch_width = max(len(first), len(second))
    return "\n".join(
        [
            f"{prefix}{glyphs.top_left}{glyphs.horizontal}"
            f"{glyphs.arrow_right} {first:<{branch_width}} "
            f"{glyphs.horizontal}{glyphs.top_right}",
            f"{input_label} {glyphs.horizontal * 3}{glyphs.arrow_right} "
            f"{glyphs.tee}{' ' * (branch_width + 4)}{glyphs.tee}"
            f"{glyphs.horizontal}{glyphs.arrow_right} {merged} "
            f"{glyphs.horizontal * 3}{glyphs.arrow_right} {output_label}",
            f"{prefix}{glyphs.bottom_left}{glyphs.horizontal}"
            f"{glyphs.arrow_right} {second:<{branch_width}} "
            f"{glyphs.horizontal}{glyphs.bottom_right}",
        ]
    )


def _architecture(
    graph: ModelGraph,
    *,
    labels: Optional[Mapping[str, str]] = None,
    columns: Optional[int] = None,
    direction: TerminalDirection = "auto",
    charset: TerminalCharset = "unicode",
    run: Optional[GraphRun] = None,
    show_produced_fields: bool = False,
    show_lifecycle: bool = True,
    show_evaluation: bool = True,
    show_feedback: bool = True,
) -> str:
    resolved_labels = labels or {}
    _validate_labels(graph, resolved_labels)
    if direction not in ("auto", "horizontal", "vertical"):
        raise ValueError(f"unknown terminal direction: {direction}")
    if charset not in ("unicode", "ascii"):
        raise ValueError(f"unknown terminal charset: {charset}")
    transform_nodes = _projections(
        graph, resolved_labels, run, show_produced_fields
    )
    nodes, edges = _lifecycle_projection(
        graph,
        transform_nodes,
        run,
        show_lifecycle,
        show_evaluation,
        show_feedback,
    )
    glyphs = ASCII if charset == "ascii" else UNICODE
    resolved_columns = _columns(columns)
    if edges:
        # The widest compact diamond (lifecycle, then simple) that fits columns.
        def diamond_for(ns: list[_Node]) -> Optional[str]:
            lifecycle = _lifecycle_diamond_layout(ns, glyphs, edges)
            if (
                lifecycle
                and max(map(len, lifecycle.splitlines()), default=0)
                <= resolved_columns
            ):
                return lifecycle
            simple = _simple_diamond_layout(ns, glyphs, edges)
            if (
                simple
                and max(map(len, simple.splitlines()), default=0)
                <= resolved_columns
            ):
                return simple
            return None

        if direction != "vertical":
            full = diamond_for(nodes)
            if full is not None:
                return full
        # Auto only: if a full-label diamond overflows, retry with short codes
        # and append a legend before giving up on the compact shape.
        if direction == "auto":
            abbreviated, legend = _abbreviate_nodes(nodes)
            if legend:
                compact = diamond_for(abbreviated)
                if compact is not None:
                    return f"{compact}\n{_legend_block(legend)}"
        if direction == "horizontal":
            diamond = _simple_diamond_layout(nodes, glyphs, edges)
            diamond_width = (
                max(map(len, diamond.splitlines()), default=0) if diamond else 0
            )
            if diamond and diamond_width > resolved_columns:
                raise ValueError(
                    f"horizontal terminal layout requires {diamond_width} columns; "
                    f"received {resolved_columns}"
                )
            raise ValueError(
                "horizontal terminal layout is unavailable for this DAG shape"
            )
        return _vertical_layout(nodes, glyphs, edges)
    horizontal = _horizontal_layout(nodes, glyphs)
    widest = max((len(line) for line in horizontal.splitlines()), default=0)
    if direction == "horizontal":
        if widest > resolved_columns:
            raise ValueError(
                f"horizontal terminal layout requires {widest} columns; "
                f"received {resolved_columns}"
            )
        return horizontal
    # Auto only: a wide chain gets short codes + a legend before the vertical
    # fallback, so a near-linear flow stays a single readable row.
    if direction == "auto" and widest > resolved_columns:
        abbreviated, legend = _abbreviate_nodes(nodes)
        if legend:
            compact = _horizontal_layout(abbreviated, glyphs)
            compact_width = max(
                (len(line) for line in compact.splitlines()), default=0
            )
            if compact_width <= resolved_columns:
                return f"{compact}\n{_legend_block(legend)}"
    if direction == "vertical" or widest > resolved_columns:
        return _vertical_layout(nodes, glyphs)
    return horizontal


def render_graph(
    graph: ModelGraph,
    *,
    labels: Optional[Mapping[str, str]] = None,
    columns: Optional[int] = None,
    direction: TerminalDirection = "auto",
    charset: TerminalCharset = "unicode",
    show_lifecycle: bool = True,
    detail: TerminalDetail = "summary",
) -> str:
    """Render the executable structure declared by a ModelGraph."""

    return _architecture(
        graph,
        labels=labels,
        columns=columns,
        direction=direction,
        charset=charset,
        show_lifecycle=show_lifecycle,
    )


def _number(value: Any) -> str:
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def _display_value(value: Any) -> str:
    if isinstance(value, str):
        return value
    try:
        return json.dumps(value, separators=(",", ":"), sort_keys=True)
    except (TypeError, ValueError):
        return str(value)


def render_run(
    graph: ModelGraph,
    run: GraphRun,
    *,
    labels: Optional[Mapping[str, str]] = None,
    columns: Optional[int] = None,
    direction: TerminalDirection = "auto",
    charset: TerminalCharset = "unicode",
    show_produced_fields: bool = True,
    show_duration: bool = False,
    show_evaluation: bool = True,
    show_feedback: bool = True,
    show_lifecycle: bool = True,
    detail: TerminalDetail = "summary",
) -> str:
    """Render graph structure plus state changes from a completed GraphRun."""

    lines = [
        graph.name,
        "",
        _architecture(
            graph,
            labels=labels,
            columns=columns,
            direction=direction,
            charset=charset,
            run=run,
            show_produced_fields=show_produced_fields,
            show_lifecycle=show_lifecycle,
            show_evaluation=show_evaluation,
            show_feedback=show_feedback,
        ),
        "",
        "Run",
    ]
    for index, step in enumerate(run.trace, start=1):
        diff = _state_diff(step)
        changes = (
            [f"+ {key}" for key in diff.added]
            + [f"~ {key}" for key in diff.changed]
            + [f"- {key}" for key in diff.removed]
        )
        duration = f" ({_number(step.duration_ms)}ms)" if show_duration else ""
        suffix = f"  {', '.join(changes)}" if changes else ""
        lines.append(f"  {index}. {step.transform_name}{duration}{suffix}")
        if detail == "full":
            for key, value in sorted((step.metadata or {}).items()):
                lines.append(f"     {key}: {_display_value(value)}")
    if show_evaluation and run.evaluation is not None:
        summary = f"Evaluation: {run.evaluation.status}"
        if run.evaluation.score is not None:
            summary += f"  score={_number(run.evaluation.score)}"
        if run.evaluation.error is not None:
            summary += f"  error={_number(run.evaluation.error)}"
        lines.extend(("", summary))
        if detail == "full":
            for message in run.evaluation.messages or []:
                lines.append(f"  Message: {message}")
            for evidence in run.evaluation.evidence or []:
                source = f" ({evidence.source})" if evidence.source else ""
                lines.append(
                    f"  Evidence: {evidence.label} = "
                    f"{_display_value(evidence.value)}{source}"
                )
    if show_feedback and run.feedback is not None:
        reason = f" — {run.feedback.reason}" if run.feedback.reason else ""
        lines.append(f"Feedback: {run.feedback.kind}{reason}")
        if detail == "full" and run.feedback.signal is not None:
            lines.append(f"  Signal: {_display_value(run.feedback.signal)}")
    return "\n".join(lines)


def _analysis_glyphs(charset: TerminalCharset) -> _Glyphs:
    return ASCII if charset == "ascii" else UNICODE


def render_comparison(
    a: Mapping[str, Any],
    b: Mapping[str, Any],
    *,
    charset: TerminalCharset = "unicode",
    detail: TerminalDetail = "summary",
) -> str:
    """Render two graph runs converging on their comparison verdict."""

    glyphs = _analysis_glyphs(charset)
    comparison = compare_runs(a["run"], b["run"])
    label_a = a.get("label", a["graph"].name)
    label_b = b.get("label", b["graph"].name)
    left_width = max(len(label_a), len(label_b)) + 2
    verdict = f"Compare: {comparison.better.upper()}"
    lines = [
        f"[{label_a}]".ljust(left_width + 2)
        + f"{glyphs.horizontal}{glyphs.top_right}",
        f"{' ' * (left_width + 3)}{glyphs.tee}"
        f"{glyphs.horizontal}{glyphs.arrow_right} [{verdict}]",
        f"[{label_b}]".ljust(left_width + 2)
        + f"{glyphs.horizontal}{glyphs.bottom_right}",
        f"Reason: {comparison.reason}",
    ]
    if detail == "full":
        lines.append(
            f"Scores: A={_display_value(comparison.score['a'])} "
            f"B={_display_value(comparison.score['b'])} "
            f"delta={_display_value(comparison.score['delta'])}"
        )
        for key, signal in sorted(comparison.signals.items()):
            lines.append(
                f"Signal {key}: A={_number(signal.a)} B={_number(signal.b)} "
                f"delta={_number(signal.delta)}"
            )
    return "\n".join(lines)


def render_decoded_path(
    path: Any,
    *,
    charset: TerminalCharset = "unicode",
    detail: TerminalDetail = "summary",
) -> str:
    """Render a decoded state path and its cumulative score."""

    glyphs = _analysis_glyphs(charset)
    connector = f" {glyphs.horizontal}{glyphs.arrow_right} "
    states = connector.join(f"[{step.state_id}]" for step in path.steps)
    lines = [states, f"Total score: {_number(path.total_score)}"]
    if detail == "full":
        for step in path.steps:
            value = getattr(step.state, "value", None)
            suffix = f" value={_display_value(value)}" if value is not None else ""
            lines.append(
                f"  {step.step_index}. {step.state_id} "
                f"score={_number(step.score)} "
                f"transition={_number(step.transition_cost)} "
                f"cumulative={_number(step.cumulative_score)}{suffix}"
            )
    return "\n".join(lines)


def render_sensitivity(
    result: Any,
    *,
    charset: TerminalCharset = "unicode",
    detail: TerminalDetail = "summary",
) -> str:
    """Render scalar/update sensitivity or ranked knob sensitivities."""

    del detail
    glyphs = _analysis_glyphs(charset)
    if isinstance(result, (list, tuple)):
        lines = ["Sensitivity ranking"]
        for index, item in enumerate(result, start=1):
            lines.append(
                f"  {index}. {item.name} "
                f"{glyphs.horizontal}{glyphs.arrow_right} "
                f"gradient={_number(item.gradient)} "
                f"magnitude={_number(item.magnitude)}"
            )
        return "\n".join(lines)
    if hasattr(result, "update_signal"):
        return "\n".join(
            [
                f"[Prediction {_number(result.prediction)}] "
                f"{glyphs.horizontal}{glyphs.arrow_right} "
                f"[Error {_number(result.error)}] "
                f"{glyphs.horizontal}{glyphs.arrow_right} "
                f"[Update {_number(result.update_signal)}]",
                f"Target: {_number(result.target)}  "
                f"Sensitivity: {_number(result.sensitivity)}",
            ]
        )
    return (
        f"[At {_number(result.at)}] "
        f"{glyphs.horizontal}{glyphs.arrow_right} "
        f"[Value {_number(result.value)}] "
        f"{glyphs.horizontal}{glyphs.arrow_right} "
        f"[Gradient {_number(result.gradient)}]"
    )


def render_useful_flow(
    result: Any,
    *,
    charset: TerminalCharset = "unicode",
    detail: TerminalDetail = "summary",
) -> str:
    """Render quality and cost converging on a useful-flow score."""

    del detail
    glyphs = _analysis_glyphs(charset)
    quality = f"[Quality {_number(result.quality)}]"
    cost = f"[Cost {_number(result.cost)}]"
    width = max(len(quality), len(cost))
    return "\n".join(
        [
            f"{quality:<{width}} {glyphs.horizontal}{glyphs.top_right}",
            f"{' ' * (width + 2)}{glyphs.tee}"
            f"{glyphs.horizontal}{glyphs.arrow_right} "
            f"[Score {_number(result.score)}]",
            f"{cost:<{width}} {glyphs.horizontal}{glyphs.bottom_right}",
        ]
    )


__all__ = [
    "TerminalCharset",
    "TerminalDirection",
    "TerminalDetail",
    "render_comparison",
    "render_decoded_path",
    "render_graph",
    "render_run",
    "render_sensitivity",
    "render_useful_flow",
]
