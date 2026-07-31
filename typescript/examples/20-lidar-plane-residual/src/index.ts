import {
  compareRuns,
  createEvaluator,
  createModelGraph,
  createTransform,
  type EvaluationResult,
  type GraphRun,
  type ModelGraph,
} from "@composable-model-graph/core";
import { renderGraph } from "@composable-model-graph/terminal";

/**
 * Example 20 - Find where two runs of the same pipeline diverge.
 *
 * The story you don't need to be an expert to follow: a depth sensor sits 1 m
 * above a flat floor and measures the distance to the floor in a grid of
 * directions. Reconstruct each measurement into a 3D point and every point
 * should land on the floor (height z = 0). We run the pipeline twice - once
 * healthy, once with a fault on the two edge columns - and let CMG report the
 * first stage where the two runs diverge.
 *
 *   scan configuration -> ray-angle generation -> ray cast
 *   -> frame transform -> plane residual evaluator
 */

interface ScanConfig {
  horizontalSamples: number;
  verticalSamples: number;
  minAzimuthDeg: number;
  maxAzimuthDeg: number;
  minElevationDeg: number;
  maxElevationDeg: number;
  sensorHeightM: number;
  maxRangeM: number;
}

interface Ray {
  horizontalIndex: number;
  verticalIndex: number;
  azimuthRad: number;
  elevationRad: number;
}

interface ScanPlan {
  config: ScanConfig;
  rays: Ray[];
}

interface Hit {
  ray: Ray;
  rangeM: number;
}

interface CastScan {
  config: ScanConfig;
  hits: Hit[];
}

interface Point {
  horizontalIndex: number;
  verticalIndex: number;
  x: number;
  y: number;
  z: number;
}

const CONFIG: ScanConfig = {
  horizontalSamples: 9,
  verticalSamples: 3,
  minAzimuthDeg: -45,
  maxAzimuthDeg: 45,
  minElevationDeg: -30,
  maxElevationDeg: 0,
  sensorHeightM: 1,
  maxRangeM: 30,
};
const PLANE_TOLERANCE_M = 1e-9;

function inclusiveSamples(
  minimum: number,
  maximum: number,
  count: number,
): number[] {
  if (count < 2) {
    throw new Error("this example requires at least two samples");
  }
  const step = (maximum - minimum) / (count - 1);
  return Array.from({ length: count }, (_, index) => minimum + index * step);
}

const scanConfiguration = createTransform<ScanConfig, ScanConfig>({
  id: "scan-configuration",
  name: "Scan configuration",
  run: (config, context) => {
    if (config.maxAzimuthDeg - config.minAzimuthDeg >= 360) {
      throw new Error("the worked example requires a sub-360 degree scan");
    }
    if (config.sensorHeightM <= 0 || config.maxRangeM <= 0) {
      throw new Error("height and maximum range must be positive");
    }
    context.recordSignal?.("horizontalSamples", config.horizontalSamples);
    return { ...config };
  },
});

const generateRayAngles = createTransform<ScanConfig, ScanPlan>({
  id: "ray-angle-generation",
  name: "Generate inclusive ray angles",
  run: (config, context) => {
    const azimuths = inclusiveSamples(
      config.minAzimuthDeg,
      config.maxAzimuthDeg,
      config.horizontalSamples,
    );
    const elevations = inclusiveSamples(
      config.minElevationDeg,
      config.maxElevationDeg,
      config.verticalSamples,
    );
    const rays = azimuths.flatMap((azimuth, horizontalIndex) => {
      return elevations.map((elevation, verticalIndex) => {
        return {
          horizontalIndex,
          verticalIndex,
          azimuthRad: azimuth * Math.PI / 180,
          elevationRad: elevation * Math.PI / 180,
        };
      });
    });
    context.recordSignal?.("firstAzimuthDeg", azimuths[0]);
    context.recordSignal?.("lastAzimuthDeg", azimuths.at(-1));
    return { config, rays };
  },
});

function makeRayCast(
  leftEdgeScale: number,
  rightEdgeScale: number,
) {
  return createTransform<ScanPlan, CastScan>({
    id: "ray-cast",
    name: "Cast rays",
    run: (plan, context) => {
      const hits: Hit[] = [];
      for (const ray of plan.rays) {
        const verticalDirection = Math.sin(ray.elevationRad);
        if (verticalDirection >= -1e-12) {
          continue;
        }
        const trueRange = -plan.config.sensorHeightM / verticalDirection;
        if (trueRange > plan.config.maxRangeM) {
          continue;
        }
        let scale = 1;
        if (ray.horizontalIndex === 0) {
          scale = leftEdgeScale;
        } else if (
          ray.horizontalIndex === plan.config.horizontalSamples - 1
        ) {
          scale = rightEdgeScale;
        }
        hits.push({ ray, rangeM: trueRange * scale });
      }
      context.recordSignal?.("leftEdgeRangeScale", leftEdgeScale);
      context.recordSignal?.("rightEdgeRangeScale", rightEdgeScale);
      return { config: plan.config, hits };
    },
  });
}

const frameTransform = createTransform<CastScan, Point[]>({
  id: "frame-transform",
  name: "Transform points into sensor frame",
  run: (scan, context) => {
    const points = scan.hits.map((hit) => {
      const cosElevation = Math.cos(hit.ray.elevationRad);
      return {
        horizontalIndex: hit.ray.horizontalIndex,
        verticalIndex: hit.ray.verticalIndex,
        x: hit.rangeM * cosElevation * Math.cos(hit.ray.azimuthRad),
        y: hit.rangeM * cosElevation * Math.sin(hit.ray.azimuthRad),
        z: scan.config.sensorHeightM
          + hit.rangeM * Math.sin(hit.ray.elevationRad),
      };
    });
    context.recordSignal?.("frameTranslationZ", 0);
    return points;
  },
});

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function residualSummary(points: Point[]): {
  maxAbs: number;
  leftMean: number;
  rightMean: number;
  interiorMax: number;
} {
  const lastIndex = CONFIG.horizontalSamples - 1;
  const left = points
    .filter((point) => point.horizontalIndex === 0)
    .map((point) => point.z);
  const right = points
    .filter((point) => point.horizontalIndex === lastIndex)
    .map((point) => point.z);
  const interior = points
    .filter((point) => {
      return point.horizontalIndex !== 0
        && point.horizontalIndex !== lastIndex;
    })
    .map((point) => Math.abs(point.z));
  return {
    maxAbs: Math.max(0, ...points.map((point) => Math.abs(point.z))),
    leftMean: mean(left),
    rightMean: mean(right),
    interiorMax: Math.max(0, ...interior),
  };
}

const planeEvaluator = createEvaluator<Point[]>({
  id: "plane-residual",
  name: "Evaluate z = 0 plane residual",
  evaluate: (points): EvaluationResult => {
    const summary = residualSummary(points);
    return {
      status: summary.maxAbs <= PLANE_TOLERANCE_M ? "pass" : "fail",
      score: 1 / (1 + summary.maxAbs),
      error: summary.maxAbs,
      messages: [
        `maximum plane residual = ${summary.maxAbs.toFixed(6)} m`,
      ],
      evidence: [
        {
          label: "left edge mean z",
          value: summary.leftMean,
          source: "plane-residual",
        },
        {
          label: "right edge mean z",
          value: summary.rightMean,
          source: "plane-residual",
        },
        {
          label: "interior max |z|",
          value: summary.interiorMax,
          source: "plane-residual",
        },
      ],
    };
  },
});

function createLidarGraph(
  id: string,
  leftScale: number,
  rightScale: number,
): ModelGraph<ScanConfig, Point[]> {
  return createModelGraph<ScanConfig, Point[]>({
    id,
    name: "Sub-360 LIDAR plane residual",
    transforms: [
      scanConfiguration,
      generateRayAngles,
      makeRayCast(leftScale, rightScale),
      frameTransform,
    ],
    evaluator: planeEvaluator,
  });
}

function printRun(label: string, run: GraphRun<ScanConfig, Point[]>): void {
  const summary = residualSummary(run.output);
  console.log(label);
  console.log(`  status:         ${run.evaluation?.status ?? "none"}`);
  console.log(`  max |z|:        ${summary.maxAbs.toFixed(3)} m`);
  console.log(`  left mean z:    ${formatSigned(summary.leftMean)} m`);
  console.log(`  right mean z:   ${formatSigned(summary.rightMean)} m`);
  console.log(`  interior |z|:   ${summary.interiorMax.toFixed(3)} m`);
}

function formatSigned(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(3)}`;
}

const baselineGraph = createLidarGraph("baseline", 1, 1);
const edgeFaultGraph = createLidarGraph(
  "edge-range-fault",
  0.92,
  1.08,
);
const baseline = await baselineGraph.run(CONFIG);
const edgeFault = await edgeFaultGraph.run(CONFIG);
const comparison = compareRuns(baseline, edgeFault);
const divergentStep = comparison.divergedAtStep;
const divergentId = divergentStep === undefined
  ? "none"
  : edgeFault.trace[divergentStep]?.transformId ?? "none";

console.log("Flat-floor depth sensor: locate the faulty stage\n");
console.log("CMG model - injected fault");
console.log(renderGraph(edgeFaultGraph, {
  columns: 44,
  direction: "vertical",
}));
console.log("");
console.log("scan: 9 x 3, azimuth [-45, 45] deg, elevation [-30, 0] deg");
console.log("sensor height: 1.000 m; comparison plane: z = 0\n");
printRun("Baseline - consistent cast and reconstruction", baseline);
console.log("");
printRun("Fault injection - edge ranges scaled 0.92 / 1.08", edgeFault);
console.log("");
console.log(`first divergent step: ${divergentStep ?? "none"} (${divergentId})`);
console.log("invariant: z = h(1 - s), so edge offset is independent of ray angle");
console.log("reading: angle generation and identity frame transform stay equal; the");
console.log("trace localizes this worked fault to the ray-cast range boundary.");
