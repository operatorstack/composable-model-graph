# 13 — Track snapping (tracking / signal processing)

A noisy 1-D sensor track is snapped to a discrete grid of levels. Each step,
every level is a candidate scored by closeness to the reading
(`score = -(reading - level)^2`); the transition cost is `(levelDelta)^2`.

- **weight 0** copies the sensor and follows the step-3 spike up to level 5.
- **weight 1** damps the spike (the round-trip cost outweighs the emission gain).
- **fixed-lag 0** is a causal filter (commits from the past alone); **fixed-lag 2**
  matches the full decode.

## Run

```bash
pnpm --filter @composable-model-graph/example-13-track-snapping start   # TypeScript
python3 python/examples/13-track-snapping/main.py                        # Python (byte-identical)
```

Output: [`expected-output.txt`](expected-output.txt).
