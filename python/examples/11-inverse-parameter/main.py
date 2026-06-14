#!/usr/bin/env python3
"""
Example 11 - Recover a hidden parameter (the inverse problem, no neural net)

A SciML "inverse PINN" recovers an unknown physical constant inside a PDE while a neural
network also solves the PDE, via automatic differentiation. The interesting half is the
recovery: given noisy measurements and the governing equation, find the hidden parameter.
That half needs no network and no autodiff. For a single unknown, a finite-difference
gradient (cmg `sensitivity`) plus a feedback update is enough, and every step is inspectable.

Problem: 1D steady heat conduction   k * T''(x) + q = 0,   T(0)=T0, T(L)=TL.
With T0 = TL = 0 the solution is closed-form:   T(x; k) = (q / (2k)) * x * (L - x).
We sample T at the true k = 2.0, add deterministic noise, then recover k from the noisy
data using cmg `sensitivity` (dLoss/dk) + gradient descent. k converges back to ~2.0.

This is NOT a neural PINN (no network, no autodiff). It is the inverse-problem core: a
forward model + one scalar unknown. See the README for when each approach is the right one.

Run:
    python3 python/examples/11-inverse-parameter/main.py
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "src"))

from composable_model_graph import (  # noqa: E402
    create_model_graph,
    create_transform,
    sensitivity,
)

# ----- the physics: a closed-form forward model ------------------------------
L, T0, TL, Q = 1.0, 0.0, 0.0, 8.0   # rod length, both ends held at 0, constant source
K_TRUE = 2.0                        # the parameter we will pretend not to know
N = 21                              # measurement points
XS = [i / (N - 1) for i in range(N)]


def forward(k):
    "T(x; k) for k*T'' + q = 0 with T0=TL=0:  (q / 2k) * x * (L - x)."
    return [(Q / (2.0 * k)) * x * (L - x) for x in XS]


# ----- deterministic noise (an LCG, identical in TS and Python -> reproducible) ----
def _noise(n, amp=0.01, seed=12345):
    out, s = [], seed
    for _ in range(n):
        s = (1664525 * s + 1013904223) % (1 << 32)
        out.append((s / (1 << 32) - 0.5) * 2.0 * amp)
    return out


DATA = [t + e for t, e in zip(forward(K_TRUE), _noise(N))]


def loss(k):
    "mean squared error between the model at k and the noisy data."
    return sum((m - d) ** 2 for m, d in zip(forward(k), DATA)) / N


def signed(x):
    return ("+" if x >= 0 else "-") + f"{abs(x):.4f}"


# ----- recover k: cmg sensitivity (the gradient) + gradient descent (the loop) -----
def recover(k0=1.0, lr=1.5, steps=60):
    k, hist = k0, []
    for step in range(1, steps + 1):
        grad = sensitivity(loss, k, step=1e-4).gradient   # dLoss/dk, finite-difference (cmg)
        k = k - lr * grad
        hist.append({"step": step, "k": k, "loss": loss(k), "grad": grad})
    return k, hist


# ----- one inspectable evaluation as a cmg ModelGraph (forward -> residual -> loss) -----
def evaluate_graph(k):
    def fwd(_, ctx):
        ctx.record_signal("k", k)
        return {"T": forward(k)}

    def resid(d, ctx):
        r = [m - dat for m, dat in zip(d["T"], DATA)]
        ctx.record_signal("max_resid", max(abs(x) for x in r))
        d["r"] = r
        return d

    def lz(d, ctx):
        value = sum(x * x for x in d["r"]) / N
        ctx.record_signal("loss", value)
        d["loss"] = value
        return d

    g = create_model_graph("evaluate", "Evaluate fit", [
        create_transform("forward", "Forward T(x;k)", fwd),
        create_transform("residual", "Residual", resid),
        create_transform("loss", "Loss (MSE)", lz),
    ])
    return g.run({})


def main():
    print("Recover a hidden parameter (inverse problem, no neural net)")
    print(f"governing eq: k*T'' + q = 0   q={Q}  L={L}  T0={T0} TL={TL}   true k = {K_TRUE}")
    print(f"data: {N} noisy samples of T(x; {K_TRUE})")
    print()

    print("1. RECOVER  -  k via cmg sensitivity (dLoss/dk) + gradient descent")
    k_final, hist = recover()
    marks = {1, 5, 10, 20, 40, len(hist)}
    for h in hist:
        if h["step"] in marks:
            print(f"   step {h['step']:3d}: k {h['k']:.4f}  loss {h['loss']:.6f}  grad {signed(h['grad'])}")
    print(f"   recovered k = {k_final:.4f}   (true {K_TRUE}, error {abs(k_final - K_TRUE):.4f})")
    print()

    print("2. FIT  -  the recovered model vs the noisy data")
    fit = forward(k_final)
    max_err = max(abs(m - d) for m, d in zip(fit, DATA))
    print(f"   max |model - data| = {max_err:.4f}  (noise amplitude was 0.0100)")
    print()

    print("3. EVALUATE  -  one fit as a cmg ModelGraph (forward -> residual -> loss)")
    run = evaluate_graph(k_final)
    for step in run.trace:
        sigs = "  ".join(f"{k}={v:.6f}" for k, v in step.metadata.items())
        print(f"   {step.transform_name:18s} {sigs}")
    print()

    print("4. SELF-CHECK")
    checks = [
        ("recovered k within 0.05 of true 2.0", abs(k_final - K_TRUE) < 0.05),
        ("loss decreased from the initial guess", hist[-1]["loss"] < loss(1.0)),
        ("fit within ~2x the noise amplitude", max_err < 0.03),
    ]
    ok = True
    for label, passed in checks:
        print(f"   {'ok  ' if passed else 'FAIL'} {label}")
        ok = ok and passed
    print("\nPASS" if ok else "\nFAIL")
    if not ok:
        sys.exit(1)


if __name__ == "__main__":
    main()
