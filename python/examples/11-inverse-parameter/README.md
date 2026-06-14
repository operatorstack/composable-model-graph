# Example 11: Recover a hidden parameter (the inverse problem, no neural net)

## The problem

You have a physical system governed by an equation, you can measure it (noisily), but one
constant inside the equation is unknown. Recover it from the data. That is an **inverse
problem**. The SciML version people post about is the **inverse PINN**: a neural network
solves the PDE *and* learns the unknown constant at the same time, via automatic
differentiation.

This example does the part that actually matters here, recovering the unknown constant, with
**no neural network and no autodiff**. For a single scalar unknown that is not just enough,
it is the right tool.

## The physics

1D steady heat conduction in a rod:

```
k * T''(x) + q = 0,   T(0) = T0,   T(L) = TL
```

`k` is the thermal conductivity (the unknown), `q` a constant heat source. With both ends
held at 0 the equation has a closed-form solution, so there is no solver to write:

```
T(x; k) = (q / 2k) * x * (L - x)
```

We pick a true `k = 2.0`, sample `T(x; 2.0)` at 21 points, and add a little deterministic
noise. That noisy curve is our "measurements". Now pretend we do not know `k`.

## How we recover k

Three pieces, all small:

1. **A forward model** `forward(k)` -> the predicted temperatures. (The closed form above.)
2. **A loss** `loss(k)` = mean squared error between the model and the noisy data. It is 0
   when the model matches the data, and grows as `k` drifts from the truth.
3. **A gradient + a step.** We ask cmg's `sensitivity(loss, k)` for `dLoss/dk` (a
   finite-difference gradient: it nudges `k` a hair, sees how the loss moves), then take a
   gradient-descent step `k <- k - lr * dLoss/dk`. Repeat. The loss pulls `k` toward the
   value that best explains the data.

Why finite difference and not autodiff: there is exactly **one** unknown. A finite-difference
gradient is two forward evaluations. Autodiff is what you reach for when you are fitting
thousands of neural-network weights; here it would be a sledgehammer.

`k` converges from a guess of 1.0 back to ~2.0:

```
step   1: k 1.7603  loss 0.002324  grad -0.5068
step   5: k 1.8610  loss 0.000711  grad -0.0125
step  10: k 1.9219  loss 0.000231  grad -0.0060
step  20: k 1.9709  loss 0.000063  grad -0.0018
step  40: k 1.9925  loss 0.000043  grad -0.0002
recovered k = 1.9953   (true 2.0, error 0.0047)
```

## What cmg contributed

- **`sensitivity`** (the gradient lane): cmg already computes `dLoss/dk` numerically, which
  is the whole engine of the recovery.
- **An inspectable run**: one evaluation is a cmg `ModelGraph` (`forward -> residual -> loss`)
  that records `k`, the max residual, and the loss as trace signals, so every step is
  something you can look at, not a black box.

## Honest scope (so this is a fair thing to share)

This is **not** a neural PINN, and it is not a replacement for one. The two solve different
shapes of problem:

- **PINNs earn their keep** when you do *not* have a forward model: complex or irregular
  geometry, mesh-free settings, high-dimensional fields, or when the solution itself must be
  learned. The network *is* the solver.
- **This simple recovery wins** when you *do* have a forward model (closed form or a cheap
  numerical solver) and only a few unknown parameters. Then the inverse problem collapses to
  a forward model + a gradient + a loop, fully inspectable, with nothing to train.

So the contribution to share is narrow and true: the *parameter-recovery half* of an inverse
PINN does not need a network when a forward model exists.

## A note on primitives

The recover loop (gradient + step, repeated) is written here in the example, not in cmg core.
cmg has the gradient (`sensitivity`) but no "fit / recover" loop primitive yet, and its
`feedback` package maps an evaluation to an action (accept / retry / adjust), not a gradient
step. If this loop shows up in a second example, it is a candidate to pull into the library
(a recover/fit helper, or a gradient-step feedback resolver). Until then it stays in the
example, by design.

## Run

```sh
python3 python/examples/11-inverse-parameter/main.py
```

No dependencies beyond the cmg package, no keys, no network. It prints the recovery
trajectory, the fit quality, one traced evaluation, and a PASS/FAIL self-check.
