import { defineConfig } from "vitest/config";

import { workspaceAlias } from "./vitest.shared.js";

export default defineConfig({
  resolve: {
    alias: workspaceAlias,
  },
  test: {
    projects: ["packages/*"],
  },
});
