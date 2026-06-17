# Example 11 - Transfer-function (ARX) system identification

The dynamical counterpart of example 10. It introduces the domain-free
`TransferFunction` primitive (a linear time-invariant filter `G(q) = B(q)/A(q)`, the
difference equation `y(t) = sum_j b_j u(t-j) - sum_i a_i y(t-i)`, run from rest) and
identifies one from input/output data.

```
y(t) = b0 u(t) + b1 u(t-1) + ...  -  a1 y(t-1) - a2 y(t-2) - ...
```

**Why no training loop.** This is the linear slice of "Deep learning with transfer
functions" (Piga, Forgione & Mejari, 2021). That paper makes the transfer function
differentiable so it can be trained jointly with neural nonlinearities by
back-propagation. For the *linear* system the coefficients `a, b` enter the
one-step-ahead model linearly, so they are recovered by **ordinary least squares**
(the classic Ljung method): convex, closed-form, deterministic, no autodiff, no
optimizer. `TransferFunction` is just the forward filter; the fit is plain linear
algebra in the example.

## Run

```sh
pnpm --filter @composable-model-graph/example-11-transfer-function-id start
```

## What it shows

A true second-order system is excited with a multisine; the example recovers its
`b` and `a` coefficients exactly by least squares and simulates the identified filter
on fresh input, scoring `fit = 100%` (RMSE at machine precision). The script
self-verifies (`PASS`/`FAIL`); `expected-output.txt` is the captured run.

The nonlinear, gradient-trained, block-oriented version (transfer functions composed
with neural nonlinearities, trained by back-propagation) is a job for an autodiff
framework such as the paper's PyTorch code; cmg covers the linear-dynamic and
local-linear/LPV slice and the inspection on top.
