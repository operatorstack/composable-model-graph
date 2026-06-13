# Example 08: System simulation (Python)

Python parity of `typescript/examples/08-system-simulation`. Same model, same output.

Simulate one parameterized pipeline across configurations, score each by useful flow
(Phi = quality / cost), pick the best, then rank knobs by sensitivity (what to tune
next). Uses only `core` + `math`.

## Run

```sh
python3 python/examples/08-system-simulation/main.py
```

No install needed (the core is dependency-free).

## What it demonstrates

- `useful_flow_score` (core): Phi = Q / C, the useful-flow-per-cost score (network
  flow / OR). Quality is bounded with `sigmoid`; cost is summed from the run's
  recorded `cost` signals.
- a sweep over `effort`: Phi peaks at a finite effort because quality has
  diminishing returns while cost grows linearly.
- `rank_sensitivity` (math): d(Phi)/d(knob) at the current config, ranked by
  magnitude; the front of the list is what to tune next.

See `../../../docs/05-useful-flow-and-sensitivity.md` for the math and principle.
