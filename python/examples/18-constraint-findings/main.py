"""Constraint findings over a release manifest."""

from __future__ import annotations

import os
import sys

sys.path.insert(
    0,
    os.path.join(os.path.dirname(__file__), "..", "..", "src"),
)

from composable_model_graph.constraints import (  # noqa: E402
    ConstraintFinding,
    SelectedReference,
    SelectedValue,
    compose_constraints,
    reachable,
    references_exist,
    within_range,
)

manifest = {
    "artifacts": [
        {"id": "core", "apiLevel": 2, "dependencies": []},
        {"id": "cli", "apiLevel": 2, "dependencies": ["core"]},
        {"id": "docs", "apiLevel": 4, "dependencies": ["theme"]},
    ]
}

references_resolve = references_exist(
    id="references-resolve",
    name="References resolve",
    records=lambda value: value["artifacts"],
    record_id=lambda artifact: artifact["id"],
    references=lambda value: [
        SelectedReference(artifact["id"], dependency)
        for artifact in value["artifacts"]
        for dependency in artifact["dependencies"]
    ],
    finding=lambda reference: ConstraintFinding(
        kind="missing-reference",
        code="reference.missing",
        message=(
            f"{reference.source} references missing artifact "
            f"{reference.target}"
        ),
        data={
            "source": reference.source,
            "target": reference.target,
        },
    ),
)

api_levels_supported = within_range(
    id="api-levels-supported",
    name="API levels supported",
    minimum=1,
    maximum=3,
    select=lambda value: [
        SelectedValue(artifact["id"], artifact["apiLevel"])
        for artifact in value["artifacts"]
    ],
    finding=lambda item, minimum, maximum: ConstraintFinding(
        kind="outside-range",
        code="api-level.outside",
        message=(
            f"{item.id} API level {item.value} is outside "
            f"{minimum}-{maximum}"
        ),
    ),
)

consumers_reachable = reachable(
    id="consumers-reachable",
    name="Consumers reachable",
    starts=lambda _value: ["core"],
    goals=lambda value: [
        artifact["id"]
        for artifact in value["artifacts"]
        if artifact["id"] != "core"
    ],
    neighbors=lambda id, value: [
        artifact["id"]
        for artifact in value["artifacts"]
        if id in artifact["dependencies"]
    ],
    finding=lambda _starts, goal: ConstraintFinding(
        kind="unreachable",
        code="dependency.unreachable",
        message=f"{goal} is unreachable from core",
    ),
)

constraints = compose_constraints(
    references_resolve,
    api_levels_supported,
    consumers_reachable,
)
report = constraints.check(manifest)

print("Release manifest constraints")
print()
print("Checks")
for check in report.checks:
    suffix = "finding" if len(check.findings) == 1 else "findings"
    print(f"  {check.constraint_name}: {len(check.findings)} {suffix}")
print()
print("Findings")
for item in report.findings:
    print(f"  {item.code}: {item.message}")
print()
print(f"Draft interpretation: continue with {len(report.findings)} warnings")
print(f"Publish interpretation: block with {len(report.findings)} findings")
