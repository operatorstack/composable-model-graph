#!/usr/bin/env python3
"""Example 19 — render a diagram from a JSON spec.

The terminal viewer draws graphs that are built in code. This example closes the
gap for tools and agents that hold a graph as plain data: read a JSON spec (a
file path argument, or ``-`` for stdin), build the graph with identity
transforms, and print the deterministic rendering. It is the byte-identical twin
of ``typescript/examples/19-render-json``.

Spec shape::

    {
      "kind": "graph" | "run" | "comparison",
      "id": "...", "name": "...",
      "nodes": [{"id": "...", "name": "...", "produces": {}}],
      "edges": [{"src": "...", "dst": "..."}],
      "options": {"charset", "columns", "direction", "showLifecycle", "labels", "detail"},
      "b": {}
    }

"edges" omitted = a left-to-right chain in node order. "produces" merges into the
flowing state so ``kind: "run"`` shows field diffs. The renderer never invents an
edge, and neither does this loader: the spec is drawn as given or rejected with
the fault named.
"""

from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "src"))

from composable_model_graph import (  # noqa: E402
    Connection,
    create_model_graph,
    create_transform,
    render_comparison,
    render_graph,
    render_run,
)


def fail(message: str) -> "NoReturn":  # type: ignore[name-defined]
    print(f"render-json: {message}", file=sys.stderr)
    raise SystemExit(1)


def _merge_state(state, produces):
    previous = {}
    if isinstance(state, list):
        for part in state:
            if isinstance(part, dict):
                previous.update(part)
    elif isinstance(state, dict):
        previous = dict(state)
    return {**previous, **(produces or {})}


def build_graph(spec):
    if not spec.get("id") or not spec.get("name"):
        fail("a graph spec needs id and name")
    nodes = spec.get("nodes")
    if not isinstance(nodes, list) or not nodes:
        fail("a graph spec needs at least one node")
    ids = set()
    for node in nodes:
        if not node.get("id") or not node.get("name"):
            fail("every node needs id and name")
        if node["id"] in ids:
            fail(f"duplicate node id {json.dumps(node['id'])}")
        ids.add(node["id"])
    edges = spec.get("edges") or []
    for edge in edges:
        if edge.get("src") not in ids or edge.get("dst") not in ids:
            fail(f"edge {edge.get('src')} -> {edge.get('dst')} references an undeclared node")

    def make_run(produces):
        return lambda state, _ctx: _merge_state(state, produces)

    transforms = [
        create_transform(node["id"], node["name"], make_run(node.get("produces")))
        for node in nodes
    ]
    connections = [Connection(src=e["src"], dst=e["dst"]) for e in edges] or None
    return create_model_graph(spec["id"], spec["name"], transforms, connections)


def _labels_for(spec):
    return {node["id"]: node["name"] for node in spec["nodes"]}


def main() -> None:
    if len(sys.argv) < 2:
        fail("usage: main.py <spec.json | ->")
    source = sys.argv[1]
    raw = sys.stdin.read() if source == "-" else open(source, encoding="utf8").read()
    try:
        spec = json.loads(raw)
    except json.JSONDecodeError as error:
        fail(f"spec is not valid JSON: {error}")

    opts = spec.get("options") or {}
    labels = {**_labels_for(spec), **(opts.get("labels") or {})}
    graph = build_graph(spec)
    kind = spec.get("kind", "graph")

    if kind == "graph":
        print(render_graph(
            graph,
            labels=labels,
            columns=opts.get("columns"),
            direction=opts.get("direction", "auto"),
            charset=opts.get("charset", "unicode"),
            show_lifecycle=opts.get("showLifecycle", True),
            detail=opts.get("detail", "summary"),
        ))
    elif kind == "run":
        run = graph.run({})
        print(render_run(
            graph,
            run,
            labels=labels,
            columns=opts.get("columns"),
            direction=opts.get("direction", "auto"),
            charset=opts.get("charset", "unicode"),
            show_lifecycle=opts.get("showLifecycle", True),
            detail=opts.get("detail", "summary"),
            show_duration=False,
        ))
    elif kind == "comparison":
        if not spec.get("b"):
            fail('kind "comparison" needs a second graph under "b"')
        other = build_graph(spec["b"])
        run_a = graph.run({})
        run_b = other.run({})
        # render_comparison takes only charset/detail in both languages, so the
        # twins stay byte-identical; comparison nodes show id-derived labels.
        print(render_comparison(
            {"graph": graph, "run": run_a, "label": spec.get("label", spec["name"])},
            {"graph": other, "run": run_b, "label": spec["b"].get("label", spec["b"]["name"])},
            charset=opts.get("charset", "unicode"),
            detail=opts.get("detail", "summary"),
        ))
    else:
        fail(f"unknown kind {json.dumps(kind)}")


if __name__ == "__main__":
    main()
