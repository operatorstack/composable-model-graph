# @composable-model-graph/constraints

Deterministic structural checks that emit lossless, status-free findings.

```ts
const suite = composeConstraints(requiredFields, referencesResolve);
const report = await suite.check(value);
```

Constraints observe caller-projected relationships. They do not assign
severity, evaluation status, workflow action, or authority. Applications may
interpret the same report differently in different lifecycle contexts.

`createConstraintEvaluator` integrates a suite with CMG evaluation only when the
caller supplies an explicit `interpret` function. The package depends only on
core and introduces no semantic entity model.
