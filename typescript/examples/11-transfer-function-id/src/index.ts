import { TransferFunction, meanSquaredError } from "@composable-model-graph/math";

/**
 * Example 11 - Transfer-function (ARX) system identification by least squares
 *
 * The dynamical counterpart of example 10. The paper "Deep learning with transfer
 * functions" (Piga, Forgione, Mejari, 2021) makes an LTI transfer function
 * G(q)=B(q)/A(q) differentiable so it can be trained by back-propagation inside a
 * deep net. For the LINEAR case none of that is needed: the coefficients a, b enter
 * the one-step-ahead model linearly, so they are recovered by ordinary least squares
 * (the classic Ljung method) - convex, closed-form, deterministic, no autodiff.
 *
 * This example:
 *   1. defines a true LTI system as a cmg `TransferFunction`,
 *   2. excites it with a multisine and records input/output,
 *   3. identifies a, b by least squares (ARX regression),
 *   4. simulates the identified filter on fresh input and scores fit vs the truth.
 *
 * Domain-free: the same shape identifies any SISO linear dynamical system.
 */

// ---- true system: y(t) = b0 u(t) + b1 u(t-1) - a1 y(t-1) - a2 y(t-2) ----
const trueB = [1.0, 0.5]; // B(q) = 1.0 + 0.5 q^-1
const trueA = [-1.5, 0.7]; // A(q) = 1 - 1.5 q^-1 + 0.7 q^-2
const trueSys = new TransferFunction({ id: "true", name: "true G(q)", b: trueB, a: trueA });

const nb1 = trueB.length; // numerator taps (b0..bnb)
const na = trueA.length; // denominator taps (a1..ana)
const p = nb1 + na; // number of parameters to identify

// deterministic, persistently-exciting input (multisine, 6 frequencies)
function multisine(T: number, freqs: number[], phase: number): number[] {
  const u = new Array<number>(T).fill(0);
  for (let t = 0; t < T; t++) {
    let s = 0;
    for (const w of freqs) s += Math.sin(w * t + phase);
    u[t] = s;
  }
  return u;
}
const T = 400;
const freqs = [0.17, 0.41, 0.73, 1.19, 1.83, 2.57];
const u = multisine(T, freqs, 0);
const y = trueSys.run(u);

// ---- ARX least squares: y(t) = phi(t).theta,  theta = [b0..bnb, a1..ana] ----
// phi(t) = [u(t), ..., u(t-nb), -y(t-1), ..., -y(t-na)]  (linear in theta)
function phiAt(t: number, uu: number[], yy: number[]): number[] {
  const row: number[] = [];
  for (let j = 0; j < nb1; j++) row.push(uu[t - j]!);
  for (let i = 1; i <= na; i++) row.push(-yy[t - i]!);
  return row;
}
function solveLinear(Ain: number[][], bin: number[]): number[] {
  const n = bin.length;
  const A = Ain.map((r) => r.slice());
  const b = bin.slice();
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(A[r]![col]!) > Math.abs(A[piv]![col]!)) piv = r;
    }
    const tA = A[col]!; A[col] = A[piv]!; A[piv] = tA;
    const tB = b[col]!; b[col] = b[piv]!; b[piv] = tB;
    const pivRow = A[col]!;
    const diag = pivRow[col]!;
    for (let r = col + 1; r < n; r++) {
      const row = A[r]!;
      const f = row[col]! / diag;
      for (let c = col; c < n; c++) row[c] = row[c]! - f * pivRow[c]!;
      b[r] = b[r]! - f * b[col]!;
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    const row = A[i]!;
    let s = b[i]!;
    for (let c = i + 1; c < n; c++) s -= row[c]! * x[c]!;
    x[i] = s / row[i]!;
  }
  return x;
}

const start = Math.max(na, nb1 - 1);
const M: number[][] = Array.from({ length: p }, () => new Array<number>(p).fill(0));
const v = new Array<number>(p).fill(0);
for (let t = start; t < T; t++) {
  const phi = phiAt(t, u, y);
  const yt = y[t]!;
  for (let r = 0; r < p; r++) {
    const Mr = M[r]!;
    const phir = phi[r]!;
    for (let c = 0; c < p; c++) Mr[c] = Mr[c]! + phir * phi[c]!;
    v[r] = v[r]! + phir * yt;
  }
}
const theta = solveLinear(M, v);
const bHat = theta.slice(0, nb1);
const aHat = theta.slice(nb1);
const idSys = new TransferFunction({ id: "identified", name: "G_hat(q)", b: bHat, a: aHat });

// ---- evaluate on fresh input (different phase) ----
const uTest = multisine(T, freqs, 1.0);
const yTest = trueSys.run(uTest);
const yHat = idSys.run(uTest);
const simRMSE = Math.sqrt(meanSquaredError.compute(yHat, yTest));
const meanY = yTest.reduce((s, x) => s + x, 0) / yTest.length;
let num = 0, den = 0;
for (let t = 0; t < T; t++) {
  num += (yTest[t]! - yHat[t]!) ** 2;
  den += (yTest[t]! - meanY) ** 2;
}
const fit = 100 * (1 - Math.sqrt(num) / Math.sqrt(den));

const fmt = (xs: number[]): string => xs.map((x) => x.toFixed(4)).join(", ");
const rmseStr = simRMSE < 1e-9 ? "~0 (machine precision)" : simRMSE.toExponential(2);

console.log("1. TRUE SYSTEM  -  an LTI transfer function G(q) = B(q)/A(q)");
console.log(`   b (numerator)  : [${fmt(trueB)}]`);
console.log(`   a (denominator): [${fmt(trueA)}]   (poles |.| = ${Math.sqrt(0.7).toFixed(3)} < 1, stable)\n`);

console.log("2. IDENTIFY  -  ARX least squares (linear in a,b -> closed form, no autodiff)");
console.log(`   recovered b: [${fmt(bHat)}]`);
console.log(`   recovered a: [${fmt(aHat)}]\n`);

console.log("3. SIMULATE  -  identified filter on fresh input vs the true system");
console.log(`   RMSE: ${rmseStr}    fit: ${fit.toFixed(4)}%\n`);

// ---- 4. SELF-CHECK ----
const maxCoeffErr = Math.max(
  ...bHat.map((x, i) => Math.abs(x - trueB[i]!)),
  ...aHat.map((x, i) => Math.abs(x - trueA[i]!)),
);
const checks: Array<[string, boolean]> = [
  ["recovered b matches true b", bHat.every((x, i) => Math.abs(x - trueB[i]!) < 1e-6)],
  ["recovered a matches true a", aHat.every((x, i) => Math.abs(x - trueA[i]!) < 1e-6)],
  ["coefficient error is ~0", maxCoeffErr < 1e-6],
  ["simulation RMSE ~ 0", simRMSE < 1e-6],
  ["fit > 99.99%", fit > 99.99],
];
let ok = true;
for (const [label, pass] of checks) {
  console.log(`   ${pass ? "ok  " : "FAIL"} ${label}`);
  if (!pass) ok = false;
}
console.log(ok ? "\nPASS" : "\nFAIL");
if (!ok) process.exitCode = 1;
