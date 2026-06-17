# Example 10 - Superposition + modulation

A linear backbone plus an input-gated correction, which is the smallest honest
model of a signal that is part **superposition** (structures add linearly) and part
**modulation** (one structure sets the amplitude of another, a nonlinear interaction).

```
y(x) = sum_i  phi_i(x) * ( a_i . x + b_i )
       \____/   \_______________________/
     modulation        superposition
```

The affine local models `a_i.x + b_i` are the superposition; the membership
`phi_i(x)` that re-weights them by where you are is the modulation. Each local model
is a cmg `DenseLayer` with the `identity` activation; the example fits the weights by
weighted least squares and gates them with normalized Gaussian memberships.

**Motivation (fluid mechanics).** Predicting near-wall velocity fluctuations `u'`
from wall data: turbulence is a linear superposition of large-scale structure plus a
nonlinear modulation of the small scales by the large ones. A purely linear estimator
(Linear Stochastic Estimation) recovers the superposition and misses the modulation.
The better turbulence-ML models do not replace the linear estimator, they add a
learned correction. That correction is this blend. The shape is domain-free: a
gray-box correction to any linear backbone.

## Run

```sh
pnpm --filter @composable-model-graph/example-10-superposition-modulation start
```

## What it shows

On deterministic synthetic data `u' = A*g + B*g*h` (superposition `A*g` + modulation
`B*g*h`):

- the **linear (LSE)** model recovers the superposition slope (`g ~= A`) but is blind
  to the modulation (`h`-slope `~= 0`), leaving the modulation as residual (RMSE 0.40);
- the **blend** drives RMSE to 0.09 and, crucially, is readable: each region's
  small-scale (`h`) slope tracks the local large scale (`B*g`), so the modulation is
  recovered as an explicit, inspectable quantity rather than hidden in a black box.

The script self-verifies (`PASS`/`FAIL`); `expected-output.txt` is the captured run.
