/**
 * Sequential state estimation over a trellis.
 *
 * At each step you have candidate states, each with a score. A transition cost
 * says how implausible it is to move from one step's state to the next's. The
 * decoder returns the path that maximizes total score minus the transitions it
 * pays for. This is the shared skeleton of Viterbi decoding, HMM inference, and
 * fixed-lag smoothing — with the probability story left optional.
 */

/** One candidate the sequence could be in at a given step. Higher score is better. */
export interface CandidateState {
  id: string;
  /** How well this state explains its step (e.g. a log-likelihood or -distance). */
  score: number;
  /** Optional payload; the library attaches no meaning to it. */
  value?: unknown;
}

/**
 * Cost of moving from `prev` (step t-1) to `next` (step t). Higher = less
 * plausible. `stepIndex` is the index of `next`'s step.
 */
export type TransitionCost = (
  prev: CandidateState,
  next: CandidateState,
  stepIndex: number,
) => number;

/** Options shared by the decoders. */
export interface DecodeOptions {
  /** Cost of each transition. Defaults to `() => 0` (transitions are free). */
  transitionCost?: TransitionCost;
  /**
   * Exchange rate between per-step score and coherence. Defaults to `1`.
   * `0` makes the decode the independent per-step argmax.
   */
  transitionWeight?: number;
}

/** The chosen state at one step, with the reasoning split exposed. */
export interface DecodedStep {
  stepIndex: number;
  state: CandidateState;
  stateId: string;
  /** The chosen state's own score. */
  score: number;
  /** Raw (unweighted) transition cost paid to enter this state; 0 at step 0. */
  transitionCost: number;
  /** Best path score through this step (weighted). */
  cumulativeScore: number;
}

/** A decoded path through the trellis. */
export interface DecodedPath {
  steps: DecodedStep[];
  /** Convenience: the chosen state id at each step. */
  stateIds: string[];
  /** `sum(score) - transitionWeight * sum(transitionCost)`. */
  totalScore: number;
}
