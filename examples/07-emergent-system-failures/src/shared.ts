import { createTransform, type Transform } from "@composable-model-graph/core";

/**
 * Result of a node contract: a local check attached to a single node.
 * `ok === false` means the node broke a relation it was expected to preserve.
 */
export type ContractResult = { ok: boolean; detail?: string };

/**
 * Attach a Node Contract Check to any transform. The contract result is recorded
 * as a trace signal (`contractOk` / `contractDetail`) so it is inspectable after
 * the run. The wrapper never throws, so the whole run still completes and the
 * trace stays fully inspectable. The wrapped node need not know it is checked.
 */
export function withContract<I, O>(
  transform: Transform<I, O>,
  contract: (input: I, output: O) => ContractResult,
): Transform<I, O> {
  return createTransform<I, O>({
    id: transform.id,
    name: transform.name,
    run: async (input, ctx) => {
      const output = await transform.run(input, ctx);
      const result = contract(input, output);
      ctx.recordSignal?.("contractOk", result.ok);
      if (!result.ok && result.detail) {
        ctx.recordSignal?.("contractDetail", result.detail);
      }
      return output;
    },
  });
}

/** Print a section header shared across the three demos. */
export function header(title: string): void {
  console.log(`\n${"=".repeat(70)}`);
  console.log(title);
  console.log("=".repeat(70));
}

/** Reduce a list of named checks to a pass/fail and print failures. */
export function selfCheck(label: string, checks: Array<[string, boolean]>): boolean {
  const failures = checks.filter(([, ok]) => !ok);
  if (failures.length > 0) {
    console.error(`\n  self-check FAILED (${label}):`);
    for (const [name] of failures) console.error(`    - ${name}`);
    return false;
  }
  console.log(`\n  self-check: all relation/contract checks fired as expected.`);
  return true;
}
