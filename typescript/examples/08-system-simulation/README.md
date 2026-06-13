# Example 08: System simulation (configuration what-if + sensitivity)

Simulate one parameterized pipeline across configurations, score each by **useful
flow** (Phi = quality / cost), pick the best, then ask which knob most moves the
outcome (**sensitivity**). Domain-free: the same shape fits a build farm, a data
pipeline, or a research loop.

## Run

```sh
pnpm --filter @composable-model-graph/example-08-system-simulation start
```

## What it demonstrates

- **`usefulFlowScore` (core)** - Phi = Q / C, the useful-flow-to-an-accepted-sink
  score (network flow / OR). Quality is bounded with `sigmoid` (`math`); cost is
  summed from the run's recorded `cost` signals.
- **A sweep** - run the graph under a range of `effort` values; because quality has
  diminishing returns and cost grows linearly, Phi peaks at a finite effort. The
  best config is the one that earns its cost, not the one with the highest quality.
- **`rankSensitivity` (math)** - the finite-difference gradient d(Phi)/d(knob) at
  the current config, ranking knobs by magnitude. The front of the list is "what to
  tune next"; the sign says which way. Here `effort` dominates, `parallelism` only
  adds cost (negative), `verifyDepth` helps a little.
- **The graph is real** - each stage records its slice of cost via
  `RunContext.recordSignal`, so the trace is inspectable; the self-check confirms
  the Phi computed from the trace matches the pure model.

## Parity

This example uses only `core` + `math`, so the Python version in
`python/examples/08-system-simulation/` is identical in shape and output.

## Honest limit

The cost/quality model here is a toy chosen to have the right shape (diminishing
quality, linear cost, a finite Phi peak). The primitives (`usefulFlowScore`,
`sensitivity`, `rankSensitivity`) are real; the numbers are illustrative. Swap in
your own model and the same three readouts apply.
