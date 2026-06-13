import { createEvaluator, createModelGraph } from "@composable-model-graph/core";
import { DenseLayer, meanSquaredError, sigmoid } from "@composable-model-graph/math";
import { numericErrorEvaluator } from "@composable-model-graph/evaluators";
import { defaultFeedbackResolver } from "@composable-model-graph/feedback";

/**
 * Example 02 — Neural Network Graph
 *
 *   4 inputs
 *     -> DenseLayer(4 -> 2) + sigmoid
 *     -> DenseLayer(2 -> 1) + sigmoid
 *     -> prediction
 *     -> MSE / error
 *     -> feedback
 *
 * This is the first mathematical proof of the primitive: a neural forward pass
 * expressed entirely as core transforms, with error-based evaluation and a
 * feedback action attached to the same run.
 */

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

const errorScore = numericErrorEvaluator({
  passThreshold: 0.05,
  partialThreshold: 0.25,
});

// Turn the prediction vector into a scalar MSE, then reuse the generic
// numeric-error evaluator to classify it.
const mseEvaluator = createEvaluator<number[], number[]>({
  id: "mse",
  name: "Mean Squared Error",
  evaluate: (prediction, target, context) => {
    const error = meanSquaredError.compute(prediction, target);
    return errorScore.evaluate(error, error, context);
  },
});

const graph = createModelGraph<number[], number[]>({
  id: "neural-network-graph",
  name: "Neural Network Graph",
  transforms: [hiddenLayer, outputLayer],
  evaluator: mseEvaluator,
  feedbackResolver: defaultFeedbackResolver<number[], number[]>(),
});

const input = [1, 2, 4, 5];
const target = [1];

const run = await graph.run(input, { target });

console.log("input:      ", JSON.stringify(run.input));
console.log("prediction: ", JSON.stringify(run.output));
console.log("\ntrace:");
for (const step of run.trace) {
  console.log(
    `  ${step.transformName}: ${JSON.stringify(step.input)} -> ${JSON.stringify(step.output)}`,
  );
}
console.log("\ntarget:     ", JSON.stringify(target));
console.log("error:      ", run.evaluation?.error);
console.log("evaluation: ", JSON.stringify(run.evaluation));
console.log("feedback:   ", JSON.stringify(run.feedback));
