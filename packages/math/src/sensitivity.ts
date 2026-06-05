import type { ActivationFunction } from "./activations.js";

/**
 * The explicit feedback signal of a single prediction.
 *
 *   error E       = target - prediction      (how wrong the output is)
 *   sensitivity f'= local slope of f         (how much change matters)
 *   update signal = E * f'                    (the correction pressure)
 *
 * This is NOT a weight update. It only makes the signal that drives a weight
 * update explicit and inspectable.
 */
export interface SensitivitySignal {
  /** The prediction under analysis (an activation output `y = f(x)`). */
  prediction: number;
  /** The desired value. */
  target: number;
  /** Signed error `E = target - prediction`. */
  error: number;
  /** Local sensitivity `f'`, derived from the activation output. */
  sensitivity: number;
  /** Correction pressure `E * f'`. */
  updateSignal: number;
}

/**
 * Compute the error sensitivity signal for a prediction produced by `activation`.
 *
 * The sensitivity is taken from the activation's output identity
 * (`derivativeFromOutput`), which is the form available right after a forward
 * pass — exactly the value a trace step already carries.
 */
export function errorSensitivity(
  activation: ActivationFunction,
  prediction: number,
  target: number,
): SensitivitySignal {
  const error = target - prediction;
  const sensitivity = activation.derivativeFromOutput(prediction);
  const updateSignal = error * sensitivity;
  return { prediction, target, error, sensitivity, updateSignal };
}
