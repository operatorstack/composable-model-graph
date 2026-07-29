---
name: cmg
description: Draw a system diagram in the terminal for whatever is in context — an architecture, a pipeline, a data flow, a Locus model or verdict, two designs side by side. Maps the context to a small JSON graph spec and renders it with CMG's deterministic terminal viewer (box-drawing text, no ANSI), then pastes the output in chat. Use when the user says "/cmg", "draw the system", "show me a diagram", "diagram this", or asks to visualize an architecture, pipeline, or state machine.
---

# CMG — terminal system diagrams

CMG (composable-model-graph) has a deterministic terminal renderer that draws a
graph as box-drawing text. This skill turns whatever is in context into a small
JSON graph spec, renders it, and pastes the output. You are the MODELER: extract
the real nodes and edges from the context. The renderer is deterministic and
never invents an edge — neither do you.

## The repo + invocation

```
CMG=~/Documents/GitHub/composable-model-graph
```

Write the spec to `/tmp/cmg-spec.json`, then render (Node ≥20):

```
cd "$CMG/typescript" && pnpm exec tsx examples/19-render-json/src/index.ts /tmp/cmg-spec.json
```

If `pnpm` is not on PATH, use `npx --yes pnpm@9 exec tsx …`. If `node_modules`
is missing, hydrate first: `cd "$CMG/typescript" && npx --yes pnpm@9 install`.
Stdin also works: pass `-` instead of a path and pipe the JSON.

### Pasting the output (READ THIS — the #1 cause of "it looks broken")

Always paste stdout **inside a triple-backtick code fence**. This is not
cosmetic. GUI chats (Codex, ChatGPT) render un-fenced text in a *proportional*
font and wrap long lines — which detaches every box border from its label and
makes the diagram look shattered. Only a code fence forces monospace and lets a
wide diagram scroll instead of wrap. A real terminal (Claude Code) is monospace
either way, but fence it always so it survives both hosts.

Keep the diagram **narrow** so it doesn't wrap even if the fence is imperfect:

- Prefer the default vertical (top-to-bottom) layout for chat. Do NOT force
  `direction: "horizontal"` — a wide chain overflows the chat width and wraps
  into unreadable fragments (this makes it worse, not better).
- Keep node count ≤ ~12; split a big system into concern-scoped sub-diagrams
  rather than one wide graph. Long `name`s are fine — in the default (`auto`)
  direction, when a compact chain or diamond would overflow the column budget
  the renderer auto-abbreviates each box to a short code and appends a `Legend`
  mapping every code back to its full name, so the shape stays one readable row
  instead of falling to the stacked vertical list. (Forcing `direction` off
  `auto` disables this; codes are derived from the names, never invented.)
- If the host shows boxes as tofu (□) or mojibake, add `charset: "ascii"`.

If after all that the host still mangles box-drawing, say so and fall back to a
plain fenced indented list (`Parent → childA, childB`) — still honest, still no
invented edges.

## The spec

```jsonc
{
  "kind": "graph",              // "graph" (default) | "run" | "comparison"
  "id": "publication-world",
  "name": "Protected publication",
  "nodes": [
    { "id": "build",  "name": "Build" },
    { "id": "gate",   "name": "Publish gate", "produces": { "approved": true } }
  ],
  "edges": [                    // omit entirely = a left-to-right chain in node order
    { "src": "build", "dst": "gate" }
  ],
  "options": { "showLifecycle": false, "direction": "vertical" },
  "b": {  }                     // a second graph, only for kind "comparison"
}
```

- `name` is the display label. `id` must be unique; every edge must reference
  declared node ids or the loader rejects the spec.
- **`kind: "graph"`** — structure only. This is the default and the right choice
  for most "draw the system" asks.
- **`kind: "run"`** — executes the graph and shows per-step field diffs (`+`
  added, `~` changed). Give nodes `produces` to show state flowing through.
- **`kind: "comparison"`** — needs a second graph under `b`; renders the two
  converging on a verdict. Comparison labels come from node ids, so give the two
  graphs readable ids.

### Options that matter

- `showLifecycle: false` — draw the transform topology plainly. Use this for
  ordinary system diagrams; the lifecycle boxes (Input/Output/evaluation) are
  CMG-pipeline-specific and usually noise for a generic architecture.
- `direction: "vertical"` — force the narrow top-to-bottom layout. Best default
  for chat; a horizontal chain gets wide and wraps in GUI hosts.
- `columns` — the horizontal-vs-vertical threshold. A *small* value (e.g. `40`)
  keeps it vertical/narrow; a large value invites the wide horizontal chain that
  wraps in chat. Omit and it uses terminal width.
- `charset: "ascii"` — if the host mangles unicode box-drawing (□/mojibake).
- A fan-out/merge or multi-path graph renders as a node list + an explicit edge
  list (honest for a DAG); a single complete path renders as a compact chain.
  Neither is wrong — but both still need a code fence to look right in chat.

## Mapping craft

- **Architecture / context** → components are nodes, calls or data-flow are
  edges. Keep it to ≤ ~12 nodes; past that, split into several diagrams, one per
  concern, rather than one unreadable graph.
- **A Locus model** → states are nodes, transitions are edges. The edge fan-in
  and fan-out is the structure worth seeing. Put event names in `name` where the
  transition label matters.
- **A Locus violation / witness** → render just the offending path as its own
  small graph, titled by the witness, so the failure is legible on its own.
- **A pipeline with state** → `kind: "run"` with `produces` per node, to show
  what each stage adds to the flowing state.
- **Two designs / two readings** → `kind: "comparison"`.

## Honesty rules

- Render with CMG — do not hand-draw boxes and present them as CMG output. If
  the repo or renderer is unavailable, say so plainly and label any manual
  sketch as hand-drawn.
- Every edge in the spec must come from the context you are diagramming. The
  viewer never invents an edge; neither do you. If the context does not state a
  connection, it is not in the diagram.
- The output is deterministic: the same spec always renders the same text.

For the renderer's full behavior see `$CMG/docs/07-terminal-view.md`; the loader
this skill drives is `$CMG/typescript/examples/19-render-json/`.
