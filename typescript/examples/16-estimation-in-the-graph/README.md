# 16 - Estimation inside an inspectable graph

A noisy track passes through a complete CMG lifecycle:

```
readings -> build trellis -> decode path -> summarize
                              |
                         pathScore signal
                              |
                  evaluate -> feedback -> compare
```

Two configurations run the same graph shape. Graph A uses
`transitionWeight = 0` and follows each reading independently, including a
spike. Graph B uses `transitionWeight = 1` and selects the coherent path.

The final path is checked against ground truth with `exactMatchEvaluator`.
`defaultFeedbackResolver` turns failure into `retry` and success into `accept`.
`compareRuns` then reports the winning configuration, evaluation-score delta,
`pathScore` signal delta, and the first trace step where the runs differ.

This is the composition proof for the library's packages: `core` provides the
inspectable graph and run comparison, `estimation` decodes the sequence,
`evaluators` measures the result, and `feedback` makes the result actionable.
The estimator remains independent of `core`; composition happens at the use
case boundary.

## Run

```bash
# TypeScript
pnpm --filter @composable-model-graph/example-16-estimation-in-the-graph start
# Python (byte-identical output)
python3 python/examples/16-estimation-in-the-graph/main.py
```

Captured output: [`expected-output.txt`](expected-output.txt) (shared by both
languages).
