import type {
  Constraint,
  ConstraintContext,
  ConstraintReport,
  ConstraintSuite,
} from "./types.js";

/**
 * Execute every constraint sequentially and retain all findings in declaration
 * order. Findings are never interpreted or deduplicated.
 */
export function composeConstraints<T, F>(
  ...constraints: ReadonlyArray<Constraint<T, F>>
): ConstraintSuite<T, F> {
  return {
    constraints: [...constraints],
    async check(
      value: T,
      context: ConstraintContext = {},
    ): Promise<ConstraintReport<F>> {
      const checks = [];
      const findings: F[] = [];
      for (const constraint of constraints) {
        const constraintFindings = [...(await constraint.check(value, context))];
        checks.push({
          constraintId: constraint.id,
          constraintName: constraint.name,
          findings: constraintFindings,
        });
        findings.push(...constraintFindings);
      }
      return { checks, findings };
    },
  };
}
