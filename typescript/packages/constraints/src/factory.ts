import type { Constraint } from "./types.js";

/** Create a named constraint without assigning meaning to its findings. */
export function createConstraint<T, F>(
  config: Constraint<T, F>,
): Constraint<T, F> {
  return { ...config };
}
