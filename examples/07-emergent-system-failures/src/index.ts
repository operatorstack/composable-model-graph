import { runSensor } from "./sensor.js";
import { runDependency } from "./dependency.js";
import { runResearch } from "./research.js";

/**
 * Example 07 — Emergent System Failures
 *
 * Some failures do not live in one node. Every transform can return a valid
 * shape, finite values, and pass its local interface, yet the composed system
 * violates a contract that only exists at the graph level:
 *
 *   local validity != system validity
 *
 * The same pattern shows up across very different domains. We run three:
 *   A. Sensor / signed-signal aggregation (sign relation)
 *   B. Dependency graph / execution ordering (ordering relation)
 *   C. Research / knowledge synthesis (evidence-support relation)
 *
 * Each demo catches its emergent failure three ways: a Final Answer Check, a
 * Node Contract Check, and a Trace Relation Check — and localizes the faulty
 * node by inspecting the trace. Each demo self-verifies; if any expected check
 * fails to fire, the process exits non-zero.
 */

console.log("Example 07 — Emergent System Failures");
console.log("local validity != system validity\n");
console.log("Three domains, one pattern: a node is locally valid but corrupts a graph-level relation.");

const results: Array<[string, boolean]> = [
  ["sensor", await runSensor()],
  ["dependency", await runDependency()],
  ["research", await runResearch()],
];

console.log(`\n${"=".repeat(70)}`);
console.log("Summary");
console.log("=".repeat(70));
for (const [name, ok] of results) {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`);
}

const allPassed = results.every(([, ok]) => ok);
if (!allPassed) {
  console.error("\nSELF-CHECK FAILED: one or more demos did not localize as expected.");
  process.exitCode = 1;
} else {
  console.log("\nAll three demos detected and localized their emergent failure.");
}
