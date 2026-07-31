#!/usr/bin/env python3
"""Example 20 - Find where two runs of the same pipeline diverge.

The story you don't need to be an expert to follow: a depth sensor sits 1 m
above a flat floor and measures the distance to the floor in a grid of
directions. Reconstruct each measurement into a 3D point and every point should
land on the floor (height z = 0). We run the pipeline twice - once healthy, once
with a fault on the two edge columns - and let CMG report the first stage where
the two runs diverge.

    scan configuration -> ray-angle generation -> ray cast
    -> frame transform -> plane residual evaluator

Run without installing:
    python3 python/examples/20-lidar-plane-residual/main.py
"""

from __future__ import annotations

import math
import os
import sys
from dataclasses import dataclass

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "src"))

from composable_model_graph import (  # noqa: E402
    EvaluationResult,
    Evidence,
    compare_runs,
    create_evaluator,
    create_model_graph,
    create_transform,
    render_graph,
)


@dataclass(frozen=True)
class ScanConfig:
    horizontal_samples: int
    vertical_samples: int
    min_azimuth_deg: float
    max_azimuth_deg: float
    min_elevation_deg: float
    max_elevation_deg: float
    sensor_height_m: float
    max_range_m: float


@dataclass(frozen=True)
class Ray:
    horizontal_index: int
    vertical_index: int
    azimuth_rad: float
    elevation_rad: float


@dataclass(frozen=True)
class ScanPlan:
    config: ScanConfig
    rays: list[Ray]


@dataclass(frozen=True)
class Hit:
    ray: Ray
    range_m: float


@dataclass(frozen=True)
class CastScan:
    config: ScanConfig
    hits: list[Hit]


@dataclass(frozen=True)
class Point:
    horizontal_index: int
    vertical_index: int
    x: float
    y: float
    z: float


CONFIG = ScanConfig(
    horizontal_samples=9,
    vertical_samples=3,
    min_azimuth_deg=-45,
    max_azimuth_deg=45,
    min_elevation_deg=-30,
    max_elevation_deg=0,
    sensor_height_m=1,
    max_range_m=30,
)
PLANE_TOLERANCE_M = 1e-9


def inclusive_samples(minimum: float, maximum: float, count: int) -> list[float]:
    if count < 2:
        raise ValueError("this example requires at least two samples")
    step = (maximum - minimum) / (count - 1)
    return [minimum + index * step for index in range(count)]


def scan_configuration(config: ScanConfig, context) -> ScanConfig:
    if config.max_azimuth_deg - config.min_azimuth_deg >= 360:
        raise ValueError("the worked example requires a sub-360 degree scan")
    if config.sensor_height_m <= 0 or config.max_range_m <= 0:
        raise ValueError("height and maximum range must be positive")
    context.record_signal("horizontalSamples", config.horizontal_samples)
    return config


def generate_ray_angles(config: ScanConfig, context) -> ScanPlan:
    azimuths = inclusive_samples(
        config.min_azimuth_deg,
        config.max_azimuth_deg,
        config.horizontal_samples,
    )
    elevations = inclusive_samples(
        config.min_elevation_deg,
        config.max_elevation_deg,
        config.vertical_samples,
    )
    rays = [
        Ray(
            horizontal_index=horizontal_index,
            vertical_index=vertical_index,
            azimuth_rad=math.radians(azimuth),
            elevation_rad=math.radians(elevation),
        )
        for horizontal_index, azimuth in enumerate(azimuths)
        for vertical_index, elevation in enumerate(elevations)
    ]
    context.record_signal("firstAzimuthDeg", azimuths[0])
    context.record_signal("lastAzimuthDeg", azimuths[-1])
    return ScanPlan(config=config, rays=rays)


def make_ray_cast(left_edge_scale: float, right_edge_scale: float):
    def ray_cast(plan: ScanPlan, context) -> CastScan:
        hits: list[Hit] = []
        for ray in plan.rays:
            vertical_direction = math.sin(ray.elevation_rad)
            if vertical_direction >= -1e-12:
                continue
            true_range = -plan.config.sensor_height_m / vertical_direction
            if true_range > plan.config.max_range_m:
                continue
            scale = 1.0
            if ray.horizontal_index == 0:
                scale = left_edge_scale
            elif ray.horizontal_index == plan.config.horizontal_samples - 1:
                scale = right_edge_scale
            hits.append(Hit(ray=ray, range_m=true_range * scale))
        context.record_signal("leftEdgeRangeScale", left_edge_scale)
        context.record_signal("rightEdgeRangeScale", right_edge_scale)
        return CastScan(config=plan.config, hits=hits)

    return ray_cast


def frame_transform(scan: CastScan, context) -> list[Point]:
    """Reconstruct in the sensor frame; the transform is intentionally identity."""
    points = []
    for hit in scan.hits:
        cos_elevation = math.cos(hit.ray.elevation_rad)
        points.append(
            Point(
                horizontal_index=hit.ray.horizontal_index,
                vertical_index=hit.ray.vertical_index,
                x=hit.range_m
                * cos_elevation
                * math.cos(hit.ray.azimuth_rad),
                y=hit.range_m
                * cos_elevation
                * math.sin(hit.ray.azimuth_rad),
                z=scan.config.sensor_height_m
                + hit.range_m * math.sin(hit.ray.elevation_rad),
            )
        )
    context.record_signal("frameTranslationZ", 0)
    return points


def residual_summary(points: list[Point]) -> tuple[float, float, float, float]:
    last_index = CONFIG.horizontal_samples - 1
    left = [point.z for point in points if point.horizontal_index == 0]
    right = [point.z for point in points if point.horizontal_index == last_index]
    interior = [
        abs(point.z)
        for point in points
        if point.horizontal_index not in (0, last_index)
    ]
    max_abs = max((abs(point.z) for point in points), default=0)
    return (
        max_abs,
        sum(left) / len(left),
        sum(right) / len(right),
        max(interior, default=0),
    )


def evaluate_plane(points: list[Point], target, context) -> EvaluationResult:
    max_abs, left_mean, right_mean, interior_max = residual_summary(points)
    return EvaluationResult(
        status="pass" if max_abs <= PLANE_TOLERANCE_M else "fail",
        score=1 / (1 + max_abs),
        error=max_abs,
        messages=[f"maximum plane residual = {max_abs:.6f} m"],
        evidence=[
            Evidence("left edge mean z", left_mean, "plane-residual"),
            Evidence("right edge mean z", right_mean, "plane-residual"),
            Evidence("interior max |z|", interior_max, "plane-residual"),
        ],
    )


plane_evaluator = create_evaluator(
    "plane-residual",
    "Evaluate z = 0 plane residual",
    evaluate_plane,
)


def create_lidar_graph(graph_id: str, left_scale: float, right_scale: float):
    return create_model_graph(
        graph_id,
        "Sub-360 LIDAR plane residual",
        [
            create_transform(
                "scan-configuration",
                "Scan configuration",
                scan_configuration,
            ),
            create_transform(
                "ray-angle-generation",
                "Generate inclusive ray angles",
                generate_ray_angles,
            ),
            create_transform("ray-cast", "Cast rays", make_ray_cast(left_scale, right_scale)),
            create_transform(
                "frame-transform",
                "Transform points into sensor frame",
                frame_transform,
            ),
        ],
        evaluator=plane_evaluator,
    )


def print_run(label: str, run) -> None:
    max_abs, left_mean, right_mean, interior_max = residual_summary(run.output)
    print(label)
    print(f"  status:         {run.evaluation.status if run.evaluation else 'none'}")
    print(f"  max |z|:        {max_abs:.3f} m")
    print(f"  left mean z:    {left_mean:+.3f} m")
    print(f"  right mean z:   {right_mean:+.3f} m")
    print(f"  interior |z|:   {interior_max:.3f} m")


baseline_graph = create_lidar_graph("baseline", 1, 1)
edge_fault_graph = create_lidar_graph("edge-range-fault", 0.92, 1.08)
baseline = baseline_graph.run(CONFIG)
edge_fault = edge_fault_graph.run(CONFIG)
comparison = compare_runs(baseline, edge_fault)
divergent_step = comparison.diverged_at_step
divergent_id = (
    edge_fault.trace[divergent_step].transform_id
    if divergent_step is not None
    else "none"
)

print("Flat-floor depth sensor: locate the faulty stage\n")
print("CMG model - injected fault")
print(render_graph(edge_fault_graph, columns=44, direction="vertical"))
print("")
print("scan: 9 x 3, azimuth [-45, 45] deg, elevation [-30, 0] deg")
print("sensor height: 1.000 m; comparison plane: z = 0\n")
print_run("Baseline - consistent cast and reconstruction", baseline)
print("")
print_run("Fault injection - edge ranges scaled 0.92 / 1.08", edge_fault)
print("")
print(f"first divergent step: {divergent_step} ({divergent_id})")
print("invariant: z = h(1 - s), so edge offset is independent of ray angle")
print("reading: angle generation and identity frame transform stay equal; the")
print("trace localizes this worked fault to the ray-cast range boundary.")
