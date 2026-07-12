import { fileURLToPath } from "node:url";

/**
 * Resolve every workspace package to its TypeScript source so tests run
 * directly against `src/` without requiring a build step first.
 */
const fromRoot = (relativePath: string): string =>
  fileURLToPath(new URL(relativePath, import.meta.url));

export const workspaceAlias: Record<string, string> = {
  "@composable-model-graph/core": fromRoot("./packages/core/src/index.ts"),
  "@composable-model-graph/math": fromRoot("./packages/math/src/index.ts"),
  "@composable-model-graph/evaluators": fromRoot(
    "./packages/evaluators/src/index.ts",
  ),
  "@composable-model-graph/feedback": fromRoot(
    "./packages/feedback/src/index.ts",
  ),
  "@composable-model-graph/estimation": fromRoot(
    "./packages/estimation/src/index.ts",
  ),
};
