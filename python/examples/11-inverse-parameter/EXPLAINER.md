# Recover a Hidden Parameter with a Forward Model, Loss, and Sensitivity

> Companion explainer for **Example 11** ([README.md](./README.md) · [main.py](./main.py)).
> The README is the short version; this is the full walkthrough of the math and the why.

## What this example shows

This example shows how to recover an unknown physical parameter from noisy measurements using a small, inspectable loop:

```text
forward model -> residual -> loss -> sensitivity -> update
```

The point is not to claim this replaces PINNs, SciML, autodiff, or neural solvers.

The point is narrower:

If a forward model already exists and the unknown is small, the inverse problem can sometimes be solved with a much simpler, fully inspectable method.

In this example, the unknown parameter is the thermal conductivity of a rod.

---

## 1. The physical system

We start with steady 1D heat conduction in a rod:

```math
kT''(x) + q = 0
```

Where:

```math
k = \text{thermal conductivity}
```

```math
q = \text{constant heat source}
```

```math
T(x) = \text{temperature along the rod}
```

The unknown is:

```math
k
```

We pretend we do not know `k`, but we can measure the temperature along the rod.

With both ends held at zero temperature:

```math
T(0)=0,\quad T(L)=0
```

the closed-form solution is:

```math
T(x;k)=\frac{q}{2k}x(L-x)
```

This is the forward model.

Meaning:

```math
k \mapsto T(x;k)
```

Give the model a possible `k`, and it predicts what the temperature curve should look like.

---

## 2. The inverse problem

The forward problem is:

```math
k \rightarrow T(x)
```

The inverse problem is:

```math
T(x) \rightarrow k
```

We have noisy measurements:

```math
T_{\text{data}}(x_i)
```

We want to find the value of `k` that makes the model match the data:

```math
T(x_i;k) \approx T_{\text{data}}(x_i)
```

So we define a loss function:

```math
L(k)=\frac{1}{N}\sum_{i=1}^{N}\left(T(x_i;k)-T_{\text{data}}(x_i)\right)^2
```

This is mean squared error.

Low loss means:

```text
this k explains the measurements well
```

High loss means:

```text
this k produces the wrong temperature curve
```

So the inverse problem becomes an optimization problem:

```math
k^* = \arg\min_k L(k)
```

Find the value of `k` that minimizes the loss.

---

## 3. Why sensitivity enters

Now we need to know how to move `k`.

Start with a guess:

```math
k_0 = 1.0
```

The true value in the synthetic example is:

```math
k_{\text{true}} = 2.0
```

But the recovery loop does not know that.

It asks:

```math
\frac{dL}{dk}
```

This derivative tells us:

```text
if I increase k, does the loss go up or down?
```

If:

```math
\frac{dL}{dk} < 0
```

then increasing `k` lowers the loss.

If:

```math
\frac{dL}{dk} > 0
```

then increasing `k` raises the loss, so we should decrease `k`.

Because this example does not use autodiff, we estimate the derivative numerically:

```math
\frac{dL}{dk} \approx \frac{L(k+h)-L(k-h)}{2h}
```

That is finite-difference sensitivity.

We nudge `k` slightly up, nudge it slightly down, observe how the loss changes, and estimate the local slope.

---

## 4. The update loop

Once we have the slope, we can use gradient descent:

```math
k_{t+1}=k_t-\eta\frac{dL}{dk}
```

Where:

```math
\eta = \text{learning rate}
```

Example:

```math
k_0 = 1.0
```

```math
\frac{dL}{dk}=-0.5068
```

```math
\eta = 1.5
```

Then:

```math
k_1 = 1.0 - 1.5(-0.5068)
```

So:

```math
k_1 \approx 1.76
```

In one step, the estimate moves closer to the true value.

Then the loop repeats:

```text
k -> forward model -> loss -> sensitivity -> update
```

Eventually the recovered parameter converges near the true value:

```math
k \rightarrow 1.9953
```

The true value was:

```math
k_{\text{true}}=2.0
```

---

## 5. Why no neural network is needed here

A PINN becomes useful when the network is doing real work.

For example:

```text
complex geometry
unknown field
hard PDE solve
high-dimensional solution
mesh-free approximation
```

In those cases, the neural network can help approximate the solution itself.

But in this example, the solution is already known:

```math
T(x;k)=\frac{q}{2k}x(L-x)
```

So the network would be unnecessary.

There is only one scalar unknown:

```math
k
```

So the right tool is simpler:

```text
forward model + loss + finite-difference gradient + update
```

That is enough.

This is not a replacement for PINNs.

It is the parameter-recovery half of an inverse problem in the case where a forward model already exists.

---

## 6. What `composable-model-graph` contributes

The library is not solving the physics by magic.

It makes the recovery loop inspectable.

One evaluation can be represented as:

```math
k \rightarrow T(x;k) \rightarrow r(x) \rightarrow L(k)
```

Where the residual is:

```math
r_i = T(x_i;k)-T_{\text{data}}(x_i)
```

Graph shape:

```text
forward(k)
  ↓
residual(model, data)
  ↓
loss(residual)
```

Then `sensitivity(loss, k)` wraps around that graph and asks:

```text
what happens to the graph output if I nudge k?
```

That is the important part.

The graph gives a visible system.

Finite-difference sensitivity gives the local direction.

The update loop moves the hidden parameter.

---

## 7. The deeper framework connection

This is the same structure that appears in other systems.

For AI agents:

```math
x = \text{knob}
```

```math
\Phi(x)=\frac{Q(x)}{C(x)}
```

Then:

```math
\frac{d\Phi}{dx}
```

asks:

```text
which knob improves useful flow?
```

For this physics example:

```math
x = k
```

```math
f(x)=L(k)
```

Then:

```math
\frac{dL}{dk}
```

asks:

```text
which direction moves the physical parameter toward the data?
```

Same primitive.

Different domain.

---

## 8. The full equation stack

Forward model:

```math
T(x;k)=\frac{q}{2k}x(L-x)
```

Measurements:

```math
T_{\text{data}}(x_i)=T(x_i;k_{\text{true}})+\epsilon_i
```

Loss:

```math
L(k)=\frac{1}{N}\sum_i(T(x_i;k)-T_{\text{data}}(x_i))^2
```

Finite-difference sensitivity:

```math
\frac{dL}{dk} \approx \frac{L(k+h)-L(k-h)}{2h}
```

Update:

```math
k_{t+1}=k_t-\eta\frac{dL}{dk}
```

Convergence:

```math
k_t \rightarrow k_{\text{true}}
```

---

## 9. The narrow claim

The claim is not:

```text
this replaces PINNs
```

The claim is:

```text
when a forward model exists and the unknown parameter space is small, the inverse problem can collapse into a simple inspectable loop
```

That loop is:

```text
forward model -> residual -> loss -> sensitivity -> update
```

The useful part is that every step can be inspected.

No hidden training loop.

No neural network unless the problem shape actually needs one.

No autodiff when two forward evaluations are enough.

---

## 10. Why this matters

This example is small, but it shows a general pattern:

```text
define the system
define the measurable error
nudge the unknown
observe the change
move in the direction that reduces error
repeat
```

That pattern shows up in physical parameter recovery, AI harness tuning, useful-flow optimization, and graph-based system design.

The same primitive keeps appearing:

```text
system -> objective -> sensitivity -> update
```

That is why this example is useful.

It is not a large claim.

It is a clear, working example of a small primitive that transfers across domains.
</content>
</invoke>
