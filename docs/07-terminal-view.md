# Terminal graph view

CMG's first viewer stays in the edit/run loop. It projects the graph that
actually executes instead of asking a caller to maintain a second diagram:

```text
ModelGraph         -> input, executable topology, output, evaluation, feedback
ModelGraph + trace -> lifecycle plus produced-state fields and run outcomes
Analysis result    -> comparison, decoded path, sensitivity, useful flow
```

TypeScript:

```ts
import { renderGraph, renderRun } from "@composable-model-graph/terminal";

console.log(renderGraph(graph));
console.log(renderRun(graph, await graph.run({})));
```

Python:

```python
from composable_model_graph.terminal import render_graph, render_run

print(render_graph(graph))
print(render_run(graph, graph.run({})))
```

Both APIs return plain text. They do not write to stdout, add ANSI styling, or
change graph execution.

## Lifecycle, structure, and run views

`renderGraph` connects Input and Output boundaries to the real transform
topology, then adds declared evaluator and feedback stages. A DAG connects Input
to every runner root and connects the runner's final topological transform to
Output. Pass `showLifecycle: false` / `show_lifecycle=False` for the original
transform-only projection.

When explicit `connections` form one complete path through every transform, the
renderer derives that path's order from the edges and uses the compact connected
chain layout. Other connection shapes remain DAG views.

`renderRun` adds a concise step list and compares each trace step's plain-object
input and output. Top-level added, changed, and removed fields are shown as
`+`, `~`, and `-`. Added fields that differ from their transform ID appear as
semantic branches; they remain state fields, never executable nodes.

Camel- and kebab-case IDs become sentence labels. `labels` can override a
transform's display name without redefining topology.

Summary detail is the default. `detail: "full"` / `detail="full"` additionally
shows recorded signals, evaluation evidence/messages, feedback signals, and
analysis payloads where they exist.

## Analysis result views

The terminal package stays dependent only on core. Its analysis functions accept
the public result shapes structurally:

| CMG surface | Terminal projection |
| --- | --- |
| `ModelGraph` | `renderGraph` / `render_graph` |
| `GraphRun` | `renderRun` / `render_run` |
| Two graph/run pairs | `renderComparison` / `render_comparison` |
| `DecodedPath` | `renderDecodedPath` / `render_decoded_path` |
| `SensitivitySignal`, `Sensitivity`, `KnobSensitivity[]` | `renderSensitivity` / `render_sensitivity` |
| `UsefulFlowScore` | `renderUsefulFlow` / `render_useful_flow` |
| `DenseLayer`, `TransferFunction` | Normal transform nodes |
| Activation and loss functions | Visible when composed into named transforms |

This is deliberate: stateless functions do not have an inspectable identity
from which an honest standalone node could be derived.

## Width and character sets

Unicode is the default. ASCII is available with `charset: "ascii"` /
`charset="ascii"`. `direction: "auto"` uses a horizontal sequential layout when
it fits and a vertical layout otherwise. `columns` makes the decision explicit
and deterministic. Without it, the terminal width is used with an 80-column
fallback.

Explicit horizontal output fails clearly when the available width cannot
preserve every label. A simple fan-out/merge uses a compact layered view; other
DAGs use a deterministic node list and declared edge list so layout never hides
or invents a connection.

## Control laws

- **viewer-derives-execution-structure:** executable nodes and edges come from
  the `ModelGraph` the runner consumes.
- **semantic-branches-do-not-become-execution:** displayed fields cannot alter
  execution, ordering, state, evaluation, or feedback.
- **viewer-never-invents-edges:** orientation can change; topology cannot.
- **run-view-derives-from-trace:** run state changes come only from `GraphRun`.
- **terminal-width-does-not-change-meaning:** narrow output retains every node,
  edge, field, evaluation, and feedback item.
- **language-parity:** equivalent TypeScript and Python inputs produce identical
  text.
