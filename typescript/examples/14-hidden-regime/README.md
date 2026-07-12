# 14 — Hidden regime (a hidden-state sequence)

A machine's hidden regime (idle / normal / overload) is inferred from a coarse
sensor symbol each tick. Candidates are the three regimes, scored by how well
they explain the symbol; the transition cost penalizes changing regime.

The Viterbi / HMM story without any probability prerequisite: a lone spurious
`mid` reading inside an overload run does **not** flip the inferred regime under
`weight 1` (the round trip is too expensive), but `weight 0` reads it per-symbol
and flips to `normal`.

## Run

```bash
pnpm --filter @composable-model-graph/example-14-hidden-regime start   # TypeScript
python3 python/examples/14-hidden-regime/main.py                        # Python (byte-identical)
```

Output: [`expected-output.txt`](expected-output.txt).
