import { DenseLayer, identity, meanSquaredError } from "@composable-model-graph/math";

/**
 * Example 10 - Superposition + modulation (a linear backbone plus an input-gated correction)
 *
 * Motivation (fluid mechanics). Predicting near-wall velocity fluctuations u' from
 * wall data: turbulence is a LINEAR superposition of large-scale structure PLUS a
 * NONLINEAR modulation (large scales set the amplitude of small scales). A purely
 * linear estimator (Linear Stochastic Estimation, LSE) recovers the superposition
 * and misses the modulation. The better turbulence-ML models do not REPLACE the
 * linear estimator; they ADD a learned, input-gated correction.
 *
 * That correction is exactly a local-model blend:
 *
 *     y(x) = sum_i  phi_i(x) * ( a_i . x + b_i )
 *            \____/   \_______________________/
 *          modulation         superposition
 *
 * The affine local models a_i.x+b_i are the superposition; the membership phi_i(x)
 * that re-weights them by where you are is the modulation. Domain-free: the same
 * shape is a gray-box correction to any linear backbone.
 *
 * Each local model is a cmg `DenseLayer` with the `identity` activation (= affine).
 * The example fits the weights by (weighted) least squares and gates them with
 * normalized Gaussian memberships. Deterministic synthetic data, hand-checkable,
 * self-verifying.
 */

// ---- deterministic synthetic "DNS truth": superposition + modulation ----
const N = 240;
const A = 1.0; // superposition gain (large-scale footprint, linear)
const B = 0.8; // modulation gain (large scale sets small-scale amplitude, nonlinear)
const TWO_PI = Math.PI * 2;

type Sample = { g: number; h: number; y: number };
const data: Sample[] = [];
for (let n = 0; n < N; n++) {
  const t = (TWO_PI * n) / N;
  const g = Math.sin(t); // large-scale wall signal
  const h = Math.sin(7 * t); // small-scale wall signal
  const y = A * g + B * g * h; // u' = superposition + modulation
  data.push({ g, h, y });
}
const targets = data.map((d) => d.y);
const rmse = (preds: number[]): number => Math.sqrt(meanSquaredError.compute(preds, targets));

// ---- weighted least squares over features [1, g, h] (closed form, 3x3, Cramer) ----
function det3(
  a: number, b: number, c: number,
  d: number, e: number, f: number,
  g: number, h: number, i: number,
): number {
  return a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
}
function fitWLS(weights: number[]): [number, number, number] {
  let S = 0, Sg = 0, Sh = 0, Sgg = 0, Shh = 0, Sgh = 0, v0 = 0, v1 = 0, v2 = 0;
  for (let n = 0; n < N; n++) {
    const { g, h, y } = data[n]!;
    const w = weights[n]!;
    S += w; Sg += w * g; Sh += w * h;
    Sgg += w * g * g; Shh += w * h * h; Sgh += w * g * h;
    v0 += w * y; v1 += w * g * y; v2 += w * h * y;
  }
  const D = det3(S, Sg, Sh, Sg, Sgg, Sgh, Sh, Sgh, Shh);
  const b0 = det3(v0, Sg, Sh, v1, Sgg, Sgh, v2, Sgh, Shh) / D;
  const b1 = det3(S, v0, Sh, Sg, v1, Sgh, Sh, v2, Shh) / D;
  const b2 = det3(S, Sg, v0, Sg, Sgg, v1, Sh, Sgh, v2) / D;
  return [b0, b1, b2];
}
// the affine fit, run as a cmg DenseLayer (identity activation): out = b0 + b1*g + b2*h
function layerFromBeta(beta: [number, number, number], id: string): DenseLayer {
  const [b0, b1, b2] = beta;
  return new DenseLayer({
    id, name: id, inputSize: 2, outputSize: 1,
    weights: [[b1], [b2]], bias: [b0], activation: identity,
  });
}
const run1 = (layer: DenseLayer, g: number, h: number): number => layer.run([g, h])[0]!;

// ===== 1. DNS truth =====
console.log("1. DNS TRUTH  -  u' = superposition (A*g) + modulation (B*g*h)");
console.log(`   A (superposition) = ${A.toFixed(2)}   B (modulation) = ${B.toFixed(2)}   N = ${N}\n`);

// ===== 2. LINEAR (LSE): one global affine fit =====
const linBeta = fitWLS(new Array<number>(N).fill(1));
const linLayer = layerFromBeta(linBeta, "lse");
const linPreds = data.map((d) => run1(linLayer, d.g, d.h));
const linRMSE = rmse(linPreds);
console.log("2. LINEAR (LSE)  -  one affine model, no gating");
console.log(`   recovered superposition slope (g): ${linBeta[1].toFixed(3)}  (true A = ${A.toFixed(2)})`);
console.log(`   small-scale slope (h):             ${linBeta[2].toFixed(3)}  (modulation invisible -> ~0)`);
console.log(`   RMSE vs DNS: ${linRMSE.toFixed(4)}   <- the residual IS the modulation it misses\n`);

// ===== 3. BLEND: linear backbone + input-gated correction (superposition + modulation) =====
const centers = [-0.8, -0.4, 0.0, 0.4, 0.8]; // membership centers over the large scale g
const K = centers.length;
const SIGMA = 0.35;
const memb = (g: number, c: number): number => Math.exp(-((g - c) ** 2) / (2 * SIGMA * SIGMA));
const phiOf = (g: number): number[] => {
  const raw = centers.map((c) => memb(g, c));
  const sum = raw.reduce((s, r) => s + r, 0);
  return raw.map((r) => r / sum); // normalized: sum_i phi_i = 1 (a convex combination)
};
// one local affine model per region, weighted by its membership (WLS = TSK consequents)
const localLayers: DenseLayer[] = [];
const localBetas: Array<[number, number, number]> = [];
for (let i = 0; i < K; i++) {
  const w = data.map((d) => phiOf(d.g)[i]!);
  const beta = fitWLS(w);
  localBetas.push(beta);
  localLayers.push(layerFromBeta(beta, `local-${i}`));
}
const blendPredict = (g: number, h: number): number => {
  const phi = phiOf(g);
  let y = 0;
  for (let i = 0; i < K; i++) y += phi[i]! * run1(localLayers[i]!, g, h);
  return y;
};
const blendPreds = data.map((d) => blendPredict(d.g, d.h));
const blendRMSE = rmse(blendPreds);
console.log("3. BLEND  -  superposition (local affine) + modulation (membership over g)");
console.log("   readout: each region's small-scale slope tracks the large scale = modulation");
for (let i = 0; i < K; i++) {
  const c = centers[i]!;
  const slope = localBetas[i]![2];
  console.log(`     region g~=${c.toFixed(2).padStart(5)}   h-slope ${slope.toFixed(3).padStart(7)}   (B*g ~= ${(B * c).toFixed(3)})`);
}
console.log(`   RMSE vs DNS: ${blendRMSE.toFixed(4)}   (linear was ${linRMSE.toFixed(4)})\n`);

// ===== 4. SELF-CHECK =====
const slopes = localBetas.map((b) => b[2]);
let increasing = true;
for (let i = 1; i < K; i++) if (slopes[i]! <= slopes[i - 1]!) increasing = false;
const checks: Array<[string, boolean]> = [
  ["linear recovers superposition slope (g ~= A)", Math.abs(linBeta[1] - A) < 0.1],
  ["linear cannot see modulation (h slope ~= 0)", Math.abs(linBeta[2]) < 0.1],
  ["blend beats linear (RMSE < half)", blendRMSE < 0.5 * linRMSE],
  ["modulation recovered (h-slope rises with g)", increasing],
  ["high region slope tracks B (> 0.3)", slopes[K - 1]! > 0.3],
];
let ok = true;
for (const [label, pass] of checks) {
  console.log(`   ${pass ? "ok  " : "FAIL"} ${label}`);
  if (!pass) ok = false;
}
console.log(ok ? "\nPASS" : "\nFAIL");
if (!ok) process.exitCode = 1;
