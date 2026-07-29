# Example 19: Render a diagram from a JSON spec

The Python twin of `typescript/examples/19-render-json`. It reads a JSON graph
spec (a file path argument, or `-` for stdin), builds the graph with identity
transforms, and prints the deterministic rendering.

```sh
python3 python/examples/19-render-json/main.py python/examples/19-render-json/sample-spec.json
```

The output is byte-identical to the TypeScript example. See the TypeScript
example's README for the spec shape.
