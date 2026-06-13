import { createEvaluator, createModelGraph } from "@composable-model-graph/core";
import {
  DenseLayer,
  errorSensitivity,
  meanSquaredError,
  sigmoid,
} from "@composable-model-graph/math";
import { numericErrorEvaluator } from "@composable-model-graph/evaluators";
import { defaultFeedbackResolver } from "@composable-model-graph/feedback";

/**
 * Example 03 — Error Sensitivity Feedback
 *
 *   Input x
 *     ↓
 *   Transform f(x)
 *     ↓
 *   Prediction ŷ
 *     ↓
 *   Error E = y - ŷ
 *     ↓
 *   Sensitivity f'(x)
 *     ↓
 *   Update Signal = E · f'(x)
 *     ↓
 *   Feedback Action
 *
 * This is NOT training. It only makes the feedback signal explicit:
 *
 *   error       = how wrong the output is
 *   sensitivity = how much change matters
 *   E · f'      = the correction pressure
 */

// Reuse the neural graph from example 02 so the prediction is real, not magic.
const hiddenLayer = new DenseLayer({
  id: "dense-4-2",
  name: "Dense 4 -> 2",
  inputSize: 4,
  outputSize: 2,
  weights: [
    [0.1, -0.2],
    [0.2, 0.1],
    [-0.1, 0.05],
    [0.05, 0.2],
  ],
  bias: [0, 0],
  activation: sigmoid,
});

const outputLayer = new DenseLayer({
  id: "dense-2-1",
  name: "Dense 2 -> 1",
  inputSize: 2,
  outputSize: 1,
  weights: [[0.3], [-0.4]],
  bias: [0.1],
  activation: sigmoid,
});

const graph = createModelGraph<number[], number[]>({
  id: "error-sensitivity",
  name: "Error Sensitivity",
  transforms: [hiddenLayer, outputLayer],
  evaluator: createEvaluator<number[], number[]>({
    id: "mse",
    name: "Mean Squared Error",
    evaluate: (prediction, target, context) =>
      numericErrorEvaluator({ passThreshold: 0.05 }).evaluate(
        meanSquaredError.compute(prediction, target),
        meanSquaredError.compute(prediction, target),
        context,
      ),
  }),
  feedbackResolver: defaultFeedbackResolver<number[], number[]>(),
});

const target = [1];
const run = await graph.run([1, 2, 4, 5], { target });

// The prediction is itself a sigmoid output, so its local sensitivity is the
// output identity f'(x) = ŷ(1 - ŷ).
const prediction = run.output[0] ?? 0;
const signal = errorSensitivity(sigmoid, prediction, target[0] ?? 0);

console.log("input x:        ", prediction);
console.log("target y:       ", target[0]);
console.log("prediction ŷ:   ", prediction);
console.log("");
console.log("error E:        ", signal.error);
console.log("sigmoid f′:     ", signal.sensitivity);
console.log("update signal:  ", signal.updateSignal, "(= E · f′)");
console.log("");
console.log("meaning:");
console.log("  error tells us how wrong the output is");
console.log("  f′ tells us how sensitive the transform is");
console.log("  E · f′ gives the correction pressure");
console.log("");
console.log("evaluation:     ", JSON.stringify(run.evaluation));
console.log("feedback:       ", JSON.stringify(run.feedback));
