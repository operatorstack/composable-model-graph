# Example 20 - Find where two runs diverge

**What this teaches:** run the *same* pipeline twice - once healthy, once with a
fault - and let CMG point at the **first stage where the two runs diverge**. The
printed diagram is the exact pipeline that produced the trace, so the picture
can never drift from the computation.

You do **not** need any robotics or sensor background. The story below is just a
small, concrete thing to break so the divergence is easy to see.

## The story

A depth sensor sits **1 meter above a flat floor**. It looks out in a grid of
directions and, for each one, measures how far away the floor is. Turn each
measurement back into a 3D point and - if everything is consistent - every point
should sit exactly on the floor, at height `z = 0`.

We run this twice:

- **Baseline:** every measurement is used consistently. All points land on the
  floor. Result: **pass**.
- **Faulted:** the two outermost columns report a distance that's slightly off
  (one 8% short, one 8% long). Those edge points now float a constant **8 cm**
  above / below the floor, while the whole interior stays flat. Result:
  **fail**.

CMG compares the two runs step by step and reports the first stage where they
part ways: the **ray-cast** (measurement) stage. Everything upstream - the scan
setup, the direction grid - is identical in both runs, so the fault is localized
without guessing.

The pipeline is printed by CMG's own renderer when you run the example. This is
the **exact** graph that produced the trace, copied verbatim from the output -
not a hand-drawn picture:

```text
CMG model - injected fault
┌───────┐
│ Input │
└───────┘
  ▼
┌────────────────────┐
│ Scan configuration │
└────────────────────┘
  ▼
┌──────────────────────┐
│ Ray angle generation │
└──────────────────────┘
  ▼
┌──────────┐
│ Ray cast │
└──────────┘
  ▼
┌─────────────────┐
│ Frame transform │
└─────────────────┘
  ▼
┌────────┐
│ Output │
└────────┘
  ▼
┌────────────┐
│ Evaluation │
└────────────┘
```

What each stage does, in plain terms:

| Stage | In plain terms |
|---|---|
| Scan configuration | grid size and sensor height |
| Ray angle generation | the directions the sensor looks |
| Ray cast | measure distance to the floor **← the fault enters here** |
| Frame transform | turn measurements into 3D points |
| Evaluation | how far is each point from `z = 0`? |

## Run it

```sh
# TypeScript
cd typescript
pnpm --filter @composable-model-graph/example-20-lidar-plane-residual start

# Python (identical output)
python3 python/examples/20-lidar-plane-residual/main.py
```

## What you'll see

A pass for the baseline (`max |z| = 0.000 m`), a fail for the fault
(`max |z| = 0.080 m`, left edge `+0.080`, right edge `-0.080`, interior flat),
and the line `first divergent step: 2 (ray-cast)` - CMG naming the exact stage
that broke.

## Why the numbers come out this way (optional)

You can skip this - the example stands without it - but the offset is not a
coincidence. For a sensor at height `h`, a downward ray hitting the floor has
true distance `r = -h / sin(elevation)`. If the returned distance is scaled by a
factor `s`, reconstructing the point gives:

```text
z = h + (s r) sin(elevation) = h(1 - s)
```

So the height error is `h(1 - s)` - a **constant** down an entire edge column and
**independent of the viewing angle**. With `h = 1 m` and scales `0.92 / 1.08`,
the two edges land at `+0.08 m` and `-0.08 m`. It also shows a left-right angle
error alone could not cause this: that angle never appears in the equation.

## The CMG features it demonstrates

- `createModelGraph` / `createTransform` - build a pipeline as inspectable stages.
- `compareRuns` - detect the first diverging step between two runs automatically.
- `createEvaluator` - a pass/fail verdict with evidence attached.
- `renderGraph` - print the executable model, so diagram and computation stay in
  lockstep.

Everything is deterministic: the same inputs always produce the output in
[`expected-output.txt`](expected-output.txt).
