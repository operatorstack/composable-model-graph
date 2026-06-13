# 05 - Useful flow and sensitivity

Two scoring primitives for simulating and tuning a system: **useful flow** (how much
a configuration earns its cost) and **sensitivity** (which knob to turn next). Both
are deliberately small, and both name a principle that a mathematician, an engineer,
and a computer scientist already recognize under different words. Theory in the
bones; the API is two functions.

## Useful flow: Phi = Q / C

Picture a run as flow from a source (the task) to an accepted sink (a verified
result). Some of the budget you spend becomes useful output; the rest is cost
(tokens, time, money, retries). The **useful-flow score** is the quality that
reaches the sink per unit of cost:

```
Phi = Q / C
```

- **Q** aggregates quality terms (correctness, completeness, confidence, ...).
- **C** aggregates cost terms (tokens, latency, money, retries, ...).
- `combineCost` / `combineQuality` are weighted sums, so you choose what counts.

Why this one quantity. It is the same number three fields already track:

| field | name for Phi |
|---|---|
| engineering | useful output per dollar / per watt |
| operations research | throughput per unit capacity |
| network flow | useful flow to the sink, capped by the bottleneck (min-cut) |

Comparing Phi across configurations is the cheapest honest way to ask "which one
earns its cost?" A higher-quality config that costs disproportionately more has a
*lower* Phi. In the example, quality has diminishing returns (a sigmoid) while cost
grows linearly, so Phi peaks at a finite effort: past the peak you are paying for
quality you cannot afford.

API: `usefulFlowScore(quality, cost)` (TS) / `useful_flow_score(quality, cost)`
(Python), in `core`.

## Sensitivity: df / dx

Once you can score a configuration, the next question is what to change. The
**sensitivity** of an objective `f` to a knob `x` is its derivative `df/dx`: the
local slope, how much the outcome moves per unit change in the knob. When `f` is a
black box (you can run it but not differentiate it), use the central
finite-difference estimate:

```
df/dx  ~=  ( f(x + h) - f(x - h) ) / (2h)
```

Again, one idea under three names:

| field | name for df/dx |
|---|---|
| calculus | the derivative / local slope |
| machine learning | the gradient a network follows downhill |
| control theory | plant sensitivity: which input binds the response |

`rankSensitivity` perturbs each knob in turn and sorts by `|df/dx|`. The front of the
list is "what to tune next"; the sign says which way. This is the same shape as
[`03-error-sensitivity-feedback.md`](03-error-sensitivity-feedback.md), which reads
the slope *analytically* from an activation's output (`errorSensitivity`); this reads
it *numerically* from any objective, including one computed by running a graph.

API: `sensitivity(objective, x)` and `rankSensitivity(knobs, objective)` (TS) /
`sensitivity` and `rank_sensitivity` (Python), in `math`.

## Together: simulate, then tune

The two compose into a simulation: sweep configurations and score each by Phi to
find the one that earns its cost, then read the sensitivity at your current config to
know which knob moves Phi most. Example 08 (`08-system-simulation`, in both
languages) runs exactly this loop on a domain-free pipeline, with the cost recorded
on the trace so the result stays inspectable.
