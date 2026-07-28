import {
  composeConstraints,
  reachable,
  referencesExist,
  withinRange,
  type ConstraintFinding,
} from "@composable-model-graph/constraints";

interface Artifact {
  id: string;
  apiLevel: number;
  dependencies: string[];
}

interface ReleaseManifest {
  artifacts: Artifact[];
}

const manifest: ReleaseManifest = {
  artifacts: [
    { id: "core", apiLevel: 2, dependencies: [] },
    { id: "cli", apiLevel: 2, dependencies: ["core"] },
    { id: "docs", apiLevel: 4, dependencies: ["theme"] },
  ],
};

const referencesResolve = referencesExist<
  ReleaseManifest,
  Artifact,
  ConstraintFinding
>({
  id: "references-resolve",
  name: "References resolve",
  records: (value) => value.artifacts,
  recordId: (artifact) => artifact.id,
  references: (value) =>
    value.artifacts.flatMap((artifact) =>
      artifact.dependencies.map((dependency) => ({
        source: artifact.id,
        target: dependency,
      })),
    ),
  finding: ({ reference }) => ({
    kind: "missing-reference",
    code: "reference.missing",
    message: `${reference.source} references missing artifact ${reference.target}`,
    data: reference,
  }),
});

const apiLevelsSupported = withinRange<
  ReleaseManifest,
  ConstraintFinding
>({
  id: "api-levels-supported",
  name: "API levels supported",
  min: 1,
  max: 3,
  select: (value) =>
    value.artifacts.map((artifact) => ({
      id: artifact.id,
      value: artifact.apiLevel,
    })),
  finding: ({ item, min, max }) => ({
    kind: "outside-range",
    code: "api-level.outside",
    message: `${item.id} API level ${item.value} is outside ${min}-${max}`,
  }),
});

const consumersReachable = reachable<
  ReleaseManifest,
  ConstraintFinding
>({
  id: "consumers-reachable",
  name: "Consumers reachable",
  starts: () => ["core"],
  goals: (value) =>
    value.artifacts
      .map((artifact) => artifact.id)
      .filter((id) => id !== "core"),
  neighbors: (id, value) =>
    value.artifacts
      .filter((artifact) => artifact.dependencies.includes(id))
      .map((artifact) => artifact.id),
  finding: ({ goal }) => ({
    kind: "unreachable",
    code: "dependency.unreachable",
    message: `${goal} is unreachable from core`,
  }),
});

const constraints = composeConstraints(
  referencesResolve,
  apiLevelsSupported,
  consumersReachable,
);
const report = await constraints.check(manifest);

console.log("Release manifest constraints");
console.log("");
console.log("Checks");
for (const check of report.checks) {
  const suffix = check.findings.length === 1 ? "finding" : "findings";
  console.log(
    `  ${check.constraintName}: ${check.findings.length} ${suffix}`,
  );
}
console.log("");
console.log("Findings");
for (const item of report.findings) {
  console.log(`  ${item.code}: ${item.message}`);
}
console.log("");
console.log(
  `Draft interpretation: continue with ${report.findings.length} warnings`,
);
console.log(
  `Publish interpretation: block with ${report.findings.length} findings`,
);
