import { createModelGraph, createTransform } from "@composable-model-graph/core";

/**
 * Example 01 — Core Pipeline
 *
 *   input -> transform -> state -> transform -> output
 *
 * A linear graph of three string transforms, with the full trace printed so
 * every intermediate state is visible.
 */

const trim = createTransform<string, string>({
  id: "trim",
  name: "Trim",
  run: (input) => input.trim(),
});

const lowercase = createTransform<string, string>({
  id: "lowercase",
  name: "Lowercase",
  run: (input) => input.toLowerCase(),
});

const splitWords = createTransform<string, string[]>({
  id: "split-words",
  name: "Split Words",
  run: (input) => input.split(/\s+/).filter((word) => word.length > 0),
});

const graph = createModelGraph<string, string[]>({
  id: "core-pipeline",
  name: "Core Pipeline",
  transforms: [trim, lowercase, splitWords],
});

const run = await graph.run("  Hello Model Graph  ");

console.log("input:   ", JSON.stringify(run.input));
console.log("output:  ", JSON.stringify(run.output));
console.log("\ntrace:");
for (const step of run.trace) {
  console.log(
    `  ${step.transformName}: ${JSON.stringify(step.input)} -> ${JSON.stringify(step.output)}`,
  );
}
