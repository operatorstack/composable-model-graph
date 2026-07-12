# Changelog

Each entry records the reasoning and the domain influence behind a change, not
just the diff (see [docs/development.md](docs/development.md)). Format per entry:
Change / Why / Domain influence / Languages.

## [Unreleased]

### estimation: decode the best path through per-step candidates
- **Change:** a new `estimation` package in both languages. `CandidateState`
  (id, score, optional value), a `TransitionCost` callback, `decodePath`
  (full-path / Viterbi) and `decodePathFixedLag` (causal; lag 0 = greedy
  filtering, lag >= T-1 == full decode). The result is inspectable: per-step
  chosen state, its score, the transition cost paid, the cumulative score, and
  the total path score. `transitionWeight = 0` degenerates to the independent
  per-step argmax. Zero dependencies (not even `core`); stdlib-only in Python.
  Added `docs/06-sequential-estimation.md`.
- **Why:** many sequential problems reduce to "each step has scored candidates,
  and consecutive choices should cohere" — tracking a state through noise,
  labeling a hidden-state sequence, correcting a typed string. The library had a
  primitive for per-step evaluation but none for the *sequence-level* best
  answer.
- **Domain influence:** dynamic programming on a trellis (Viterbi decoding,
  hidden Markov models, fixed-lag smoothing from estimation / control).
- **Languages:** typescript, python.

### Examples 13-15: estimation in three unrelated fields
- **Change:** dual-language examples `13-track-snapping` (a noisy 1-D sensor
  snapped to a grid), `14-hidden-regime` (a machine's hidden operating regime
  inferred from sensor symbols), and `15-typo-decode` (a mistyped word recovered
  via keyboard neighbours + an allowed-bigram model). Each contrasts
  `transitionWeight` 0 vs 1 (and 13 shows fixed-lag), is deterministic, and ships
  `expected-output.txt` with byte-identical TS/Python output.
- **Why:** the use cases that pulled the primitive, and proof that it is
  domain-independent — three fields, one decoder, no shared machinery.
- **Domain influence:** tracking, hidden-state inference, text decoding.
- **Languages:** typescript, python.

### Python parity: evaluation, feedback, comparison
- **Change:** the Python core gains `Evaluator` / `EvaluationResult` / `Evidence` /
  `FeedbackResolver` / `FeedbackAction` (with `create_evaluator` / `create_feedback_resolver`),
  `GraphRun.evaluation` / `.feedback`, `TraceStep.started_at` / `.finished_at`, and
  `compare_runs` (+ `RunComparison`, `SignalDelta`); the `evaluators` and `feedback`
  packages are real ports (threshold, numeric-error, exact-match, composite, deep-equal;
  default and threshold resolvers), same names, defaults, and messages as TypeScript.
  Python `ModelGraph.run` now invokes an attached evaluator/feedback resolver, and its
  `run_id` defaults to a generated UUID (parity with the TypeScript runner). Ports
  examples `05-evaluators` and `06-skill-routing` to Python.
- **Why:** the parity rule — the TypeScript side has shipped evaluation/feedback/compare
  from the start; the Python packages were explicit placeholders promising this port.
  Every Python graph can now be scored, acted on, and compared, not just run.
- **Domain influence:** evaluation-first design (measurement before action) + the
  neural feedback lane.
- **Languages:** python (typescript unchanged; it already ships these).

### DAG runner in TypeScript (Connection)
- **Change:** `createModelGraph` accepts `connections?: Connection[]` and runs an
  arbitrary DAG (Kahn topological order; a merge node receives the array of its
  predecessors' outputs; a cycle throws; a connection naming an unknown transform id
  throws). No connections = the existing linear run, unchanged. Evaluation and feedback
  apply to DAG runs too. Identical semantics to the Python runner, which gains the same
  clear error for an unknown connection id. New dual example `12-fan-out-merge`.
- **Why:** the parity rule, the other direction — Python has run DAGs since the
  restructure ("linearity is a default, not a limit"); TypeScript now honors the same
  sentence. Pulled concretely by example 12 (fan-out to two estimators, then reconcile).
- **Domain influence:** dependency-DAG scheduling / dataflow graphs.
- **Languages:** typescript (new), python (unknown-id error-message alignment).

### Useful-flow score (Phi = Q / C)
- **Change:** `usefulFlowScore` plus `combineCost` / `combineQuality` in `core` (beside
  `compareRuns`): score a run or configuration by useful output per unit cost.
- **Why:** to compare configurations by whether they earn their cost (the simulation's
  solved-per-dollar), the cheapest honest "which one is best?".
- **Domain influence:** network flow / operations research (useful flow to an accepted sink).
- **Languages:** typescript, python.

### Sensitivity (finite-difference gradient)
- **Change:** `sensitivity` plus `rankSensitivity` in `math` (beside `errorSensitivity`):
  estimate d(objective)/d(knob) and rank knobs by impact, "what to tune next".
- **Why:** once a config is scored, decide which knob to turn; the numerical complement to
  the analytic `errorSensitivity`.
- **Domain influence:** calculus / neural gradient / control-theory sensitivity.
- **Languages:** typescript, python.

### Example 08: system simulation
- **Change:** `08-system-simulation` in both languages: sweep a parameterized pipeline, score
  each config by Phi, pick the best, rank knobs by sensitivity. TS and Python output is
  byte-identical; each ships a self-check + `expected-output.txt`. Added
  `docs/05-useful-flow-and-sensitivity.md` (the math / principle, framed cross-domain).
- **Why:** the use case that pulled the two primitives; the cmg-native simulation (config
  what-if + sensitivity), distinct from intelligence-flow's flow / min-cut lane.
- **Domain influence:** network flow + gradient, composed.
- **Languages:** typescript, python.

### Example 09: best time to implement
- **Change:** `09-best-time-to-implement` in both languages: a backlog modeled as a
  dependency graph that schedules itself. Readiness (deps met), Phi = value / cost over
  the ready set, the longest-cost critical path, and sensitivity for "what unblocks the
  most". A cmg `ModelGraph` (`assess -> classify -> prioritize`) produces the plan; the
  `assess` stage is the seam where a model later judges state from evidence. TS and Python
  output is byte-identical; ships a self-check + `expected-output.txt`.
- **Why:** the "best time to implement, not a flat to-do list" use case; reuses
  `usefulFlowScore` + `rankSensitivity` on a task graph, proven deterministically before
  any AI is embedded.
- **Domain influence:** dependency-DAG scheduling (critical path) + useful flow + gradient.
- **Languages:** typescript, python.

### Example 11: recover a hidden parameter (inverse problem)
- **Change:** `11-inverse-parameter` (python): recover an unknown physical constant (thermal
  conductivity k) from noisy data + a closed-form forward model, using cmg `sensitivity`
  (dLoss/dk) + gradient descent. No neural network, no autodiff. One evaluation is a cmg
  `ModelGraph` (forward -> residual -> loss); ships a self-check + `expected-output.txt`.
- **Why:** show the inverse-problem core (the parameter-recovery half of an inverse PINN) needs no
  network when a forward model exists; a second use case for `sensitivity` after the planner, and it
  surfaces a candidate primitive (an iterative recover / fit loop) without adding it to core yet.
- **Domain influence:** classical inverse problems / parameter estimation (least squares) + the gradient lane.
- **Languages:** python (typescript parity to follow).

### Restructure into a dual-language library
- **Change:** the repository is now organized as `docs/` (language-agnostic) +
  `typescript/` (the existing pnpm workspace, moved as a unit so the build is
  unchanged) + `python/` (a new package: a real, dependency-free `core` and
  `math.sigmoid`, with `evaluators` / `feedback` scaffolded for parity). Added
  `docs/philosophy.md`, `docs/development.md`, `docs/structure.md`, and this
  changelog.
- **Why:** the library is the software lane of the model-graph stack and needs to
  be usable from both TypeScript and Python, by a computer scientist or an
  aerospace engineer, before features are added. Restructure first, features next.
- **Domain influence:** software/library design and accessibility (the
  curse-of-expertise guard: general tools a specialist can reach for after a small
  investigation).
- **Languages:** typescript (moved, unchanged), python (new core + math; rest
  scaffolded). Parity is the rule from here on.

### Notes
- Linearity is reframed as a default, not a design limit: the runner is sequential
  by default and a general DAG when a use case needs one. DAG/loop/feedback shapes
  land later as use-case-pulled features, in both languages.
