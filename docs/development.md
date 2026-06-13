# Development discipline

How features get built here. This is the mental model made explicit so it governs
the work (human or agent), and so the level of thought behind each feature is
visible. It is a companion to `philosophy.md`: philosophy says what the library is
for, this says how a change earns its place.

## The acceptance test for any feature

A change is ready when all of these hold:

1. **Pulled by a real use case.** A concrete present problem needs it. We do not
   pre-build a surface for an imagined future; that is how a general library
   becomes a domain-locked one. The use case comes first and pulls the smallest
   change into the core.
2. **Parity in both languages.** Every capability ships in TypeScript AND Python.
   Same names, same shape, same behavior. A feature that exists in only one
   language is not done.
3. **Simple capability, hidden theory.** The exposed API is something both a CS and
   an aerospace engineer understand on sight. If using it requires learning the
   theory first, redesign the surface.
4. **Core stays general.** No domain concept (payments, evals, agents, a company,
   a harness) enters the core. Domains live in examples or feature packages on top.
5. **Inspectable result.** The feature helps the user see what happened and what to
   change, not just produce a number.
6. **A CHANGELOG entry.** Every change adds one (see below), capturing the thinking,
   not just the diff.

## The two-engineers check

Before merging, ask: could a computer scientist and an aerospace engineer each use
this after a small investigation, without first absorbing the theory behind it? If
not, the surface is too sharp. This is the curse-of-expertise guard from
`philosophy.md`, applied at review time.

## Changelog format

Each entry records the reasoning and the domain influence, not only what moved:

```
## [version or date] - title
- Change: what is now possible / different.
- Why: the use case that pulled it.
- Domain influence: the theory it draws on (control / network-flow / neural / OR / ...).
- Languages: typescript, python (both, always, once features begin).
```

## Where things live

- `typescript/` and `python/` hold the two implementations (parity).
- `docs/` is language-agnostic: the design, this discipline, the philosophy.
- Domain demonstrations are examples, never core.

## On structure (not linear)

Linearity in the runner is a default, not a design limit. When a use case needs a
different shape (a DAG, a loop, feedback), that shape is a feature pulled in under
the rules above, in both languages. The library provides tools to solve problems;
it does not impose a topology.
