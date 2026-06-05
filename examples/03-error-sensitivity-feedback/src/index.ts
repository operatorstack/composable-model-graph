import { createEvaluator, createModelGraph } from "@composable-model-graph/core";
import { sigmoid } from "@composable-model-graph/math";
import { defaultFeedbackResolver } from "@composable-model-graph/feedback";

/**
 * Example 03 — Error Sensitivity Feedback
 *
 *   x -> f(x) -> y_hat -> error -> f'(x) -> feedback
 *
 * This is NOT training. It only exposes the feedback signal so the relationship
 * between error and sensitivity is visible:
 *
 *   update signal = error * f'(x)
 */

const x = 2;
const target = 1;

const sigmoidForward = {
  id: "sigmoid-forward",
  name: "Sigmoid Forward",
  run: (input: number) => sigmoid.forward(input),
};

// Evaluate the signed error E = y - y_hat. We expose it via the optional
// numeric `error` field (storing the magnitude) and a message with the sign.
const signedErrorEvaluator = createEvaluator<number, number>({
  id: "signed-error",
  name: "Signed Error",
  evaluate: (prediction, expected) => {
    const error = expected - prediction;
    return {
      status: Math.abs(error) <= 0.1 ? "pass" : "fail",
      error: Math.abs(error),
      messages: [`E = y - y_hat = ${error}`],
    };
  },
});

const graph = createModelGraph<number, number>({
  id: "error-sensitivity",
  name: "Error Sensitivity",
  transforms: [sigmoidForward],
  evaluator: signedErrorEvaluator,
  feedbackResolver: defaultFeedbackResolver<number, number>(),
});

const run = await graph.run(x, { target });

const yHat = run.output;
const error = target - yHat;
const derivative = sigmoid.derivative(x);
const updateSignal = error * derivative;

console.log("input x:        ", x);
console.log("sigmoid f(x):   ", yHat);
console.log("target y:       ", target);
console.log("error (y - y_hat):", error);
console.log("derivative f'(x):", derivative);
console.log("update signal:  ", updateSignal, "(= error * f'(x))");
console.log("\nevaluation:     ", JSON.stringify(run.evaluation));
console.log("feedback:       ", JSON.stringify(run.feedback));
