/**
 * Scalar activation functions and their derivatives.
 *
 * Each activation exposes `forward(x)` and `derivative(x)` so that downstream
 * code can read both the value and its local sensitivity at `x`.
 */
export interface ActivationFunction {
  id: string;
  name: string;
  forward(x: number): number;
  derivative(x: number): number;
}

/**
 * Logistic sigmoid.
 *
 *   f(x)  = 1 / (1 + e^-x)
 *   f'(x) = f(x) * (1 - f(x))
 */
export const sigmoid: ActivationFunction = {
  id: "sigmoid",
  name: "Sigmoid",
  forward(x: number): number {
    return 1 / (1 + Math.exp(-x));
  },
  derivative(x: number): number {
    const f = this.forward(x);
    return f * (1 - f);
  },
};

/**
 * Rectified linear unit.
 *
 *   f(x)  = max(0, x)
 *   f'(x) = x > 0 ? 1 : 0
 */
export const relu: ActivationFunction = {
  id: "relu",
  name: "ReLU",
  forward(x: number): number {
    return x > 0 ? x : 0;
  },
  derivative(x: number): number {
    return x > 0 ? 1 : 0;
  },
};

/**
 * Identity (linear) activation.
 *
 *   f(x)  = x
 *   f'(x) = 1
 */
export const identity: ActivationFunction = {
  id: "identity",
  name: "Identity",
  forward(x: number): number {
    return x;
  },
  derivative(_x: number): number {
    return 1;
  },
};
