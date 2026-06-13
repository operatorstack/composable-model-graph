# Changelog

Each entry records the reasoning and the domain influence behind a change, not
just the diff (see [docs/development.md](docs/development.md)). Format per entry:
Change / Why / Domain influence / Languages.

## [Unreleased]

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
