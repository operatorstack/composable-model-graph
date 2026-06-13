# Changelog

Each entry records the reasoning and the domain influence behind a change, not
just the diff (see [docs/development.md](docs/development.md)). Format per entry:
Change / Why / Domain influence / Languages.

## [Unreleased]

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
