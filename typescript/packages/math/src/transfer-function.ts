import type { Transform } from "@composable-model-graph/core";

/** Configuration for a {@link TransferFunction}. */
export interface TransferFunctionConfig {
  id: string;
  name: string;
  /** Numerator coefficients [b0, b1, ..., bnb] of B(q). At least b0 is required. */
  b: number[];
  /** Denominator coefficients [a1, ..., ana] of A(q); a0 = 1 is implicit. Empty = FIR. */
  a: number[];
}

/**
 * A single-input single-output linear time-invariant (LTI) filter expressed as a
 * rational transfer function and run as a core {@link Transform}.
 *
 *   G(q) = B(q) / A(q),   A(q) = 1 + a1 q^-1 + ...,   B(q) = b0 + b1 q^-1 + ...
 *
 * which is the linear difference equation (the filter starts from rest, i.e. inputs
 * and outputs are zero for t < 0):
 *
 *   y(t) = b0 u(t) + b1 u(t-1) + ... + bnb u(t-nb)
 *          - a1 y(t-1) - ... - ana y(t-na)
 *
 * This is the forward pass only (an IIR filter applied to its input sequence); there
 * is no backprop here. It is the domain-free *dynamical* counterpart of
 * {@link DenseLayer}: DenseLayer is a static map, TransferFunction carries memory.
 * The coefficients b, a are exactly what a least-squares ARX fit recovers from
 * input/output data (linear in the parameters, no autodiff required).
 */
export class TransferFunction implements Transform<number[], number[]> {
  readonly id: string;
  readonly name: string;
  readonly b: number[];
  readonly a: number[];

  constructor(config: TransferFunctionConfig) {
    if (config.b.length === 0) {
      throw new Error(
        "TransferFunction requires at least one numerator coefficient (b0)",
      );
    }
    this.id = config.id;
    this.name = config.name;
    this.b = config.b;
    this.a = config.a;
  }

  run(input: number[]): number[] {
    const T = input.length;
    const y = new Array<number>(T).fill(0);
    for (let t = 0; t < T; t++) {
      let acc = 0;
      for (let j = 0; j < this.b.length; j++) {
        const k = t - j;
        if (k >= 0) acc += this.b[j]! * input[k]!;
      }
      for (let i = 0; i < this.a.length; i++) {
        const k = t - (i + 1);
        if (k >= 0) acc -= this.a[i]! * y[k]!;
      }
      y[t] = acc;
    }
    return y;
  }
}

/** Convenience factory mirroring the other `create*` helpers. */
export function createTransferFunction(config: TransferFunctionConfig): TransferFunction {
  return new TransferFunction(config);
}
