# Example 19: Render a diagram from a JSON spec

The terminal viewer draws graphs that are built in code. This example closes the
gap for tools and agents that hold a graph as plain data: it reads a JSON spec
(a file path argument, or `-` for stdin), builds the graph with identity
transforms, and prints the deterministic rendering.

```sh
pnpm --filter @composable-model-graph/example-19-render-json start
# or against your own spec:
pnpm exec tsx examples/19-render-json/src/index.ts path/to/spec.json
python3 python/examples/19-render-json/main.py python/examples/19-render-json/sample-spec.json
```

Both commands produce byte-identical output.

## Spec shape

```jsonc
{
  "kind": "graph" | "run" | "comparison",   // default "graph"
  "id": "...", "name": "...",
  "nodes": [{ "id": "...", "name": "...", "produces": { } }],
  "edges": [{ "src": "...", "dst": "..." }], // omitted = left-to-right chain
  "options": { "charset", "columns", "direction", "showLifecycle", "labels", "detail" },
  "b": {  }                                  // second graph for "comparison"
}
```

Each node's `name` is surfaced as the display label; `produces` merges into the
flowing state so `kind: "run"` shows field diffs. The renderer never invents an
edge, and neither does this loader: every edge must reference declared nodes, or
the spec is rejected with the fault named.
