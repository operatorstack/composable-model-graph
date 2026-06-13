/**
 * Loss functions over prediction / target vectors.
 *
 * `compute` returns a scalar error; `derivative` returns the gradient of the
 * loss with respect to each prediction component.
 */
export interface LossFunction {
  id: string;
  name: string;
  compute(prediction: number[], target: number[]): number;
  derivative(prediction: number[], target: number[]): number[];
}

function assertSameLength(prediction: number[], target: number[]): void {
  if (prediction.length !== target.length) {
    throw new Error(
      `prediction and target must have the same length (got ${prediction.length} and ${target.length})`,
    );
  }
}

/**
 * Mean squared error.
 *
 *   E       = (1/n) * sum( (pred_i - target_i)^2 )
 *   dE/dp_i = (2/n) * (pred_i - target_i)
 */
export const meanSquaredError: LossFunction = {
  id: "mean-squared-error",
  name: "Mean Squared Error",
  compute(prediction: number[], target: number[]): number {
    assertSameLength(prediction, target);
    const n = prediction.length;
    if (n === 0) {
      return 0;
    }
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const diff = (prediction[i] ?? 0) - (target[i] ?? 0);
      sum += diff * diff;
    }
    return sum / n;
  },
  derivative(prediction: number[], target: number[]): number[] {
    assertSameLength(prediction, target);
    const n = prediction.length;
    if (n === 0) {
      return [];
    }
    const gradient = new Array<number>(n);
    for (let i = 0; i < n; i++) {
      gradient[i] = (2 / n) * ((prediction[i] ?? 0) - (target[i] ?? 0));
    }
    return gradient;
  },
};
