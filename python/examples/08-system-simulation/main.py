#!/usr/bin/env python3
"""
Example 08 - System simulation (configuration what-if + sensitivity). Python parity
of typescript/examples/08-system-simulation; same model, same output shape.

Simulate one parameterized pipeline across configurations, score each by useful flow
(Phi = quality / cost), pick the best, then ask which knob most moves the outcome
(sensitivity). Uses only core + math.

Run (no install needed):
    python3 python/examples/08-system-simulation/main.py
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "src"))

from composable_model_graph import (  # noqa: E402
    create_model_graph,
    create_transform,
    rank_sensitivity,
    sigmoid,
    useful_flow_score,
)

Knobs = dict  # {"effort": float, "parallelism": float, "verifyDepth": float}


# The model, as pure functions shared by the graph and the sensitivity objective.
def raw_quality_of(k: Knobs) -> float:
    return k.get("effort", 0.0) - 3 + 0.2 * k.get("verifyDepth", 0.0)


def cost_of(k: Knobs) -> float:
    return 1 + 0.5 * k.get("effort", 0.0) + 0.3 * k.get("parallelism", 0.0)


# The pipeline as a graph: each stage records its slice of cost; the last stage
# emits the raw (pre-sigmoid) quality, so the run is inspectable.
def _ingest(k, ctx):
    ctx.record_signal("cost", 1)
    return k


def _process(k, ctx):
    ctx.record_signal("cost", 0.5 * k.get("effort", 0.0))
    return k


def _verify(k, ctx):
    ctx.record_signal("cost", 0.3 * k.get("parallelism", 0.0))
    return raw_quality_of(k)


pipeline = create_model_graph(
    "system-simulation",
    "System Simulation",
    [
        create_transform("ingest", "Ingest", _ingest),
        create_transform("process", "Process", _process),
        create_transform("verify", "Verify", _verify),
    ],
)


def run_config(k: Knobs):
    run = pipeline.run(k)
    cost = sum(float(step.metadata.get("cost", 0.0)) for step in run.trace)
    quality = sigmoid.forward(run.output)
    score = useful_flow_score(quality, cost).score
    return {"phi": score, "quality": quality, "cost": cost}


def phi_of(k: Knobs) -> float:
    return useful_flow_score(sigmoid.forward(raw_quality_of(k)), cost_of(k)).score


def main() -> None:
    # 1. SWEEP
    print("1. SWEEP  -  Phi = quality / cost across effort (best earns its cost)")
    fixed = {"parallelism": 4, "verifyDepth": 1}
    best = {"effort": 0, "phi": float("-inf")}
    for effort in range(1, 7):
        r = run_config({"effort": effort, **fixed})
        print(f"   effort {effort}: quality {r['quality']:.3f}  cost {r['cost']:.2f}  Phi {r['phi']:.3f}")
        if r["phi"] > best["phi"]:
            best = {"effort": effort, "phi": r["phi"]}
    print(f"   best: effort {best['effort']} (Phi {best['phi']:.3f}). Beyond it, cost outruns quality.\n")

    # 2. SENSITIVITY
    current = {"effort": 2, "parallelism": 4, "verifyDepth": 1}
    print("2. SENSITIVITY  -  d(Phi)/d(knob) at the current config (what to tune next)")
    ranked = rank_sensitivity(current, phi_of)
    for r in ranked:
        direction = "raise" if r.gradient >= 0 else "lower"
        print(f"   {r.name.ljust(12)} gradient {r.gradient:.4f}  -> {direction} it")
    top = ranked[0].name if ranked else "n/a"
    print(f"   tune first: {top} (largest magnitude).\n")

    # 3. SELF-CHECK
    graph_phi = run_config(current)["phi"]
    checks = [
        ("sweep picks effort 5", best["effort"] == 5),
        ("sensitivity ranks effort first", bool(ranked) and ranked[0].name == "effort"),
        ("graph Phi agrees with model Phi", abs(graph_phi - phi_of(current)) < 1e-9),
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
