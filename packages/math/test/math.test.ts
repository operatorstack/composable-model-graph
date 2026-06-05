import { describe, expect, it } from "vitest";

import {
  DenseLayer,
  identity,
  meanSquaredError,
  relu,
  sigmoid,
} from "@composable-model-graph/math";

describe("sigmoid", () => {
  it("forward computes the logistic function", () => {
    expect(sigmoid.forward(0)).toBeCloseTo(0.5, 12);
    expect(sigmoid.forward(2)).toBeCloseTo(1 / (1 + Math.exp(-2)), 12);
  });

  it("derivative equals f(x) * (1 - f(x))", () => {
    // f(0) = 0.5 -> f'(0) = 0.25
    expect(sigmoid.derivative(0)).toBeCloseTo(0.25, 12);
    const f = sigmoid.forward(1.3);
    expect(sigmoid.derivative(1.3)).toBeCloseTo(f * (1 - f), 12);
  });
});

describe("relu", () => {
  it("forward clamps negatives to zero", () => {
    expect(relu.forward(3)).toBe(3);
    expect(relu.forward(-2)).toBe(0);
    expect(relu.forward(0)).toBe(0);
  });

  it("derivative is 1 for positive and 0 otherwise", () => {
    expect(relu.derivative(3)).toBe(1);
    expect(relu.derivative(-2)).toBe(0);
    expect(relu.derivative(0)).toBe(0);
  });
});

describe("identity", () => {
  it("forward returns its input", () => {
    expect(identity.forward(7)).toBe(7);
    expect(identity.forward(-4)).toBe(-4);
  });

  it("derivative is always 1", () => {
    expect(identity.derivative(7)).toBe(1);
    expect(identity.derivative(-4)).toBe(1);
  });
});

describe("meanSquaredError", () => {
  it("computes the mean of squared differences", () => {
    // diffs: (3-1)=2, (5-1)=4 -> (4 + 16) / 2 = 10
    expect(meanSquaredError.compute([3, 5], [1, 1])).toBe(10);
    expect(meanSquaredError.compute([1, 1], [1, 1])).toBe(0);
  });

  it("derivative is (2/n)(pred - target) per component", () => {
    // n = 2 -> (2/2) * diff = diff
    expect(meanSquaredError.derivative([3, 5], [1, 1])).toEqual([2, 4]);
  });
});

describe("DenseLayer", () => {
  it("forward applies weights, bias, and activation", () => {
    const layer = new DenseLayer({
      id: "dense",
      name: "Dense 2->1",
      inputSize: 2,
      outputSize: 1,
      weights: [[0.5], [0.5]],
      bias: [1],
      activation: identity,
    });

    // sum = 2*0.5 + 4*0.5 + 1 = 4, identity -> 4
    expect(layer.run([2, 4])).toEqual([4]);
  });

  it("produces one output per unit with multiple outputs", () => {
    const layer = new DenseLayer({
      id: "dense",
      name: "Dense 2->2",
      inputSize: 2,
      outputSize: 2,
      // unit 0: 1*x0 + 0*x1, unit 1: 0*x0 + 1*x1
      weights: [
        [1, 0],
        [0, 1],
      ],
      bias: [0, 0],
      activation: relu,
    });

    expect(layer.run([3, -5])).toEqual([3, 0]);
  });

  it("throws on shape mismatch", () => {
    expect(
      () =>
        new DenseLayer({
          id: "bad",
          name: "Bad",
          inputSize: 2,
          outputSize: 1,
          weights: [[0.5]],
          bias: [0],
          activation: identity,
        }),
    ).toThrow();
  });
});
