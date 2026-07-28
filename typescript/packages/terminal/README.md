# @composable-model-graph/terminal

Dependency-free terminal projections of the graph that CMG executes and the
trace it produces.

```ts
console.log(renderGraph(graph));
console.log(renderRun(graph, await graph.run({})));
console.log(renderComparison(a, b));
console.log(renderDecodedPath(path));
console.log(renderSensitivity(ranking));
console.log(renderUsefulFlow(score));
```

Lifecycle rendering connects Input, transforms/DAG, Output, evaluation, and
feedback. The functions return deterministic plain text and never write to
stdout. The package depends only on core; analysis results are accepted by
their public structural shapes.

Explicit connections remain authoritative. When they form one complete linear
path, the renderer orders nodes from those edges and uses the compact chain
layout; non-linear shapes retain the DAG layout.
