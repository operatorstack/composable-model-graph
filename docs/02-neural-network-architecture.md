# 02 — Neural-network architecture

The `@composable-model-graph/math` package is the first mathematical proof of
the primitive. A neural-network forward pass is expressed entirely as core
transforms, then wired through error-based evaluation and feedback.

## The neural graph

```
Input x
  ↓
DenseLayer
  ↓
Sigmoid
  ↓
Hidden State
  ↓
DenseLayer
  ↓
Sigmoid
  ↓
Prediction ŷ
  ↓
Loss / Error
  ↓
Feedback
```

A `DenseLayer` *is* a `Transform<number[], number[]>`, so the network is just a
linear model graph. The hidden state between layers is a normal trace step — it
is recorded and inspectable like any other.

## Equations

```
f(x)  = 1 / (1 + e^-x)
f'(x) = f(x) (1 - f(x))
E     = y - ŷ
update signal ∝ E · f'(x)
```

### DenseLayer

```
output[j] = activation( Σ_i ( input[i] · weights[i][j] ) + bias[j] )
```

### Mean squared error

```
E       = (1/n) Σ ( ŷ_i - y_i )²
dE/dŷ_i = (2/n) ( ŷ_i - y_i )
```

## Interpretation

- **error** = what went wrong.
- **sensitivity** = where change matters (the derivative).
- **feedback** = what to adjust next.

## What is implemented

- Forward pass (`DenseLayer.run`).
- Derivative utilities on every `ActivationFunction`.
- Loss / error computation (`meanSquaredError.compute` and `.derivative`).
- Graph trace of the forward pass.

## What is intentionally not implemented

- No full backpropagation yet.
- No weight updates / training loop yet.

The proof here is the chain, not the optimizer:

```
input vector → neural transforms → prediction → error → sensitivity → feedback
```

## Example

See [Example 02 — Neural Network Graph](../examples/02-neural-network-graph):

```
[1, 2, 4, 5]
  → DenseLayer(4 → 2) + sigmoid
  → DenseLayer(2 → 1) + sigmoid
  → prediction
  → MSE / error
  → feedback
```
