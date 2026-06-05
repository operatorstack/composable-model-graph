export type { ActivationFunction } from "./activations.js";
export { sigmoid, relu, identity } from "./activations.js";
export type { LossFunction } from "./losses.js";
export { meanSquaredError } from "./losses.js";
export type { DenseLayerConfig } from "./dense-layer.js";
export { DenseLayer, createDenseLayer } from "./dense-layer.js";
export type { SensitivitySignal } from "./sensitivity.js";
export { errorSensitivity } from "./sensitivity.js";
