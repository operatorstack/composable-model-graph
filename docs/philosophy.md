# Philosophy

Why this library exists and the bar every part of it holds to.

## One library, two engineers

A computer scientist and an aerospace engineer should both be able to pick this up
and solve a problem with it. Not because it is dumbed down, but because the surface
is small and general: typed transforms, a graph that runs them, a trace you can
read, evaluation, and feedback. The deep ideas (control theory, network flow,
neural error/feedback) inform the design; they are never the price of admission.

If using a capability requires you to first learn the theory behind it, the
capability is not finished.

## General tools, not domain lock-in

The core stays domain-free on purpose. Cost, capacity, tokens, latency, reward:
these are signals a caller records, not concepts baked into the primitive. A
domain (payments, evals, infra, research) sits ON TOP as an example or a feature
package; it never leaks into the core. This is what lets the same primitive serve
unrelated fields without becoming any one field's tool.

## The curse of expertise (the motivation)

There is an inverse relationship worth naming: the more domain knowledge someone
has, the more likely they are to pass over a general tool they could have used,
because they assume they need a specialist one. Deep expertise narrows the search.
This library is built against that failure mode. It offers general capabilities
that a specialist can reach for without leaving their domain, if they are willing
to do a small investigation first.

## The contract with the user

We rely on two things from whoever uses this:

1. They actually want to solve a problem (not collect a framework).
2. They will do a small investigation to see how the primitive maps to their problem.

In return the library promises that the investigation is small and the value is
real: a working graph, an inspectable trace, an honest comparison, a next step.
The deliverable is always "I can see what happened and what to change," not a
score.

## Theory informs design; the API exposes capabilities

Use deep domain knowledge to DESIGN the primitive. Expose simple capabilities the
user understands immediately: run a graph, read the trace, compare two runs, find
what to change. The theory is in the bones, not on the label.
