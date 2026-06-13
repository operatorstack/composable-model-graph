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
 * pass, exactly the value a trace step already carries.
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

/**
 * Finite-difference sensitivity: how much an objective moves when you nudge a knob.
 *
 * The principle (calculus / control / the neural gradient). The sensitivity of an
 * objective f to a parameter x is its derivative df/dx, the local slope. When f is
 * a black box (you can evaluate it but not differentiate it), the central
 * finite-difference estimate is the discrete stand-in:
 *
 *   df/dx ~= ( f(x + h) - f(x - h) ) / (2h)
 *
 * This is the same quantity `errorSensitivity` reads analytically for an activation
 * (f' from the output), the same "which parameter matters most" a neural net
 * follows downhill, and the same "plant sensitivity" a control engineer reads to
 * see which input binds the response. It needs only the ability to evaluate f, so
 * it works on any objective, including one computed by running a graph.
 */
export interface Sensitivity {
  /** The knob value where the slope was measured. */
  at: number;
  /** The objective value there, f(x). */
  value: number;
  /** Estimated df/dx (central finite difference). */
  gradient: number;
}

/** Estimate df/dx for a scalar objective at `x` via central finite difference. */
export function sensitivity(
  objective: (x: number) => number,
  x: number,
  step = 1e-3,
): Sensitivity {
  const h = step === 0 ? 1e-3 : step;
  const value = objective(x);
  const gradient = (objective(x + h) - objective(x - h)) / (2 * h);
  return { at: x, value, gradient };
}

/** One knob's sensitivity, with its absolute magnitude as the ranking key. */
export interface KnobSensitivity {
  /** The knob's name. */
  name: string;
  /** Estimated d(objective)/d(knob) at the current point. */
  gradient: number;
  /** |gradient|, the ranking key. */
  magnitude: number;
}

/**
 * Rank knobs by how much each moves the objective at the current point.
 *
 * The objective takes the full set of knob values; each knob is perturbed in turn
 * by a central difference while the others are held fixed. The result is sorted by
 * |gradient| descending, so the front of the list answers "what to tune next": the
 * knob that moves the objective most per unit change. The sign tells you which way.
 */
export function rankSensitivity(
  knobs: Record<string, number>,
  objective: (knobs: Record<string, number>) => number,
  step = 1e-3,
): KnobSensitivity[] {
  const h = step === 0 ? 1e-3 : step;
  const ranked: KnobSensitivity[] = [];
  for (const name of Object.keys(knobs)) {
    const base = knobs[name] ?? 0;
    const up = { ...knobs, [name]: base + h };
    const down = { ...knobs, [name]: base - h };
    const gradient = (objective(up) - objective(down)) / (2 * h);
    ranked.push({ name, gradient, magnitude: Math.abs(gradient) });
  }
  ranked.sort((a, b) => b.magnitude - a.magnitude);
  return ranked;
}
