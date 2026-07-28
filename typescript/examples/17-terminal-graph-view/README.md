# Example 17: Terminal graph view

The terminal package derives executable structure from the `ModelGraph` and
produced fields from its completed trace. This example uses a generic
request-processing pipeline and prints sequential, state-projection,
evaluation, feedback, branching, graph-comparison, decoded-path, sensitivity,
and useful-flow models in one execution.

```sh
pnpm --filter @composable-model-graph/example-17-terminal-graph-view start
python3 python/examples/17-terminal-graph-view/main.py
```

Both commands produce byte-identical output.
