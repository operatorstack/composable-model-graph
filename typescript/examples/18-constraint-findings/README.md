# 18 - Constraint findings

A release manifest is checked for resolvable artifact references, supported API
levels, and dependency reachability.

The constraints return the same lossless report in every context. Two
application-owned interpretations demonstrate the package boundary: drafting
continues with warnings, while publication blocks. Neither interpretation is
owned by the constraints package.

Run:

```sh
cd typescript
pnpm --filter @composable-model-graph/example-18-constraint-findings start
```

The Python parity example is
`python/examples/18-constraint-findings/main.py`.
