# 03 — Error, sensitivity, feedback

This is the conceptual bridge of the whole ecosystem.

> A system becomes controllable when output becomes error, error meets
> sensitivity, and feedback informs the next run.

## The loop

```
x → f(x) → ŷ → error → f′ → feedback
```

Made explicit, every stage is its own inspectable value:

```
Input x
  ↓
Transform f(x)
  ↓
Prediction ŷ
  ↓
Error E = y - ŷ
  ↓
Sensitivity f′(x)
  ↓
Update Signal = E · f′(x)
  ↓
Feedback Action
```

- **x** — the input.
- **f(x) = ŷ** — the prediction (forward pass).
- **error = y − ŷ** — the gap between target and prediction.
- **f′(x)** — the local sensitivity: how much the output moves when the input
  moves.
- **update signal = error · f′(x)** — error scaled by sensitivity.

### The sensitivity comes from the output

For sigmoid, the derivative has a clean identity in terms of the output itself:

```
ŷ = f(x)        ⇒        f′(x) = ŷ (1 − ŷ)
```

This is what `errorSensitivity` in `@composable-model-graph/math` uses
(`activation.derivativeFromOutput`): right after a forward pass you already
hold `ŷ`, so you can read the sensitivity straight off the trace without
recomputing the pre-activation.

## Why both terms matter

- **Error alone** tells you *that* something is wrong, but not *where* a change
  would help.
- **Sensitivity alone** tells you *where* change has leverage, but not *whether*
  anything is wrong.
- **error × sensitivity** combines them into a directed signal: change the
  things that are both wrong and influential.

## Worked values

Taking the prediction from [Example 02](../examples/02-neural-network-graph)
(`ŷ ≈ 0.492144`, a sigmoid output) with `target = 1`:

```
ŷ             = 0.492144
error E       = 1 − ŷ       ≈ 0.507856
f′            = ŷ (1 − ŷ)   ≈ 0.249938
update signal = E · f′       ≈ 0.126932
```

The update signal is largest when the prediction is both wrong *and* sits in a
sensitive region of the activation (near `ŷ = 0.5`), and it collapses to zero
when either the error is zero or the activation is saturated (`f′ → 0`).

## Not training (yet)

This loop does not update any weights. It only *exposes* the feedback signal.
Turning the signal into a weight update is backpropagation, which is out of
scope for v1.

## Example

See [Example 03 — Error Sensitivity Feedback](../examples/03-error-sensitivity-feedback),
which runs the neural graph, then prints the prediction, the target, the error
`E`, the sensitivity `f′`, and the `E · f′` update signal, before mapping the run
to a feedback action.
