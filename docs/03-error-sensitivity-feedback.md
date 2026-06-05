# 03 — Error, sensitivity, feedback

This is the conceptual bridge of the whole ecosystem.

> A system becomes controllable when output becomes error, error meets
> sensitivity, and feedback informs the next run.

## The loop

```
x → f(x) → ŷ → error → f′ → feedback
```

- **x** — the input.
- **f(x) = ŷ** — the prediction (forward pass).
- **error = y − ŷ** — the gap between target and prediction.
- **f′(x)** — the local sensitivity: how much the output moves when the input
  moves.
- **update signal = error · f′(x)** — error scaled by sensitivity.

## Why both terms matter

- **Error alone** tells you *that* something is wrong, but not *where* a change
  would help.
- **Sensitivity alone** tells you *where* change has leverage, but not *whether*
  anything is wrong.
- **error × sensitivity** combines them into a directed signal: change the
  things that are both wrong and influential.

## Worked values

Using the logistic sigmoid with `x = 2`, `target = 1`:

```
ŷ            = f(2)        ≈ 0.880797
error        = 1 − ŷ       ≈ 0.119203
f′(2)        = ŷ (1 − ŷ)   ≈ 0.104994
update signal = error · f′(2) ≈ 0.012516
```

## Not training (yet)

This loop does not update any weights. It only *exposes* the feedback signal.
Turning the signal into a weight update is backpropagation, which is out of
scope for v1.

## Example

See [Example 03 — Error Sensitivity Feedback](../examples/03-error-sensitivity-feedback),
which prints `x`, `f(x)`, the target, the error, the derivative, and the
`error · f′(x)` update signal.
