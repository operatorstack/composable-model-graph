import type { Transform } from "@composable-model-graph/core";

import type { ActivationFunction } from "./activations.js";

/** Configuration for a {@link DenseLayer}. */
export interface DenseLayerConfig {
  id: string;
  name: string;
  /** Number of input features. */
  inputSize: number;
  /** Number of output units. */
  outputSize: number;
  /** Weight matrix shaped `[inputSize][outputSize]`. */
  weights: number[][];
  /** Bias vector of length `outputSize`. */
  bias: number[];
  /** Activation applied element-wise to each unit's pre-activation sum. */
  activation: ActivationFunction;
}

/**
 * A fully-connected layer expressed as a core {@link Transform}.
 *
 *   output[j] = activation( sum_i( input[i] * weights[i][j] ) + bias[j] )
 *
 * This is the forward pass only. There is no backprop here; derivative
 * utilities live on {@link ActivationFunction} and the loss functions.
 */
export class DenseLayer implements Transform<number[], number[]> {
  readonly id: string;
  readonly name: string;
  readonly inputSize: number;
  readonly outputSize: number;
  readonly weights: number[][];
  readonly bias: number[];
  readonly activation: ActivationFunction;

  constructor(config: DenseLayerConfig) {
    if (config.weights.length !== config.inputSize) {
      throw new Error(
        `weights must have inputSize (${config.inputSize}) rows, got ${config.weights.length}`,
      );
    }
    for (const [i, row] of config.weights.entries()) {
      if (row.length !== config.outputSize) {
        throw new Error(
          `weights row ${i} must have outputSize (${config.outputSize}) columns, got ${row.length}`,
        );
      }
    }
    if (config.bias.length !== config.outputSize) {
      throw new Error(
        `bias must have outputSize (${config.outputSize}) entries, got ${config.bias.length}`,
      );
    }

    this.id = config.id;
    this.name = config.name;
    this.inputSize = config.inputSize;
    this.outputSize = config.outputSize;
    this.weights = config.weights;
    this.bias = config.bias;
    this.activation = config.activation;
  }

  run(input: number[]): number[] {
    if (input.length !== this.inputSize) {
      throw new Error(
        `expected input of length ${this.inputSize}, got ${input.length}`,
      );
    }

    const output = new Array<number>(this.outputSize);
    for (let j = 0; j < this.outputSize; j++) {
      let sum = this.bias[j] ?? 0;
      for (let i = 0; i < this.inputSize; i++) {
        const weight = this.weights[i]?.[j] ?? 0;
        sum += (input[i] ?? 0) * weight;
      }
      output[j] = this.activation.forward(sum);
    }
    return output;
  }
}

/** Convenience factory mirroring the other core `create*` helpers. */
export function createDenseLayer(config: DenseLayerConfig): DenseLayer {
  return new DenseLayer(config);
}
