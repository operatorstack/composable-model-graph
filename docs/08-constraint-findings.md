# Constraint findings

Constraints observe caller-projected relationships and emit findings:

```text
caller state -> selector -> relationship check -> findings report
```

A finding has a caller-defined `kind`, stable `code`, and message, with optional
path, observed/expected values, evidence, data, and tags. It deliberately has no
severity or evaluation status.

## Composition

`composeConstraints` / `compose_constraints` executes every declared constraint
in order and retains:

- one check record per constraint;
- every finding in declaration order;
- duplicate findings;
- empty checks.

No findings means only that the executed checks detected nothing. It is not
proof that every relevant condition was checked.

```ts
const report = await composeConstraints(
  referencesResolve,
  levelsSupported,
).check(manifest);
```

```python
report = compose_constraints(
    references_resolve,
    levels_supported,
).check(manifest)
```

## Helpers and projection

The package provides `predicate`, `required`, `distinct`, `referencesExist` /
`references_exist`, `reachable`, `withinRange` / `within_range`, `matches`, and
`project`. Each helper owns only a generic relationship. Callers select the
values and construct the finding, so the package does not introduce a semantic
entity model. Default equality is strict for scalar values and uses identity for
structured values; callers provide a comparator when structural equality is
intended.

## Evaluation is explicit

`createConstraintEvaluator` / `create_constraint_evaluator` requires an
`interpret` callback. The callback alone decides whether findings map to
`pass`, `fail`, `partial`, or `unknown`, and which messages or evidence enter
the evaluation.

The same report can therefore guide a draft, block publication, or be retained
for later inspection without changing its constraints.

Completed-run checks use `Constraint<GraphRun<...>>` directly. Core does not
change its evaluator lifecycle to expose a partially assembled run.

## Control laws

- **constraints-observe-policies-decide:** a finding is not an action.
- **composition-is-lossless:** checks do not short-circuit or deduplicate.
- **caller-owns-projection:** helpers do not impose a data model.
- **no-finding-is-not-proof:** reports describe only executed checks.
- **reports-are-evidence-not-authority:** interpretation remains explicit.
- **deterministic-by-default:** duration is omitted unless another layer records it.
