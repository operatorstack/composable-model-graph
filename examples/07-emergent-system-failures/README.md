# 07 — Emergent System Failures

Some failures do not live in one node.

A graph can have valid local outputs at every step: shapes are correct, values
are finite, nothing throws, and each transform appears to satisfy its local
interface. Yet the composed system can still violate a contract that only exists
at the graph level.

This example shows why model-powered systems need traces, signals, and
graph-level checks.

## Core principle

```
local validity != system validity
```

A model graph lets us ask:

- where did useful signal enter?
- where was it transformed?
- where was it corrupted?
- which node looked locally valid but broke the global relation?

## Implemented demo: signed signal aggregation

```
parse-measurements -> normalize-signal -> aggregate-state
```

Input:

```
[100, -250, 75, -10]
```

Expected aggregate: **-85**

Fault: `normalize-signal` takes `abs(v)` for values where `|v| < 50`, silently
changing `-10` to `10`.

Actual output: **-65**

The node preserves shape, but corrupts sign information.

## Three ways to catch it

### 1. Final Answer Check

Compare the final output against a known target.

This detects that the system failed, but not where.

### 2. Node Contract Check

Attach local expectations to nodes and record the result as trace signals.

This localizes the failure if the right contract was declared.

### 3. Trace Relation Check

Some system contracts can be tested without knowing the final answer.

Instead of asking "is this output correct?", we ask whether the system preserves
an expected relation: changing the input in a known way should change the output
in a predictable way.

For this signed signal pipeline:

> If the input signal is flipped, the final state should flip too.

```
state(-x) = -state(x)
```

We run the graph twice — on `x` and on `-x` — then compare the trace step by
step. The first step where the relation breaks is where the useful signal was
corrupted.

Relation checks are sometimes called metamorphic invariants in testing, but the
user-facing idea is simple: related inputs should produce related outputs.

## Larger domain mappings

The same pattern generalizes. All three domains below are runnable here
(`src/sensor.ts`, `src/dependency.ts`, `src/research.ts`); each one detects and
localizes its own emergent failure.

### A. Sensor / physical systems

```
sensor-readings -> normalize-signal -> estimate-state
```

Expected relation: if the signal flips, the state should flip.

```
state(-x) = -state(x)
```

A normalization node preserves numeric shape but corrupts sign/direction
information.

### B. Dependency graph / computer-science systems

```
parse-dependencies -> normalize-edges -> topological-sort -> execution-plan
```

Expected relation: if A depends on B, B must appear before A.

```
for every edge "A depends on B": index(B) < index(A)
```

A faulty node may reverse an edge while preserving valid shape
(`Edge[] -> Edge[] -> Node[] -> Plan`). The graph still returns a valid plan, but
the plan violates the ordering relation. This is domain-general: build systems,
package managers, schedulers, DAG execution, workflow engines, compilers, and
agent task graphs all share this contract.

Other relation checks for this domain:

- If node names are renamed consistently, the dependency order should remain
  equivalent.
- Adding an unrelated, independent task should not invalidate the existing
  order.

### C. Research / knowledge systems

```
question -> retrieve-sources -> extract-claims -> synthesize-answer
```

Expected relation: every load-bearing claim should trace back to supporting
evidence.

> If the evidence for a claim is removed, the final answer should remove the
> claim or lower its confidence.

If the answer stays equally confident after its evidence is removed, the graph
has corrupted evidence flow. This shows the primitive is not restricted to
sensors or software.

## Run

```bash
pnpm --filter @composable-model-graph/example-07-emergent-system-failures start
```

The runner executes all three demos and exits non-zero if any expected check
fails to fire. The current captured output is in
[`expected-output.txt`](expected-output.txt).

## Honest limit

Relation checks are necessary, not sufficient.

A wrong system can satisfy one relation check. The value of a model graph is not
that one check proves correctness — it is that traces make relation checks
explicit, inspectable, composable, and extensible as new failures are
discovered.

If no node breaks a local relation and the final result is still wrong, only an
end-to-end property, oracle, or stronger set of relation checks can catch it.
Local checks alone cannot prove global correctness.

For each domain:

- Sensor graph: preserve the signed relation.
- Dependency graph: preserve the ordering relation.
- Research graph: preserve the evidence-support relation.
